import { useMemo, useState } from 'react';
import { useLocalize } from '~/hooks';
import {
  useSignalsQuery,
  useCreateSignal,
  useRunSignalNow,
  useDeleteSignal,
} from '~/data-provider/Signals/queries';
import type { TSignal, TSignalTool } from 'librechat-data-provider';

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Every Monday 8am', value: '0 8 * * MON' },
  { label: 'Every day 8am', value: '0 8 * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 15 min', value: '*/15 * * * *' },
];

const TOOL_OPTIONS: Array<{ value: TSignalTool; label: string }> = [
  { value: 'list_jobs', label: 'List jobs' },
  { value: 'get_job', label: 'Get job' },
  { value: 'pipeline_stages', label: 'Pipeline stages' },
];

const emptyDraft = () => ({
  name: '',
  type: 'briefing' as 'briefing' | 'custom',
  cadence: '0 8 * * MON',
  prompt: '',
  tools: ['list_jobs'] as TSignalTool[],
});

/** Format an ISO timestamp for display, or show a placeholder. */
function fmt(iso: string | null, localize: (k: 'com_signals_never') => string): string {
  if (!iso) {
    return localize('com_signals_never');
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? localize('com_signals_never') : d.toLocaleString();
}

export default function SignalsManager() {
  const localize = useLocalize();
  const { data, isLoading } = useSignalsQuery();
  const createSignal = useCreateSignal();
  const runSignalNow = useRunSignalNow();
  const deleteSignal = useDeleteSignal();

  const [draft, setDraft] = useState(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signals: TSignal[] = useMemo(() => data?.signals ?? [], [data]);

  const toggleTool = (tool: TSignalTool) => {
    setDraft((d) => ({
      ...d,
      tools: d.tools.includes(tool) ? d.tools.filter((t) => t !== tool) : [...d.tools, tool],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (draft.tools.length === 0) {
      setError(localize('com_signals_error_tools'));
      return;
    }
    try {
      await createSignal.mutateAsync({
        name: draft.name.trim(),
        type: draft.type,
        trigger_config: { cadence_cron: draft.cadence.trim(), timezone: 'UTC' },
        action_config: {
          agent_key: 'recruiting',
          prompt_template: draft.prompt.trim(),
          tool_plan: draft.tools.map((tool) => ({ tool })),
        },
        delivery_channels: ['chat_feed', 'inapp'],
      });
      setDraft(emptyDraft());
      setShowForm(false);
    } catch (err) {
      setError(
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : localize('com_signals_error_create'),
      );
    }
  };

  const handleRun = async (id: string) => {
    try {
      await runSignalNow.mutateAsync(id);
    } catch {
      /* surfaced by query invalidation / silent */
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

  return (
    <div className="flex h-full w-full flex-col bg-presentation">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-text-primary">
              {localize('com_signals_title')}
            </h1>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              {showForm ? localize('com_signals_cancel') : localize('com_signals_new')}
            </button>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{localize('com_signals_subtitle')}</p>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {showForm ? (
            <form
              onSubmit={handleCreate}
              className="mt-4 space-y-4 rounded-xl border border-border-light bg-surface-primary p-4"
            >
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
                  {localize('com_signals_field_cadence')}
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, cadence: p.value }))}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                        draft.cadence === p.value
                          ? 'border-transparent bg-primary text-primary-foreground'
                          : 'border-border-light bg-surface-secondary text-text-secondary hover:border-border-medium'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  required
                  value={draft.cadence}
                  onChange={(e) => setDraft((d) => ({ ...d, cadence: e.target.value }))}
                  className="mt-2 w-full rounded-lg border border-border-light bg-surface-secondary px-3 py-2 font-mono text-xs text-text-primary"
                  placeholder="0 8 * * MON"
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
                  {localize('com_signals_field_tools')}
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TOOL_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={draft.tools.includes(t.value)}
                      onClick={() => toggleTool(t.value)}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                        draft.tools.includes(t.value)
                          ? 'border-transparent bg-primary text-primary-foreground'
                          : 'border-border-light bg-surface-secondary text-text-secondary hover:border-border-medium'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="rounded-full border border-border-light px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-secondary"
                >
                  {localize('com_signals_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createSignal.isLoading}
                  className="inline-flex items-center rounded-full border border-transparent bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {localize('com_signals_create')}
                </button>
              </div>
            </form>
          ) : null}

          <div className="mt-6 space-y-3">
            {isLoading ? (
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
                        <span className="capitalize">{s.type}</span>
                        {' · '}
                        {localize('com_signals_next_run')}: {fmt(s.nextRunAt, localize)}
                        {' · '}
                        {localize('com_signals_last_run')}: {fmt(s.lastRunAt, localize)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={runSignalNow.isLoading}
                        onClick={() => handleRun(s.id)}
                        className="rounded-full border border-border-light px-3 py-1 text-xs font-medium text-text-secondary transition hover:border-border-medium hover:bg-surface-secondary disabled:opacity-50"
                      >
                        {localize('com_signals_run_now')}
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
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
