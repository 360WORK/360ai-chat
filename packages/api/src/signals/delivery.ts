import { v5 as uuidv5 } from 'uuid';
import type { TSignalRun, TSignalRunsToolResult } from './dto';
import { mapSignalRunsResult } from './dto';

/**
 * Deterministic digest messageId for a signal run. Using uuid v5 (namespace +
 * name) makes `saveMessage`'s upsert idempotent: re-delivering the same run
 * updates the same message instead of creating a duplicate.
 */
export const SIGNAL_DIGEST_NAMESPACE = 'c1a5e7a0-5d8a-4b2e-9f1a-360a1c5e0001';

export function digestMessageId(runId: string): string {
  return uuidv5(`signal-digest:${runId}`, SIGNAL_DIGEST_NAMESPACE);
}

const DIGEST_HEADER_ICON = '🛰️';
const DIGEST_FALLBACK_NAME = 'Signal';
const DIGEST_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/**
 * The run's created_at formatted in the signal's timezone (UTC fallback when
 * the timezone is missing or invalid), or null for missing/invalid dates.
 */
export function formatRunTimestamp(iso: string | null, timezone?: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...DIGEST_DATE_OPTIONS,
      timeZone: timezone ?? 'UTC',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...DIGEST_DATE_OPTIONS, timeZone: 'UTC' }).format(
      date,
    );
  }
}

/**
 * The assistant-visible digest text for a run: an attribution header (signal
 * name + run date/time) followed by the run's trimmed summary, so interleaved
 * digests in the Signals conversation stay attributable.
 *
 * Runs without a summary (`no_change` or empty) are not deliverable — callers
 * filter them first; this function returns null for them as a guardrail.
 */
export function formatDigest(
  run: TSignalRun,
  timezone?: string | null,
): { text: string; messageId: string } | null {
  const summary = run.summary != null ? run.summary.trim() : '';
  if (summary === '') {
    return null;
  }
  // NOTE: a trailing `<!--signal-digest:RUN_ID-->` marker used to be appended
  // here for a future rich-card renderer, but the client strip that hides it
  // lives in render files that carry uncommitted WIP, so it showed raw.
  // The marker is dropped from stored text until that renderer exists; the
  // deterministic messageId (uuid-v5 of the run id) still makes delivery
  // idempotent, which is all that's needed.
  const name =
    run.signalName != null && run.signalName.trim() !== ''
      ? run.signalName.trim()
      : DIGEST_FALLBACK_NAME;
  const when = formatRunTimestamp(run.createdAt, timezone);
  const header =
    when != null
      ? `### ${DIGEST_HEADER_ICON} ${name} — ${when}`
      : `### ${DIGEST_HEADER_ICON} ${name}`;
  const text = `${header}\n\n${summary}`;
  return { text, messageId: digestMessageId(run.id) };
}

/** Shape of a partial IMessage accepted by the persistence seam. */
export interface DigestMessage {
  messageId: string;
  conversationId: string;
  text: string;
}

/**
 * Dependencies injected into delivery so it stays pure + unit-testable (no
 * direct Mongo / MCP imports). The `/api` route wires the real implementations.
 */
export interface SignalsDeliveryDeps {
  /** Fetch recent signal runs for the user (calls the `get_signal_runs` MCP tool). */
  fetchRuns: (user: { id: string }) => Promise<TSignalRunsToolResult>;
  /** Resolve the user's dedicated Signals conversation id (create-once, cache). */
  resolveConversationId: (user: { id: string }) => Promise<string>;
  /** Return the messageIds already present for the user (to skip redelivery). */
  existingMessageIds: (user: { id: string }, conversationId: string) => Promise<Set<string>>;
  /** Persist one digest assistant message. */
  saveMessage: (
    user: { id: string },
    conversationId: string,
    message: DigestMessage,
  ) => Promise<unknown>;
}

/**
 * Deliver all NEW deliverable signal runs as digest messages for the user.
 *
 * - Filters to runs with a non-empty summary (skips `no_change`/empty).
 * - De-duplicates against already-delivered message ids.
 * - One message per new run. Never throws — any fetch/persist error yields
 *   `{ delivered: 0 }` so the live client path is never broken.
 */
export async function deliverNewSignalRuns(
  user: { id: string },
  deps: SignalsDeliveryDeps,
): Promise<{ delivered: number }> {
  let result: TSignalRunsToolResult;
  try {
    result = await deps.fetchRuns(user);
  } catch {
    return { delivered: 0 };
  }

  const { signals, runs } = mapSignalRunsResult(result);
  const timezones = new Map(signals.map((s) => [s.id, s.timezone]));

  // Deliver newest-first so the conversation reads top-to-bottom chronologically
  // after a re-order; the tool already returns latest-first, so reverse for save.
  const deliverable = runs
    .map((r) => formatDigest(r, timezones.get(r.signalId)))
    .filter((d): d is { text: string; messageId: string } => d !== null);

  if (deliverable.length === 0) {
    return { delivered: 0 };
  }

  let conversationId: string;
  try {
    conversationId = await deps.resolveConversationId(user);
  } catch {
    return { delivered: 0 };
  }

  let existing: Set<string>;
  try {
    existing = await deps.existingMessageIds(user, conversationId);
  } catch {
    existing = new Set();
  }

  let delivered = 0;
  // Save oldest-first so the thread order is chronological.
  for (const digest of [...deliverable].reverse()) {
    if (existing.has(digest.messageId)) {
      continue;
    }
    try {
      await deps.saveMessage(user, conversationId, {
        messageId: digest.messageId,
        conversationId,
        text: digest.text,
      });
      delivered += 1;
    } catch {
      // Skip a single failed save; keep going for the rest.
    }
  }

  return { delivered };
}
