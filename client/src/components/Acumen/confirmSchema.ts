/**
 * Acumen mid-point confirmation frame — schema + parsing.
 *
 * Per the Foundations layer, the agent emits EXACTLY ONE fenced block at the
 * single mid-point before the expensive step of a use case, asking the user to
 * confirm or adjust the frame:
 *
 *     ```acumen-confirm
 *     { "id": "...", "title": "...", "summary": "...", "confirmLabel": "...", "adjustLabel": "..." }
 *     ```
 *
 * This module parses that block into a typed frame and strips it from rendered
 * markdown — the chat render paths (MessageContent, Parts/Text) compose
 * `stripConfirmMarkers` with the onboarding strip, and the dock renders the
 * frame; users shouldn't see the raw JSON.
 * Mirrors the onboarding inline-block pattern (onboardingSchema.ts) but is
 * standalone so the Acumen confirm surface owns no cross-cutting dependency.
 */

/** The confirmation frame the agent emits before the expensive step. */
export interface AcumenConfirmFrame {
  /** Short kebab id for this confirmation point (stable across one pass). */
  id: string;
  /** What the agent is about to do (e.g. "Run the longlist search"). */
  title: string;
  /** The frame as the agent understood it: who/what/where/constraints. */
  summary: string;
  /** Button label for proceeding; defaults to "Confirm". */
  confirmLabel?: string;
  /** Button label for adjusting; defaults to "Adjust". */
  adjustLabel?: string;
}

/** Regex matching the fenced acumen-confirm block; captures the JSON body in group 1. */
export const ACUMEN_CONFIRM_BLOCK = /```acumen-confirm\s*\n([\s\S]*?)```/i;

/** Global variant of the block regex, for stripping every occurrence. */
const ACUMEN_CONFIRM_BLOCK_ALL = /```acumen-confirm\s*\n[\s\S]*?```/gi;

/** Regex matching the bare HTML-comment marker (lightweight fallback signal). */
export const ACUMEN_CONFIRM_MARKER = /<!--\s*acumen-confirm:([a-z0-9_-]+)\s*-->/gi;

/**
 * Parse the first acumen-confirm fenced block in `text` into a frame.
 * Returns null when there is no block or the JSON is missing/invalid/empty.
 * Defensively validates required string fields; unknown keys are ignored.
 */
export function extractConfirmFrame(text: string): AcumenConfirmFrame | null {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  const match = ACUMEN_CONFIRM_BLOCK.exec(text);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  // id + title + summary are required; without them there is nothing to confirm.
  if (id === '' || title === '' || summary === '') {
    return null;
  }
  const frame: AcumenConfirmFrame = { id, title, summary };
  if (typeof obj.confirmLabel === 'string' && obj.confirmLabel.trim() !== '') {
    frame.confirmLabel = obj.confirmLabel.trim();
  }
  if (typeof obj.adjustLabel === 'string' && obj.adjustLabel.trim() !== '') {
    frame.adjustLabel = obj.adjustLabel.trim();
  }
  return frame;
}

/** Does the text contain an acumen-confirm block? */
export function hasConfirmBlock(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }
  return ACUMEN_CONFIRM_BLOCK.test(text);
}

/**
 * Strip an unclosed trailing opener (a block still streaming in token-by-token)
 * by cutting from its first remaining occurrence to the end. Called AFTER
 * complete blocks/markers are removed, so any occurrence left is unclosed —
 * but only cut when no closer follows.
 */
function stripUnclosedTail(text: string, opener: string, closer: string): string {
  const idx = text.indexOf(opener);
  if (idx === -1 || text.indexOf(closer, idx + opener.length) !== -1) {
    return text;
  }
  return text.slice(0, idx);
}

/**
 * Strip acumen-confirm blocks + bare markers from text, collapsing the blank
 * lines a trailing block can leave behind. Safe to call on any message text.
 * Also strips a trailing UNCLOSED fence/marker so raw JSON never flashes while
 * a block streams in before its closing fence has arrived.
 */
export function stripConfirmMarkers(text: string): string {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }
  let stripped = text.replace(ACUMEN_CONFIRM_BLOCK_ALL, '').replace(ACUMEN_CONFIRM_MARKER, '');
  stripped = stripUnclosedTail(stripped, '```acumen-confirm', '```');
  stripped = stripUnclosedTail(stripped, '<!--acumen-confirm', '-->');
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}
