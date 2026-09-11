/**
 * RevealQueue — paces streamed text onto the screen like a typewriter.
 *
 * Models stream in bursts: a whole sentence can land in one frame, which is
 * hard to follow. This sits between the stream and React state, buffering what
 * arrives and releasing it at a steady rate.
 *
 * One queue per turn:
 *
 *   const q = new RevealQueue(cfg, (chunk) => appendToMessage(chunk));
 *   for await (const token of stream) q.push(token);
 *   await q.close();   // resolves once the buffer has drained on screen
 *
 * The debate orchestrator awaits close(), so the next LLM call does not start
 * until the previous speaker has finished appearing.
 */

import type { TypewriterSettings } from "../types";

/** ~30 fps. Fractional budget is carried across ticks, so rates below one unit
 *  per tick (any word-mode setting) still come out at the requested speed. */
const TICK_MS = 33;

export class RevealQueue {
  private buffer = "";
  /** Fractional units earned but not yet spent. */
  private credit = 0;
  private inputClosed = false;
  /** Set by flush() — everything from here on is emitted immediately. */
  private bypassed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private drainWaiters: Array<() => void> = [];

  constructor(
    private readonly config: TypewriterSettings,
    private readonly emit: (chunk: string) => void,
  ) {}

  /** true while there is buffered text still waiting to appear. */
  get pending(): boolean {
    return this.buffer.length > 0;
  }

  /** Queue newly streamed text. */
  push(text: string): void {
    if (!text) return;
    if (!this.config.enabled || this.bypassed) {
      this.emit(text);
      return;
    }
    this.buffer += text;
    this.schedule();
  }

  /**
   * Signals that no more text is coming.
   * Resolves once everything buffered has been emitted.
   */
  close(): Promise<void> {
    this.inputClosed = true;
    if (!this.buffer) {
      this.stopTimer();
      return Promise.resolve();
    }
    this.schedule();
    return new Promise<void>((resolve) => this.drainWaiters.push(resolve));
  }

  /** Abandon pacing and paint the rest at once (skip button, abort, unmount). */
  flush(): void {
    this.bypassed = true;
    if (this.buffer) {
      this.emit(this.buffer);
      this.buffer = "";
    }
    this.stopTimer();
    this.settle();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private schedule(): void {
    if (this.timer !== null || this.bypassed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, TICK_MS);
  }

  private tick(): void {
    if (this.bypassed) return;

    // Cap the carry at one second's worth so a long wait for the rest of a word
    // cannot bank enough credit to dump a paragraph in a single frame.
    const perTick = (this.config.unitsPerSecond * TICK_MS) / 1000;
    this.credit = Math.min(this.credit + perTick, Math.max(1, this.config.unitsPerSecond));

    const units = Math.floor(this.credit);
    if (units >= 1) {
      const chunk = this.take(units);
      // Nothing taken means we are mid-word — keep the credit and try again.
      if (chunk) {
        this.credit -= units;
        this.emit(chunk);
      }
    }

    if (this.buffer) {
      // Still text to show, or waiting on a word to complete — keep ticking.
      this.schedule();
    } else if (this.inputClosed) {
      this.settle();
    }
  }

  /** Removes and returns up to `units` chars/words from the front of the buffer. */
  private take(units: number): string {
    if (this.config.mode === "char") {
      const end = Math.min(units, this.buffer.length);
      const chunk = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end);
      return chunk;
    }

    let end = 0;
    for (let i = 0; i < units; i++) {
      const boundary = this.nextWordBoundary(end);
      if (boundary < 0) {
        // No complete word left. If the stream is done, the tail is all there
        // will ever be, so release it; otherwise wait for more text.
        if (this.inputClosed) end = this.buffer.length;
        break;
      }
      end = boundary;
    }

    if (end === 0) return "";
    const chunk = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end);
    return chunk;
  }

  /**
   * Index just past the next word + its trailing whitespace, or -1 when the
   * remaining text has no whitespace yet (i.e. the word is still streaming in).
   */
  private nextWordBoundary(from: number): number {
    const pattern = /\S*\s+/y;
    pattern.lastIndex = from;
    return pattern.exec(this.buffer) ? pattern.lastIndex : -1;
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private settle(): void {
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
