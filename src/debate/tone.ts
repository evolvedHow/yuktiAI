/**
 * Global debate tone singleton.
 *
 * Tone is a single user choice, not a property of any topic. `useDebate` writes
 * it here whenever the setting changes; the orchestrator reads it at the start
 * of every turn, so flipping the tone mid-debate takes effect on the very next
 * speaker without restarting the debate.
 */

import { DEFAULT_TOPIC_TONE, TopicTone } from "../types";

let _sessionTone: TopicTone = DEFAULT_TOPIC_TONE;

/** Returns the tone currently in force for this session. */
export function getSessionTone(): TopicTone {
  return _sessionTone;
}

/** Sets the tone in force for this session (called by useDebate on change). */
export function setSessionTone(tone: TopicTone): void {
  _sessionTone = tone;
}
