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
  DEFAULT_SETTINGS, GateState, LLMSettings, Message, Topic,
  TopicFileContent, TopicFileEntry,
} from "../types";
import { loadPersonas, runDebate } from "../debate/orchestrator";
import {
  getSessionStyle,
  setSessionStyle,
  setSessionModeratorApplies,
} from "../debate/styles";

export type BackendStatus = "unknown" | "online" | "offline";

const SETTINGS_KEY = "yuktiai_settings";

function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {/* ignore */}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: LLMSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
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
  });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("unknown");
  const [activeStyle, setActiveStyleState] = useState<DebateStyle>(() => getSessionStyle());

  // Personas loaded once at mount (raw .md bodies, never mutated after load)
  const personasRef = useRef<Record<AgentId, string> | null>(null);
  const basePersonasRef = useRef<Record<AgentId, string> | null>(null);
  // Base agent names derived from persona .md files
  const baseAgentNamesRef = useRef<AgentNames>(DEFAULT_AGENT_NAMES);

  // Refs for mutable orchestrator controls (no re-render needed)
  const pendingQRef = useRef<string | null>(null);
  const concludeFlagRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Active message id being streamed
  const activeIdRef = useRef<string | null>(null);

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
      .then(({ personas, agentNames: names }) => {
        personasRef.current = personas;
        basePersonasRef.current = personas;
        baseAgentNamesRef.current = names;
        // Will be overridden if a topic file has agent overrides, but set base now
        setAgentNames(names);
      })
      .catch(() => setError("Failed to load agent personas"));
  }, [loadTopicFile]);

  // ── Backend health check ─────────────────────────────────────────────────
  useEffect(() => {
    const url = settings.backendUrl.trim();
    if (!url) {
      setBackendStatus("unknown");
      return;
    }
    setBackendStatus("unknown");
    fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) })
      .then((r) => setBackendStatus(r.ok ? "online" : "offline"))
      .catch(() => setBackendStatus("offline"));
  }, [settings.backendUrl]);

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

  // ── Start debate ─────────────────────────────────────────────────────────
  const startDebate = useCallback(async (topic: Topic) => {
    const personas = personasRef.current as Record<AgentId, string> | null;
    if (!personas) {
      setError("Agent personas not loaded yet — please wait a moment and try again.");
      return;
    }
    const usingBackend = Boolean(settings.backendUrl.trim());
    if (!usingBackend && !settings.apiKey.trim()) {
      setError("No API key — open Settings and enter your key, or configure a backend server.");
      return;
    }

    // Cancel any running debate
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    concludeFlagRef.current = false;
    pendingQRef.current = null;
    activeIdRef.current = null;
    gateResolverRef.current = null;
    setGateState({ active: false, nextAgent: null, paused: false, delayMs: 0 });

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
          });
        });
      },
    };

    const callbacks = {
      onTurnStart: (agent: AgentId, turn: number) => {
        const id = nextId();
        activeIdRef.current = id;
        setMessages((prev) => [
          ...prev,
          { id, agent, content: "", turn, timestamp: new Date().toISOString(), streaming: true },
        ]);
      },
      onToken: (_agent: AgentId, token: string, _turn: number) => {
        const id = activeIdRef.current;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, content: m.content + token } : m)
        );
      },
      onTurnEnd: (_agent: AgentId, _content: string, _turn: number) => {
        const id = activeIdRef.current;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, streaming: false } : m)
        );
        activeIdRef.current = null;
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
      onDone: () => setStatus("done"),
    };

    // When a backend is configured, route all LLM calls through it.
    // The backend exposes an OpenAI-compatible /v1/chat/completions endpoint
    // and holds the API key server-side, so we don't need one in the browser.
    const effectiveSettings = usingBackend
      ? { ...settings, baseUrl: `${settings.backendUrl.trim()}/v1`, apiKey: "" }
      : settings;

    try {
      await runDebate(topic, personas, effectiveSettings, callbacks, control, getSessionStyle());
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(`Debate error: ${(err as Error).message}`);
      }
      setStatus("done");
    }
  }, [settings]);

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
    setStatus("done");
  }, []);

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
    activeStyle,
    setActiveStyle,
  };
}
