/**
 * useDebate — central React hook that owns all debate state and orchestration.
 *
 * Responsibilities:
 *  - Load topic-file index and agent personas on mount
 *  - Load topics (+ optional agent name overrides) from selected .yml file
 *  - Manage LLMSettings (read/write localStorage)
 *  - Drive the orchestrator and translate callbacks into React state updates
 *  - Expose controls: startDebate, askQuestion, requestConclusion, stopDebate
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { load as yamlLoad } from "js-yaml";
import {
  AgentId, AgentNames, DebateStatus, DebateStyle, DEFAULT_AGENT_NAMES,
  DEFAULT_SETTINGS, GatewayInfo, GateState, LLMSettings, Message, ReviewState,
  Topic, TopicFileContent, TopicFileEntry, TopicRegister, TurnReview,
} from "../types";
import { loadPersonas, runDebate } from "../debate/orchestrator";
import {
  describeConfigProblem,
  fetchGatewayInfo,
  normalizeGatewayUrl,
} from "../debate/gateway";
import { RevealQueue } from "../debate/typewriter";
import {
  DEFAULT_ENGLISH_STYLE,
  getSessionStyle,
  loadStyles,
  setSessionStyle,
  setSessionModeratorApplies,
} from "../debate/styles";

export type BackendStatus = "unknown" | "online" | "offline";

const SETTINGS_KEY = "yuktiai_settings";
const CUSTOM_TOPICS_KEY = "yuktiai_custom_topics";
const MAX_SAVED_CUSTOM_TOPICS = 12;

function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<LLMSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...stored,
        // Nested block needs its own merge so settings saved before the
        // typewriter existed still pick up the new defaults.
        typewriter: { ...DEFAULT_SETTINGS.typewriter, ...(stored.typewriter ?? {}) },
      };
    }
  } catch {/* ignore */}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: LLMSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadCustomTopics(): Topic[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TOPICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Topic =>
        typeof t === "object" && t !== null &&
        typeof (t as Topic).id === "string" && typeof (t as Topic).title === "string",
    );
  } catch {
    return [];
  }
}

let _msgCounter = 0;
function nextId() { return String(++_msgCounter); }

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDebate() {
  const [topicFiles, setTopicFiles] = useState<TopicFileEntry[]>([]);
  const [selectedTopicFile, setSelectedTopicFile] = useState<TopicFileEntry | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<DebateStatus>("idle");
  const [settings, setSettingsState] = useState<LLMSettings>(loadSettings);
  const [error, setError] = useState<string | null>(null);
  const [agentNames, setAgentNames] = useState<AgentNames>(DEFAULT_AGENT_NAMES);
  const [gateState, setGateState] = useState<GateState>({
    active: false,
    nextAgent: null,
    paused: false,
    delayMs: 0,
    autoAdvance: true,
  });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("unknown");
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null);
  const [debateStyles, setDebateStyles] = useState<DebateStyle[]>([DEFAULT_ENGLISH_STYLE]);
  const [activeStyle, setActiveStyleState] = useState<DebateStyle>(DEFAULT_ENGLISH_STYLE);
  const [customTopics, setCustomTopics] = useState<Topic[]>(loadCustomTopics);
  /** true while buffered text is still being typed onto the screen. */
  const [revealing, setRevealing] = useState(false);
  /** Which fact-check stage the current turn is in, for the status strip. */
  const [reviewState, setReviewState] = useState<ReviewState>("idle");

  // Personas loaded once at mount (raw .md bodies, never mutated after load)
  const personasRef = useRef<Record<AgentId, string> | null>(null);
  const basePersonasRef = useRef<Record<AgentId, string> | null>(null);
  // Shared sourcing rules + fact-checker prompt from public/agents/
  const evidencePolicyRef = useRef("");
  const checkerPersonaRef = useRef("");
  // Register guidance blocks (public/agents/register-*.md), injected per debate
  const registerBlocksRef = useRef<Partial<Record<TopicRegister, string>>>({});
  // Base agent names derived from persona .md files
  const baseAgentNamesRef = useRef<AgentNames>(DEFAULT_AGENT_NAMES);

  // Refs for mutable orchestrator controls (no re-render needed)
  const pendingQRef = useRef<string | null>(null);
  const concludeFlagRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Active message id being streamed
  const activeIdRef = useRef<string | null>(null);

  // Typewriter queue for the turn currently being revealed (one per turn)
  const revealRef = useRef<RevealQueue | null>(null);

  // Gate resolver ref — holds the resolve fn of the current waitForGate promise
  const gateResolverRef = useRef<(() => void) | null>(null);

  // ── Load a specific topic yml file ──────────────────────────────────────
  const loadTopicFile = useCallback(async (entry: TopicFileEntry, base: string) => {
    try {
      const res = await fetch(`${base}/topics/${entry.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = yamlLoad(text) as TopicFileContent;

      if (!parsed?.topics || !Array.isArray(parsed.topics)) {
        throw new Error("YAML file must have a 'topics' array");
      }

      setTopics(parsed.topics);

      // Sync moderatorApplies from yml style_config into active style
      const moderatorApplies = parsed.style_config?.moderator_applies ?? true;
      setSessionModeratorApplies(moderatorApplies);
      setActiveStyleState((prev) => ({ ...prev, moderatorApplies }));

      const agentIds: AgentId[] = ["moderator", "advocate", "critic"];

      // Apply persona_overlay: append to base persona body for each agent
      if (basePersonasRef.current) {
        const effective = { ...basePersonasRef.current } as Record<AgentId, string>;
        for (const id of agentIds) {
          const overlay = parsed.agents?.[id as "moderator" | "advocate" | "critic"]?.persona_overlay;
          if (overlay) {
            effective[id] = `${basePersonasRef.current[id].trimEnd()}\n\n---\n\n${overlay.trim()}`;
          }
        }
        personasRef.current = effective;
      }

      // Merge name, initial, and trait overrides from the yml file
      const overrides = parsed.agents ?? {};
      setAgentNames(() => {
        const base = baseAgentNamesRef.current;
        const merged = { ...base };
        for (const id of agentIds) {
          const ov = overrides[id as "moderator" | "advocate" | "critic"];
          if (ov) {
            merged[id as AgentId] = {
              name:    ov.name    ?? base[id as AgentId].name,
              initial: ov.initial ?? base[id as AgentId].initial,
              trait:   ov.trait,
            };
          } else {
            merged[id as AgentId] = { ...base[id as AgentId], trait: undefined };
          }
        }
        return merged;
      });
    } catch (err) {
      setError(`Failed to load topic file "${entry.file}": ${(err as Error).message}`);
    }
  }, []);

  // ── Load index + personas on mount ──────────────────────────────────────
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");

    // Load topic file index
    fetch(`${base}/topics/index.json`, { cache: "no-cache" })
      .then((r) => r.json())
      .then(async (entries: TopicFileEntry[]) => {
        setTopicFiles(entries);
        if (entries.length > 0) {
          setSelectedTopicFile(entries[0]);
          await loadTopicFile(entries[0], base);
        }
      })
      .catch(() => setError("Failed to load topics/index.json"));

    // Load agent personas from .md files
    loadPersonas(base)
      .then(({ personas, agentNames: names, evidencePolicy, checkerPersona, registerBlocks }) => {
        personasRef.current = personas;
        basePersonasRef.current = personas;
        baseAgentNamesRef.current = names;
        evidencePolicyRef.current = evidencePolicy;
        checkerPersonaRef.current = checkerPersona;
        registerBlocksRef.current = registerBlocks;
        // Will be overridden if a topic file has agent overrides, but set base now
        setAgentNames(names);
      })
      .catch(() => setError("Failed to load agent personas"));

    // Load debate styles from public/styles/index.json + .md files
    loadStyles(base)
      .then((styles) => {
        setDebateStyles(styles);
        // Initialise active style to the first entry (English by convention)
        const first = styles[0];
        setSessionStyle(first);
        setActiveStyleState(first);
      })
      .catch(() => setError("Failed to load styles/index.json"));
  }, [loadTopicFile]);

  // ── Gateway health + provider catalogue ──────────────────────────────────
  useEffect(() => {
    const url = normalizeGatewayUrl(settings.backendUrl);
    if (!url) {
      setBackendStatus("unknown");
      setGatewayInfo(null);
      return;
    }

    const controller = new AbortController();
    setBackendStatus("unknown");

    fetch(`${url}/health`, { signal: controller.signal })
      .then((r) => setBackendStatus(r.ok ? "online" : "offline"))
      .catch(() => { if (!controller.signal.aborted) setBackendStatus("offline"); });

    // The Python backend has no /providers route; a failure here just means
    // "no profile picker", not "gateway down".
    fetchGatewayInfo(url, controller.signal)
      .then(setGatewayInfo)
      .catch(() => { if (!controller.signal.aborted) setGatewayInfo(null); });

    return () => controller.abort();
  }, [settings.backendUrl]);

  // Keep the selected provider valid as the catalogue loads or changes.
  useEffect(() => {
    if (!gatewayInfo || gatewayInfo.providers.length === 0) return;
    const known = gatewayInfo.providers.some((p) => p.id === settings.gatewayProviderId);
    if (known) return;

    const fallback =
      gatewayInfo.providers.find((p) => p.id === gatewayInfo.defaultProvider) ??
      gatewayInfo.providers.find((p) => p.hasServerKey) ??
      gatewayInfo.providers[0];

    setSettingsState((prev) => {
      const next = { ...prev, gatewayProviderId: fallback.id };
      saveSettings(next);
      return next;
    });
  }, [gatewayInfo, settings.gatewayProviderId]);

  // ── Switch topic file ────────────────────────────────────────────────────
  const selectTopicFile = useCallback((file: string) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const entry = topicFiles.find((f) => f.file === file);
    if (!entry) return;
    setSelectedTopicFile(entry);
    void loadTopicFile(entry, base);
  }, [topicFiles, loadTopicFile]);

  // ── Active style ─────────────────────────────────────────────────────────
  const setActiveStyle = useCallback((style: DebateStyle) => {
    setSessionStyle(style);
    setActiveStyleState(style);
  }, []);

  // ── Settings ─────────────────────────────────────────────────────────────
  const updateSettings = useCallback((patch: Partial<LLMSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── Custom topics ────────────────────────────────────────────────────────
  const addCustomTopic = useCallback((topic: Topic) => {
    setCustomTopics((prev) => {
      const deduped = prev.filter(
        (t) => t.title.trim().toLowerCase() !== topic.title.trim().toLowerCase(),
      );
      const next = [topic, ...deduped].slice(0, MAX_SAVED_CUSTOM_TOPICS);
      localStorage.setItem(CUSTOM_TOPICS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCustomTopic = useCallback((id: string) => {
    setCustomTopics((prev) => {
      const next = prev.filter((t) => t.id !== id);
      localStorage.setItem(CUSTOM_TOPICS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Typewriter reveal ────────────────────────────────────────────────────
  /** Paints the rest of the current turn immediately. */
  const skipReveal = useCallback(() => {
    revealRef.current?.flush();
  }, []);

  /** Tears down the queue — used when a debate is aborted, replaced, or errors. */
  const abandonReveal = useCallback(() => {
    revealRef.current?.flush();
    revealRef.current = null;
    setRevealing(false);
  }, []);

  // ── Start debate ─────────────────────────────────────────────────────────
  const startDebate = useCallback(async (topic: Topic) => {
    const personas = personasRef.current as Record<AgentId, string> | null;
    if (!personas) {
      setError("Agent personas not loaded yet — please wait a moment and try again.");
      return;
    }
    const problem = describeConfigProblem(settings, gatewayInfo);
    if (problem) {
      setError(problem);
      return;
    }

    // Cancel any running debate
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    abandonReveal();
    concludeFlagRef.current = false;
    pendingQRef.current = null;
    activeIdRef.current = null;
    gateResolverRef.current = null;
    setGateState({
      active: false, nextAgent: null, paused: false, delayMs: 0, autoAdvance: settings.autoAdvance,
    });
    setRevealing(false);

    setActiveTopic(topic);
    setMessages([]);
    setStatus("active");
    setError(null);

    const control = {
      takePendingQuestion: () => {
        const q = pendingQRef.current;
        pendingQRef.current = null;
        return q;
      },
      shouldConclude: () => concludeFlagRef.current,
      signal: abortRef.current.signal,
      waitForGate: (nextAgent: AgentId): Promise<void> => {
        return new Promise<void>((resolve) => {
          gateResolverRef.current = resolve;
          setGateState({
            active: true,
            nextAgent,
            paused: false,
            delayMs: settings.interTurnDelayMs,
            autoAdvance: settings.autoAdvance,
          });
        });
      },
    };

    // A fresh queue per attempt, so a skip on one turn doesn't disable the
    // typewriter for the rest of the debate.
    const openRevealQueue = (id: string) => {
      revealRef.current = new RevealQueue(settings.typewriter, (chunk) => {
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, content: m.content + chunk } : m)
        );
      });
      setRevealing(settings.typewriter.enabled);
    };

    const callbacks = {
      onTurnStart: (agent: AgentId, turn: number) => {
        const id = nextId();
        activeIdRef.current = id;
        setMessages((prev) => [
          ...prev,
          { id, agent, content: "", turn, timestamp: new Date().toISOString(), streaming: true },
        ]);
        openRevealQueue(id);
        setReviewState("idle");
      },

      // A rejected turn is re-delivered into the same card: wipe what was there
      // and start a fresh reveal, so the audience sees one clean statement.
      onTurnRedo: (_agent: AgentId, _turn: number, _attempt: number) => {
        const id = activeIdRef.current;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, content: "", streaming: true } : m)
        );
        openRevealQueue(id);
        setReviewState("redoing");
      },

      onReviewStage: (stage: ReviewState) => setReviewState(stage),

      onReview: (_agent: AgentId, _turn: number, review: TurnReview) => {
        const id = activeIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, review } : m));
      },
      onToken: (_agent: AgentId, token: string, _turn: number) => {
        revealRef.current?.push(token);
      },
      onTurnEnd: async (_agent: AgentId, _content: string, _turn: number) => {
        // Wait for the buffered text to finish appearing before the next call.
        await revealRef.current?.close();
        revealRef.current = null;
        setRevealing(false);

        const id = activeIdRef.current;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, streaming: false } : m)
        );
        // activeIdRef stays set through the fact-check pass — a redo or a
        // review verdict still needs to find this card. onTurnStart replaces it.
      },
      onQuestionAck: (question: string, turn: number) => {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            agent: "audience" as AgentId,
            content: question,
            turn,
            timestamp: new Date().toISOString(),
            streaming: false,
          },
        ]);
      },
      onDone: () => {
        setReviewState("idle");
        setStatus("done");
      },
    };

    // runDebate resolves the endpoint per call (direct provider vs. gateway) —
    // see resolveEndpoint in debate/gateway.ts.
    try {
      await runDebate(topic, personas, settings, callbacks, control, getSessionStyle(), {
        evidencePolicy: evidencePolicyRef.current,
        checkerPersona: checkerPersonaRef.current,
        registerBlocks: registerBlocksRef.current,
        agentNames,
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(`Debate error: ${(err as Error).message}`);
      }
      abandonReveal();
      // If we aborted mid-stream, onTurnEnd never ran — stop the caret so the
      // partial turn isn't stuck blinking forever.
      const id = activeIdRef.current;
      if (id) {
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, streaming: false } : m));
      }
      setReviewState("idle");
      setStatus("done");
    }
  }, [settings, gatewayInfo, abandonReveal, agentNames]);

  // ── Audience controls ────────────────────────────────────────────────────
  const askQuestion = useCallback((question: string) => {
    pendingQRef.current = question.trim() || null;
  }, []);

  const requestConclusion = useCallback(() => {
    concludeFlagRef.current = true;
    setStatus("concluding");
  }, []);

  const stopDebate = useCallback(() => {
    abortRef.current?.abort();
    abandonReveal();
    // On a mid-stream abort onTurnEnd won't fire — clear the blinking caret.
    const id = activeIdRef.current;
    if (id) {
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, streaming: false } : m));
    }
    setReviewState("idle");
    setStatus("done");
  }, [abandonReveal]);

  const advanceTurn = useCallback(() => {
    const resolve = gateResolverRef.current;
    if (resolve) {
      gateResolverRef.current = null;
      setGateState((prev) => ({ ...prev, active: false }));
      resolve();
    }
  }, []);

  const pauseGate = useCallback(() => {
    setGateState((prev) => ({ ...prev, paused: true }));
  }, []);

  const resumeGate = useCallback(() => {
    setGateState((prev) => ({ ...prev, paused: false }));
  }, []);

  return {
    topicFiles,
    selectedTopicFile,
    selectTopicFile,
    topics,
    customTopics,
    addCustomTopic,
    removeCustomTopic,
    activeTopic,
    messages,
    status,
    settings,
    updateSettings,
    error,
    agentNames,
    startDebate,
    askQuestion,
    requestConclusion,
    stopDebate,
    gateState,
    advanceTurn,
    pauseGate,
    resumeGate,
    backendStatus,
    gatewayInfo,
    revealing,
    skipReveal,
    reviewState,
    debateStyles,
    activeStyle,
    setActiveStyle,
  };
}
