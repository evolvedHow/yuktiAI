/**
 * Debate Style loader — Communication Architecture + Language Plugin system.
 *
 * Styles are defined entirely in public/styles/:
 *   index.json          — registry that drives the sidebar dropdown
 *   <id>.md             — frontmatter (language module metadata) + body (communication arch prompt)
 *
 * Adding a new style: create a new .md file and add an entry to index.json.
 * No TypeScript changes required.
 *
 * The session singleton tracks the active style so the orchestrator can read it
 * at debate-start time without requiring the value to be threaded through props.
 */

import { load as yamlLoad } from "js-yaml";
import type { DebateStyle, LanguageModule, StyleIndexEntry } from "../types";

// ── Default (English — no style injection) ────────────────────────────────────

export const DEFAULT_ENGLISH_STYLE: DebateStyle = {
  id: "english",
  label: "English",
  communication_arch: null,
  language_module: null,
  moderatorApplies: true,
};

// ── Frontmatter parser ────────────────────────────────────────────────────────

interface FrontmatterDoc {
  label?: string;
  pair?: string;
  region?: string;
  script?: string;
  moderator_applies?: boolean;
  colloquials?: string[];
  grammar_rules?: string[];
}

function parseFrontmatter(text: string): { data: FrontmatterDoc; body: string } {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  return {
    data: yamlLoad(match[1]) as FrontmatterDoc,
    body: match[2],
  };
}

// ── Style loader ──────────────────────────────────────────────────────────────

/**
 * Fetches public/styles/index.json then loads each referenced .md file.
 * Returns a DebateStyle array ready to populate the sidebar dropdown.
 * The first entry (index 0) is always the default; English is always first by convention.
 */
export async function loadStyles(basePath: string): Promise<DebateStyle[]> {
  const res = await fetch(`${basePath}/styles/index.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load styles/index.json (HTTP ${res.status})`);
  const entries: StyleIndexEntry[] = await res.json();

  const styles: DebateStyle[] = await Promise.all(
    entries.map(async (entry): Promise<DebateStyle> => {
      if (!entry.file) {
        // Plain English — no arch, no module
        return { ...DEFAULT_ENGLISH_STYLE, id: entry.id, label: entry.label };
      }

      const mdRes = await fetch(`${basePath}/styles/${entry.file}`, { cache: "no-cache" });
      if (!mdRes.ok) throw new Error(`Could not load styles/${entry.file} (HTTP ${mdRes.status})`);
      const text = await mdRes.text();

      const { data, body } = parseFrontmatter(text);

      const module: LanguageModule = {
        id: entry.id,
        label: data.label ?? entry.label,
        pair: data.pair ?? "",
        region: data.region ?? "",
        script: data.script ?? "",
        colloquials: data.colloquials ?? [],
        grammar_rules: data.grammar_rules ?? [],
      };

      return {
        id: entry.id,
        label: entry.label,
        communication_arch: body.trim() || null,
        language_module: module,
        moderatorApplies: data.moderator_applies ?? true,
      };
    }),
  );

  return styles;
}

// ── Session-level active style singleton ──────────────────────────────────────
//
// Mutable ref shared by useDebate (writer) and the orchestrator (reader).
// Initialised to English; updated to loaded styles[0] once loadStyles() resolves.

let _sessionStyle: DebateStyle = { ...DEFAULT_ENGLISH_STYLE };

/** Returns the currently active debate style for this session. */
export function getSessionStyle(): DebateStyle {
  return _sessionStyle;
}

/** Sets the active style for this session (called when user picks in the sidebar). */
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
