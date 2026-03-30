/**
 * Debate Style definitions — Communication Architecture + Language Plugin system.
 *
 * Each style carries:
 *   - communication_arch: base prompt injected into agent system prompts to
 *     drive intra-sentential code-switching, anti-formalism, and filler integration.
 *   - language_module: metadata (colloquials, grammar rules) appended after the arch block.
 *   - moderatorApplies: whether the style block is injected for the moderator agent.
 *     Defaults to true; can be overridden per topic file via style_config.
 *
 * Style selection is session-scoped (user picks per session, not persisted).
 * A module-level singleton tracks the active style so it is accessible to the
 * orchestrator without requiring it to be threaded through App.tsx props.
 */

import type { DebateStyle } from "../types";

// ── Style definitions ─────────────────────────────────────────────────────────

export const DEBATE_STYLES: DebateStyle[] = [
  {
    id: "english",
    label: "English",
    communication_arch: null,
    language_module: null,
    moderatorApplies: true,
  },
  {
    id: "hinglish",
    label: "Hinglish",
    communication_arch:
      "You speak in Hinglish — a natural blend of Hindi and English as spoken in Delhi and Mumbai. " +
      "Code-switch within sentences (intra-sentential), not just between them. " +
      "Avoid over-formal language: skip redundant phrases, keep it punchy and real. " +
      "Naturally weave in Hindi words where they feel more expressive: yaar, arre, bilkul, theek hai, bas, dekho. " +
      "Mix English verbs with Hindi grammatical endings: \"check kar lo\", \"sort kar denge\", \"discuss karte hain\". " +
      "Use Hindi postpositions after English nouns: \"meeting mein\", \"issue ke saath\", \"point pe\". " +
      "Do NOT translate every phrase. Stay conversational and unscripted.",
    language_module: {
      id: "hinglish",
      label: "Hinglish",
      pair: "Hindi–English",
      region: "Delhi / Mumbai",
      script: "Romanized Hindi",
      colloquials: ["sorted hai", "scene kya hai", "bakwas", "jugad", "yaar", "arre"],
      grammar_rules: [
        "English verb + Hindi ending: check kar lo, discuss karte hain",
        "Hindi postpositions after English nouns: meeting mein, issue ke saath, point pe",
        "Hindi sentence-final particles: theek hai, bas, bilkul",
      ],
    },
    moderatorApplies: true,
  },
  {
    id: "tanglish",
    label: "Tanglish",
    communication_arch:
      "You speak in Tanglish — a natural blend of Tamil and English as spoken in Chennai. " +
      "Code-switch within sentences (intra-sentential), not just between them. " +
      "Avoid over-formal language: be direct, warm, and expressive. " +
      "Attach Tamil suffixes to English words naturally: \"super-ah iruku\", \"wait-u pannu\", \"confirm-a pannunga\". " +
      "Use Tamil discourse markers freely: da, pa, machi (for close peers), -ah for questions. " +
      "Express enthusiasm or surprise with Tamil words: sema, vera level, gethu, appidiya. " +
      "Do NOT over-translate. Keep it natural and unscripted.",
    language_module: {
      id: "tanglish",
      label: "Tanglish",
      pair: "Tamil–English",
      region: "Chennai",
      script: "Romanized Tamil",
      colloquials: ["sema", "machi", "vera level", "gethu", "appidiya", "da", "pa"],
      grammar_rules: [
        "Tamil suffixes on English adjectives/states: super-ah iruku, correct-ah sonna",
        "Tamil suffixes on English verbs: wait-u pannu, check-u panni paaru",
        "Tamil question particle -ah appended: correct-ah, ready-ah, done-ah",
        "Discourse markers da/pa after statements: romba nalla da, try pannuven pa",
      ],
    },
    moderatorApplies: true,
  },
];

// ── Session-level active style singleton ──────────────────────────────────────
//
// Shared mutable ref so that Sidebar can update the active style and the
// orchestrator can read it at debate-start, without routing through App.tsx.

let _sessionStyle: DebateStyle = { ...DEBATE_STYLES[0] };

/** Returns the currently active debate style for this session. */
export function getSessionStyle(): DebateStyle {
  return _sessionStyle;
}

/** Sets the active style for this session (called by the Sidebar style picker). */
export function setSessionStyle(style: DebateStyle): void {
  _sessionStyle = { ...style };
}

/**
 * Overrides only the moderatorApplies flag on the active session style.
 * Called by useDebate when a topic file with style_config is loaded.
 */
export function setSessionModeratorApplies(value: boolean): void {
  _sessionStyle = { ..._sessionStyle, moderatorApplies: value };
}
