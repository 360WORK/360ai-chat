import { useMemo, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import type { TSignal } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useSignalsQuery,
  useCreateSignal,
  useUpdateSignal,
  useRunSignalNow,
  useDeleteSignal,
  useSignalRunQuery,
} from '~/data-provider/Signals/queries';
import CadencePicker, { describeCron, browserTimezone } from './CadencePicker';
import { useLocalize } from '~/hooks';
import store from '~/store';

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

type Localize = (key: TranslationKeys) => string;

const emptyDraft = (): Draft => ({ name: '', prompt: '', cadence: '0 8 * * 1' });

/** Format an ISO timestamp for display, or show a placeholder. */
function fmt(iso: string | null, localize: Localize): string {
  if (!iso) {
    return localize('com_signals_never');
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? localize('com_signals_never') : d.toLocaleString();
}

const TERMINAL = new Set(['succeeded', 'failed', 'no_change']);

/** Header label key for a finished run result. */
function runResultLabelKey(failed: boolean, nothing: boolean): TranslationKeys {
  if (failed) {
    return 'com_signals_result_failed';
  }
  if (nothing) {
    return 'com_signals_result_nothing';
  }
  return 'com_signals_result_done';
}

/** User-facing message for a failed create/update submit. */
function submitErrorMessage(err: unknown, isEditing: boolean, localize: Localize): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return isEditing ? localize('com_signals_error_update') : localize('com_signals_error_create');
}

/** Inline result of a just-polled Run: spinner while running, digest when done. */
function RunResult({
  status,
  summary,
  runError,
  localize,
  onDismiss,
}: {
  status: string;
  summary: string | null;
  runError: string | null;
  localize: Localize;
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
      role="status"
      aria-live="polite"
      className={`mt-3 rounded-lg border p-3 text-sm ${
        failed
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
          : 'border-border-light bg-surface-secondary text-text-primary'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase opacity-70">
          {localize(runResultLabelKey(failed, nothing))}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {localize('com_signals_dismiss')}
        </button>
      </div>
      {failed && runError ? (
        <div className="whitespace-pre-wrap break-words text-sm">{runError}</div>
      ) : null}
      {failed || nothing ? null : (
        <div className="signals-digest whitespace-pre-wrap break-words text-sm text-text-primary">
          {summary}
        </div>
      )}
    </div>
  );
}

export default function SignalsManager() {
  const localize = useLocalize();
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
  const [deleteTarget, setDeleteTarget] = useState<TSignal | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // The run currently being polled to completion (signalId + runId). The runId
  // is returned synchronously by run_signal_now; we poll THAT run so we track
  // the exact run we triggered, not whatever was latest before.
  const [poll, setPoll] = useState<{ signalId: string; runId: string } | null>(null);

  const signals: TSignal[] = useMemo(() => data?.signals ?? [], [data]);
  const editing = editingId ? (signals.find((s) => s.id === editingId) ?? null) : null;

  // Opening the panel marks delivered digests as seen (clears the nav badge).
  const sidebarExpanded = useRecoilValue(store.sidebarExpanded);
  const setSignalsUnread = useSetRecoilState(store.signalsUnread);
  useEffect(() => {
    if (sidebarExpanded) {
      setSignalsUnread(false);
    }
  }, [sidebarExpanded, setSignalsUnread]);

  // Per-signal run state: only the signal whose id matches the in-flight
  // mutation's variables is "running". `isLoading` alone would disable every
  // Run button at once.
  const runningId =
    runSignalNow.isLoading && typeof runSignalNow.variables === 'string'
      ? runSignalNow.variables
      : null;

  // Poll the specific run we triggered, until terminal (or the poll gives up).
  const runQuery = useSignalRunQuery(poll?.runId ?? null, { enabled: poll !== null });
  // The signal currently in-flight (spinner shown): the mutating one, OR the
  // polled run that is still non-terminal. Once the polled run is terminal (or
  // halted) this becomes null → the button reverts to "Run now" while the
  // result card stays visible (dismissable) via `poll`.
  const pollingNotDone =
    poll !== null &&
    runQuery.halted !== true &&
    (!runQuery.data || !TERMINAL.has(runQuery.data.status));
  const inFlightId = runningId ?? (pollingNotDone ? poll!.signalId : null);

  // The poll gave up (run never surfaced, or the service kept erroring):
  // surface the error and stop tracking so the Run button is re-enabled.
  const pollHalted = poll !== null && runQuery.halted === true;
  useEffect(() => {
    if (!pollHalted) {
      return;
    }
    setError(localize('com_signals_poll_timeout'));
    setPoll(null);
  }, [pollHalted, localize]);

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
    const timezone = browserTimezone();
    try {
      if (editing) {
        await updateSignal.mutateAsync({
          id: editing.id,
          input: {
            name: payload.name,
            action_config: { prompt_template: payload.prompt },
            trigger_config: { cadence_cron: payload.cadence, timezone },
          },
        });
      } else {
        await createSignal.mutateAsync({
          name: payload.name,
          type: 'briefing',
          trigger_config: { cadence_cron: payload.cadence, timezone },
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
      setError(submitErrorMessage(err, editing !== null, localize));
    }
  };

  const handleRun = async (id: string) => {
    setError(null);
    try {
      const res = await runSignalNow.mutateAsync(id);
      // run_signal_now pre-creates the run and returns its id; poll THAT run.
      const runId = res?.signalRunId;
      if (runId) {
        setPoll({ signalId: id, runId });
      }
    } catch {
      setError(localize('com_signals_error_run'));
      setPoll(null);
    }
  };

  const handleToggleActive = async (s: TSignal) => {
    setError(null);
    setTogglingId(s.id);
    try {
      await updateSignal.mutateAsync({ id: s.id, input: { is_active: !s.isActive } });
    } catch {
      setError(localize('com_signals_error_update'));
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteSignal.mutateAsync(deleteTarget.id);
    } catch {
      setError(localize('com_signals_error_delete'));
    } finally {
      setDeleteTarget(null);
    }
  };

  const formOpen = showCreate || editing !== null;
  const submitting = createSignal.isLoading || updateSignal.isLoading;
  const formTitle = editing ? localize('com_signals_edit_title') : localize('com_signals_new');

  const renderSignalCard = (s: TSignal) => (
    <div key={s.id} className="rounded-xl border border-border-light bg-surface-primary p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className={`min-w-0 ${s.isActive ? '' : 'opacity-60'}`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="truncate">{s.name}</span>
            {!s.isActive ? (
              <span className="shrink-0 rounded-full border border-border-medium px-2 py-0.5 text-[10px] font-medium uppercase text-text-secondary">
                {localize('com_signals_paused')}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {s.cadenceCron ? describeCron(s.cadenceCron, localize) + ' · ' : ''}
            {s.timezone ? s.timezone + ' · ' : ''}
            {localize('com_signals_next_run')}: {fmt(s.nextRunAt, localize)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
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
            disabled={togglingId === s.id}
            onClick={() => handleToggleActive(s)}
            aria-pressed={!s.isActive}
            aria-label={`${localize(s.isActive ? 'com_signals_pause' : 'com_signals_resume')} ${s.name}`}
            className="rounded-full border border-border-light px-3 py-1 text-xs font-medium text-text-secondary transition hover:border-border-medium hover:bg-surface-secondary disabled:opacity-50"
          >
            {localize(s.isActive ? 'com_signals_pause' : 'com_signals_resume')}
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
            onClick={() => setDeleteTarget(s)}
            className="rounded-full border border-border-light px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            {localize('com_ui_delete')}
          </button>
        </div>
      </div>
      {poll?.signalId === s.id && runQuery.data ? (
        <RunResult
          status={runQuery.data.status}
          summary={runQuery.data.summary}
          runError={runQuery.data.error ?? null}
          localize={localize}
          onDismiss={() => setPoll(null)}
        />
      ) : null}
    </div>
  );

  const renderList = () => {
    if (isError) {
      return (
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {localize('com_signals_load_error')}
        </p>
      );
    }
    if (isLoading) {
      return <p className="text-sm text-text-secondary">{localize('com_ui_loading')}</p>;
    }
    if (signals.length === 0) {
      return (
        <p className="rounded-xl border border-dashed border-border-light p-6 text-center text-sm text-text-secondary">
          {localize('com_signals_empty')}
        </p>
      );
    }
    return signals.map(renderSignalCard);
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface-primary-alt">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
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

          {error ? (
            <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
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
                <label htmlFor="signal-name" className="text-sm font-medium text-text-primary">
                  {localize('com_signals_field_name')}
                </label>
                <input
                  id="signal-name"
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder={localize('com_signals_field_name_ph')}
                />
              </div>

              <div>
                <label htmlFor="signal-prompt" className="text-sm font-medium text-text-primary">
                  {localize('com_signals_field_prompt')}
                </label>
                <textarea
                  id="signal-prompt"
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
                <label id="signal-cadence-label" className="text-sm font-medium text-text-primary">
                  {localize('com_signals_field_cadence')}
                </label>
                <div role="group" aria-labelledby="signal-cadence-label" className="mt-1">
                  <CadencePicker
                    key={editingId ?? 'create'}
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

          <div className="mt-6 space-y-3">{renderList()}</div>
        </div>
      </div>

      <OGDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <OGDialogContent
          className="w-11/12 max-w-md"
          showCloseButton={false}
          aria-describedby="delete-signal-description"
        >
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_signals_delete_title')}</OGDialogTitle>
          </OGDialogHeader>
          <p
            id="delete-signal-description"
            className="w-full break-words text-sm text-text-primary"
          >
            {deleteTarget
              ? localize('com_signals_confirm_delete').replace('{name}', deleteTarget.name)
              : null}
          </p>
          <div className="flex justify-end gap-4 pt-4">
            <OGDialogClose asChild>
              <Button aria-label={localize('com_signals_cancel')} variant="outline">
                {localize('com_signals_cancel')}
              </Button>
            </OGDialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteSignal.isLoading}>
              {deleteSignal.isLoading ? <Spinner /> : localize('com_ui_delete')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
