import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ResultListProps<T> {
  items: T[];
  header: ReactNode;
  renderItem: (item: T) => ReactNode;
  getKey: (item: T, index: number) => string;
  initial?: number;
  columns?: 1 | 2;
  noun?: string;
}

export default function ResultList<T>({
  items,
  header,
  renderItem,
  getKey,
  initial = 3,
  columns = 2,
  noun = '',
}: ResultListProps<T>) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-ai360-card-border bg-surface-secondary p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
          {header}
        </div>
        <p className="text-xs text-text-tertiary">{localize('com_ui_360_no_results')}</p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, initial);
  const remaining = items.length - initial;
  const hasMore = remaining > 0;
  const gridClass = columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-ai360-card-border bg-surface-secondary p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
        {header}
      </div>
      <div className={cn('grid gap-2', gridClass)}>
        {visible.map((item, index) => (
          <div key={getKey(item, index)}>{renderItem(item)}</div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'inline-flex items-center gap-1 self-start rounded-full border border-ai360-action-border bg-ai360-action-bg px-3 py-1 text-xs font-medium text-ai360-action',
            'transition-colors hover:bg-ai360-action-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai360-action/40',
          )}
        >
          {expanded
            ? localize('com_ui_360_show_less')
            : localize('com_ui_360_view_more', { 0: remaining, 1: noun }).trim()}
          <ChevronDown
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
