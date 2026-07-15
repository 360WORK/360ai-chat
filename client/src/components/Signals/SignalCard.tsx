import { Radar } from 'lucide-react';
import type { SignalCardData } from './signalCardSchema';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

/**
 * Inline chat card for a signal briefing. Rendered in place of the markdown
 * table the agent used to improvise, when it emits a `signal-card` block. Shows
 * only the rows that are present, so a partial briefing still reads cleanly.
 */
export default function SignalCard({ card }: { card: SignalCardData }) {
  const localize = useLocalize();
  const rows: Array<{ key: TranslationKeys; value?: string }> = [
    { key: 'com_signals_card_cadence', value: card.cadence },
    { key: 'com_signals_card_next_run', value: card.nextRun },
    { key: 'com_signals_card_delivers_to', value: card.deliversTo },
    { key: 'com_signals_card_deliverable', value: card.whatYouGet },
  ];
  const visibleRows = rows.filter((r) => r.value);

  return (
    <div
      role="group"
      aria-label={localize('com_signals_card_aria')}
      className="not-prose my-2 overflow-hidden rounded-xl border border-border-light bg-surface-primary"
    >
      <div className="flex items-center gap-2 border-b border-border-light bg-surface-secondary px-4 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radar className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {card.name}
        </p>
      </div>
      <dl className="divide-y divide-border-light">
        {visibleRows.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-3">
            <dt className="shrink-0 text-xs font-medium text-text-secondary sm:w-28 sm:pt-0.5">
              {localize(r.key)}
            </dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line text-sm text-text-primary">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
