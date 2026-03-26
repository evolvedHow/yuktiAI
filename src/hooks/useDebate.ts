/**
 * useDebate — central React hook that owns all debate state and orchestration.
 *
 * Responsibilities:
 *  - Load topics and agent personas on mount
 *  - Manage LLMSettings (read/write localStorage)
 *  - Drive the orchestrator and translate callbacks into React state updates
 *  - Expose controls: startDebate, askQuestion, requestConclusion, stopDebate
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentId, DebateStatus, DEFAULT_SETTINGS, LLMSettings, Message, Topic } from "../types";
import { loadPersonas, runDebate } from "../debate/orchestrator";

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
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<DebateStatus>("idle");
  const [settings, setSettingsState] = useState<LLMSettings>(loadSettings);
  const [error, setError] = useState<string | null>(null);

  // Personas loaded once at mount
  const personasRef = useRef<Record<AgentId, string> | null>(null);

  // Refs for mutable orchestrator controls (no re-render needed)
  const pendingQRef = useRef<string | null>(null);
  const concludeFlagRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Active message id being streamed
  const activeIdRef = useRef<string | null>(null);

  // ── Load topics + personas ───────────────────────────────────────────────
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/topics.json`)
      .then((r) => r.json())
      .then((data: Topic[]) => setTopics(data))
      .catch(() => setError("Failed to load topics.json"));

    loadPersonas(base)
      .then((p) => { personasRef.current = p; })
      .catch(() => setError("Failed to load agent personas"));
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
    const personas = personasRef.current;
    if (!personas) {
      setError("Agent personas not loaded yet — please wait a moment and try again.");
      return;
    }
    if (!settings.apiKey.trim()) {
      setError("No API key — open Settings and enter your key.");
      return;
    }

    // Cancel any running debate
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    concludeFlagRef.current = false;
    pendingQRef.current = null;
    activeIdRef.current = null;

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

    try {
      await runDebate(topic, personas, settings, callbacks, control);
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

  return {
    topics,
    activeTopic,
    messages,
    status,
    settings,
    updateSettings,
    error,
    startDebate,
    askQuestion,
    requestConclusion,
    stopDebate,
  };
}
