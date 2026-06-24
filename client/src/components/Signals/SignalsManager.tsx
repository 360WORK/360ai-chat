import { useMemo, useState } from 'react';
import { useLocalize } from '~/hooks';
import {
  useSignalsQuery,
  useCreateSignal,
  useUpdateSignal,
  useRunSignalNow,
  useDeleteSignal,
  useSignalLatestRunQuery,
} from '~/data-provider/Signals/queries';
import type { TSignal } from 'librechat-data-provider';
import CadencePicker, { describeCron } from './CadencePicker';

/**
 * Default tool_plan for a created/edited signal. Tool selection is automatic —
 * users never pick tools. This default runs the broadest available read tool so
 * the summariser has platform data to work with. (Web search + richer
 * auto-detection are a separate engine capability — see the spec's blockers.)
 */
const DEFAULT_TOOL_PLAN = [{ tool: 'list_jobs' as const }];

type Draft = {
  name: string;
  prompt: string;
  cadence: string;
};

const emptyDraft = (): Draft => ({ name: '', prompt: '', cadence: '0 8 * * 1' });

/** Format an ISO timestamp for display, or show a placeholder. */
function fmt(iso: string | null, localize: (k: 'com_signals_never') => string): string {
  if (!iso) {
    return localize('com_signals_never');
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? localize('com_signals_never') : d.toLocaleString();
}

const TERMINAL = new Set(['succeeded', 'failed', 'no_change']);

/** Inline result of a just-polled Run: spinner while running, digest when done. */
function RunResult({
  status,
  summary,
  localize,
  onDismiss,
}: {
  status: string;
  summary: string | null;
  localize: (k: string) => string;
  onDismiss: () => void;
}) {
  const done = TERMINAL.has(status);
  if (!done) {
    return null; // the button spinner already conveys "running"
  }
  const failed = status === 'failed';
  const nothing = status === 'no_change' || !summary;
  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-sm ${
        failed
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-border-light bg-surface-secondary text-text-primary'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase opacity-70">
          {failed
            ? localize('com_signals_result_failed')
            : nothing
              ? localize('com_signals_result_nothing')
              : localize('com_signals_result_done')}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {localize('com_signals_dismiss')}
        </button>
      </div>
      {nothing ? null : <div className="whitespace-pre-line text-sm">{summary}</div>}
    </div>
  );
}

export default function SignalsManager() {
  const localize = useLocalize();
  const loc = localize as unknown as (k: string) => string;
  const { data, isLoading, isError } = useSignalsQuery();
  const createSignal = useCreateSignal();
  const updateSignal = useUpdateSignal();
  const runSignalNow = useRunSignalNow();
  const deleteSignal = useDeleteSignal();

  // null = closed (create) ; string = editing that signal id.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Signal id whose Run is being polled to completion (shows inline spinner + result).
  const [pollingSignalId, setPollingSignalId] = useState<string | null>(null);

  const signals: TSignal[] = useMemo(() => data?.signals ?? [], [data]);
  const editing = editingId ? (signals.find((s) => s.id === editingId) ?? null) : null;

  // Per-signal run state: only the signal whose id matches the in-flight
  // mutation's variables is "running". `isLoading` alone would disable every
  // Run button at once.
  const runningId =
    runSignalNow.isLoading && typeof runSignalNow.variables === 'string'
      ? runSignalNow.variables
      : null;

  // Poll the latest run for the signal we just clicked Run on, until terminal.
  const latestRun = useSignalLatestRunQuery(pollingSignalId, {
    enabled: pollingSignalId !== null,
  });
  // The signal currently in-flight (spinner shown): the mutating one, OR the
  // polled one whose latest run is still non-terminal. Once the poll sees a
  // terminal status this becomes null → the button reverts to "Run now" while
  // the result card stays visible (dismissable) via pollingSignalId.
  const pollingNotDone =
    pollingSignalId !== null && (!latestRun.data || !TERMINAL.has(latestRun.data.status));
  const inFlightId = runningId ?? (pollingNotDone ? pollingSignalId : null);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
    setShowCreate(true);
  };

  const openEdit = (s: TSignal) => {
    setDraft({
      name: s.name,
      prompt: s.promptTemplate ?? '',
      cadence: s.cadenceCron ?? '0 8 * * 1',
    });
    setError(null);
    setShowCreate(false);
    setEditingId(s.id);
  };

  const closeForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      cadence: draft.cadence.trim(),
    };
    if (payload.name === '' || payload.prompt === '') {
      setError(localize('com_signals_error_required'));
      return;
    }
    try {
      if (editing) {
        await updateSignal.mutateAsync({
          id: editing.id,
          input: {
            name: payload.name,
            action_config: { prompt_template: payload.prompt },
            trigger_config: { cadence_cron: payload.cadence, timezone: 'UTC' },
          },
        });
      } else {
        await createSignal.mutateAsync({
          name: payload.name,
          type: 'briefing',
          trigger_config: { cadence_cron: payload.cadence, timezone: 'UTC' },
          action_config: {
            agent_key: 'recruiting',
            prompt_template: payload.prompt,
            tool_plan: DEFAULT_TOOL_PLAN,
          },
          delivery_channels: ['chat_feed', 'inapp'],
        });
      }
      closeForm();
    } catch (err) {
      setError(
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : editing
            ? localize('com_signals_error_update')
            : localize('com_signals_error_create'),
      );
    }
  };

  const handleRun = async (id: string) => {
    setNotice(null);
    setError(null);
    // Clear any stale run result for this signal so the spinner stays on until
    // the fresh run's status is fetched (avoids a flicker if re-running).
    latestRun.remove?.();
    setPollingSignalId(id);
    try {
      await runSignalNow.mutateAsync(id);
      // Polling is now active via useSignalLatestRunQuery(pollingSignalId).
      // The hook stops itself once the run is terminal, then we clear it.
    } catch {
      setError(localize('com_signals_error_run'));
      setPollingSignalId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(localize('com_signals_confirm_delete').replace('{name}', name))) {
      return;
    }
    try {
      await deleteSignal.mutateAsync(id);
    } catch {
      /* silent */
    }
  };

  const formOpen = showCreate || editing !== null;
  const submitting = createSignal.isLoading || updateSignal.isLoading;
  const formTitle = editing ? localize('com_signals_edit_title') : localize('com_signals_new');

  return (
    <div className="flex h-full w-full flex-col bg-surface-primary-alt">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-text-primary">
              {localize('com_signals_title')}
            </h1>
            {!formOpen ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                {localize('com_signals_new')}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-text-secondary">{localize('com_signals_subtitle')}</p>

          {notice ? (
            <p className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {formOpen ? (
            <form
              onSubmit={handleSubmit}
              className="mt-4 space-y-4 rounded-xl border border-border-light bg-surface-primary p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text-primary">{formTitle}</p>
                <button
                  type="button"
                  onClick={closeForm}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  {localize('com_signals_cancel')}
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary">
                  {localize('com_signals_field_name')}
                </label>
                <input
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder={localize('com_signals_field_name_ph')}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary">
                  {localize('com_signals_field_prompt')}
                </label>
                <textarea
                  required
                  maxLength={4000}
                  rows={3}
                  value={draft.prompt}
                  onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder={localize('com_signals_field_prompt_ph')}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary">
                  {localize('com_signals_field_cadence')}
                </label>
                <div className="mt-1">
                  <CadencePicker
                    value={draft.cadence}
                    onChange={(cron) => setDraft((d) => ({ ...d, cadence: cron }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center rounded-full border border-transparent bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {editing ? localize('com_signals_save') : localize('com_signals_create')}
                </button>
              </div>
            </form>
          ) : null}

          <div className="mt-6 space-y-3">
            {isError ? (
              <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                {localize('com_signals_load_error')}
              </p>
            ) : isLoading ? (
              <p className="text-sm text-text-secondary">{localize('com_ui_loading')}</p>
            ) : signals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-light p-6 text-center text-sm text-text-secondary">
                {localize('com_signals_empty')}
              </p>
            ) : (
              signals.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-border-light bg-surface-primary p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{s.name}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {s.cadenceCron ? describeCron(s.cadenceCron, loc) + ' · ' : ''}
                        {localize('com_signals_next_run')}: {fmt(s.nextRunAt, localize)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={inFlightId === s.id}
                        onClick={() => handleRun(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-light px-3 py-1 text-xs font-medium text-text-secondary transition hover:border-border-medium hover:bg-surface-secondary disabled:opacity-50"
                      >
                        {inFlightId === s.id ? (
                          <span
                            className="size-3 animate-spin rounded-full border-2 border-text-secondary border-t-transparent"
                            aria-hidden="true"
                          />
                        ) : null}
                        {inFlightId === s.id
                          ? localize('com_signals_running')
                          : localize('com_signals_run_now')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="rounded-full border border-border-light px-3 py-1 text-xs font-medium text-text-secondary transition hover:border-border-medium hover:bg-surface-secondary"
                      >
                        {localize('com_signals_edit')}
                      </button>
                      <button
                        type="button"
                        disabled={deleteSignal.isLoading}
                        onClick={() => handleDelete(s.id, s.name)}
                        className="rounded-full border border-border-light px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {localize('com_ui_delete')}
                      </button>
                    </div>
                  </div>
                  {pollingSignalId === s.id && latestRun.data ? (
                    <RunResult
                      status={latestRun.data.status}
                      summary={latestRun.data.summary}
                      localize={loc}
                      onDismiss={() => setPollingSignalId(null)}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
