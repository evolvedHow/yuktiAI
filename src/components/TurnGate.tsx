/**
 * TurnGate — inter-turn countdown bar shown between debate turns.
 *
 * Shows who speaks next, an animated progress bar, and controls to
 * pause the countdown or advance immediately.
 */
import { useEffect, useRef, useState } from "react";
import { AgentId, AgentNames, GateState } from "../types";

// Tailwind color classes per agent
const BAR_COLOR: Record<AgentId, string> = {
  moderator: "bg-blue-500",
  advocate:  "bg-emerald-500",
  critic:    "bg-rose-500",
  audience:  "bg-violet-500",
};

const LABEL_COLOR: Record<AgentId, string> = {
  moderator: "text-blue-700",
  advocate:  "text-emerald-700",
  critic:    "text-rose-700",
  audience:  "text-violet-700",
};

interface Props {
  gate: GateState;
  agentNames: AgentNames;
  onAdvance: () => void;
  onPause: () => void;
  onResume: () => void;
}

const TICK_MS = 100;

export function TurnGate({ gate, agentNames, onAdvance, onPause, onResume }: Props) {
  const [remaining, setRemaining] = useState(gate.delayMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // track the onAdvance callback in a ref so the interval closure stays fresh
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => { onAdvanceRef.current = onAdvance; }, [onAdvance]);

  // Reset remaining when a new gate opens
  useEffect(() => {
    if (gate.active) setRemaining(gate.delayMs);
  }, [gate.active, gate.delayMs]);

  // Run / pause the tick
  useEffect(() => {
    if (!gate.active || gate.paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        const next = r - TICK_MS;
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          onAdvanceRef.current();
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [gate.active, gate.paused]);

  if (!gate.active || !gate.nextAgent) return null;

  const agent = gate.nextAgent;
  const pct = gate.delayMs > 0
    ? Math.min(100, ((gate.delayMs - remaining) / gate.delayMs) * 100)
    : 100;
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="flex items-center gap-3 mx-2 my-1.5 px-4 py-2.5 rounded-xl bg-white border border-border shadow-sm select-none">
      {/* Who's next */}
      <span className={`text-xs font-semibold shrink-0 ${LABEL_COLOR[agent]}`}>
        Next&thinsp;·&thinsp;{agentNames[agent].name}
      </span>

      {/* Clickable progress bar */}
      <button
        onClick={onAdvance}
        title="Click to advance now"
        className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden hover:opacity-75 transition-opacity"
        aria-label="Advance to next turn"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${BAR_COLOR[agent]}`}
          style={{ width: `${pct}%` }}
        />
      </button>

      {/* Countdown */}
      <span className="text-[11px] tabular-nums text-muted w-5 text-right shrink-0">
        {gate.paused ? "—" : `${secs}s`}
      </span>

      {/* Pause / Resume */}
      <button
        onClick={gate.paused ? onResume : onPause}
        title={gate.paused ? "Resume countdown" : "Pause countdown"}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-muted hover:text-ink transition-colors text-xs"
        aria-label={gate.paused ? "Resume" : "Pause"}
      >
        {gate.paused ? "▶" : "⏸"}
      </button>

      {/* Skip arrow */}
      <button
        onClick={onAdvance}
        title="Next turn now"
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-muted hover:text-ink transition-colors text-sm font-medium"
        aria-label="Skip to next turn"
      >
        →
      </button>
    </div>
  );
}
