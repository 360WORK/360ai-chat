/**
 * Signal briefing card — schema + parsing.
 *
 * When the agent sets up or confirms a signal, it emits EXACTLY ONE fenced block
 * describing the signal, which the chat renders as a card instead of a markdown
 * table:
 *
 *     ```signal-card
 *     { "name": "...", "cadence": "...", "nextRun": "...", "deliversTo": "...", "whatYouGet": "..." }
 *     ```
 *
 * This module parses that block into a typed card and strips it from rendered
 * markdown — the chat render paths (MessageContent, Parts/Text) compose
 * `stripSignalCardMarkers` with the onboarding + confirm strips, and render the
 * card inline; users shouldn't see the raw JSON. Mirrors the acumen-confirm
 * inline-block pattern (confirmSchema.ts).
 */

/** A signal briefing the agent presents when setting up or confirming a signal. */
export interface SignalCardData {
  /** The signal's name (e.g. "Weekly Market & Desk Pulse"). */
  name: string;
  /** Human cadence (e.g. "Every Monday, 8:00 AM UK time"). */
  cadence?: string;
  /** When it next runs (e.g. "Monday 20 July 2026"). */
  nextRun?: string;
  /** Delivery channels (e.g. "Signals feed + in-app notification"). */
  deliversTo?: string;
  /** What the briefing contains (e.g. "A ranked briefing across all active roles..."). */
  whatYouGet?: string;
}

/** Regex matching the fenced signal-card block; captures the JSON body in group 1. */
export const SIGNAL_CARD_BLOCK = /```signal-card\s*\n([\s\S]*?)```/i;

/** Global variant of the block regex, for stripping every occurrence. */
const SIGNAL_CARD_BLOCK_ALL = /```signal-card\s*\n[\s\S]*?```/gi;

/** A trimmed string, or undefined when the field is missing/empty. */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Parse the first signal-card fenced block in `text` into a card.
 * Returns null when there is no block, the JSON is invalid, or there is no name
 * plus at least one detail field (nothing worth rendering).
 */
export function extractSignalCard(text: string): SignalCardData | null {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  const match = SIGNAL_CARD_BLOCK.exec(text);
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
  const name = optionalString(obj.name);
  if (name === undefined) {
    return null;
  }
  const card: SignalCardData = { name };
  card.cadence = optionalString(obj.cadence);
  card.nextRun = optionalString(obj.nextRun);
  card.deliversTo = optionalString(obj.deliversTo);
  card.whatYouGet = optionalString(obj.whatYouGet);
  const hasDetail =
    card.cadence !== undefined ||
    card.nextRun !== undefined ||
    card.deliversTo !== undefined ||
    card.whatYouGet !== undefined;
  return hasDetail ? card : null;
}

/**
 * Strip an unclosed trailing opener (a block still streaming in token-by-token)
 * by cutting from its first remaining occurrence to the end. Called AFTER
 * complete blocks are removed, so any occurrence left is unclosed — but only cut
 * when no closer follows.
 */
function stripUnclosedTail(text: string, opener: string, closer: string): string {
  const idx = text.indexOf(opener);
  if (idx === -1 || text.indexOf(closer, idx + opener.length) !== -1) {
    return text;
  }
  return text.slice(0, idx);
}

/**
 * Strip signal-card blocks from text, collapsing the blank lines a trailing
 * block can leave behind. Also strips a trailing UNCLOSED fence so raw JSON never
 * flashes while a block streams in before its closing fence has arrived.
 */
export function stripSignalCardMarkers(text: string): string {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }
  let stripped = text.replace(SIGNAL_CARD_BLOCK_ALL, '');
  stripped = stripUnclosedTail(stripped, '```signal-card', '```');
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}
