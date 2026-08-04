/**
 * Signal run DTO + delivery contracts for the chat.360ai Signals surface.
 *
 * The Laravel `get_signal_runs` MCP tool returns snake_case JSON; these are the
 * camelCase shapes used internally and by the client. Source of truth for the
 * wire shape: `get_signal_runs` tool in the Laravel provider repo.
 */

/** A recruiter Signal (owned or subscribed). */
export interface TSignalSummary {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  /** IANA timezone the cadence is evaluated in (optional on the wire). */
  timezone: string | null;
}

/** A single run of a Signal, surfaced for chat delivery. */
export interface TSignalRun {
  id: string;
  signalId: string;
  signalName: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'no_change';
  /** Markdown summary; null for no_change / empty runs (never delivered). */
  summary: string | null;
  createdAt: string | null;
  /** Failure detail for `failed` runs (optional on the wire). */
  error: string | null;
}

/** Raw snake_case shape returned by the `get_signal_runs` MCP tool. */
export interface TSignalRunsToolResult {
  signals: Array<{
    id: string;
    name: string;
    type: string;
    is_active: boolean;
    next_run_at: string | null;
    last_run_at: string | null;
    timezone?: string | null;
  }>;
  runs: Array<{
    id: string;
    signal_id: string;
    signal_name: string | null;
    status: TSignalRun['status'];
    summary: string | null;
    created_at: string | null;
    error?: string | null;
  }>;
}

/** Response of `GET /api/signals/sync`. */
export interface TSignalsSyncResponse {
  /** Number of NEW digest messages persisted this sync (0 when nothing new). */
  delivered: number;
}

/** Maps the raw MCP tool result to the internal camelCase DTOs. */
export function mapSignalRunsResult(raw: TSignalRunsToolResult): {
  signals: TSignalSummary[];
  runs: TSignalRun[];
} {
  return {
    signals: (raw?.signals ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      isActive: !!s.is_active,
      nextRunAt: s.next_run_at ?? null,
      lastRunAt: s.last_run_at ?? null,
      timezone: s.timezone ?? null,
    })),
    runs: (raw?.runs ?? []).map((r) => ({
      id: r.id,
      signalId: r.signal_id,
      signalName: r.signal_name ?? null,
      status: r.status,
      summary: r.summary ?? null,
      createdAt: r.created_at ?? null,
      error: r.error ?? null,
    })),
  };
}
