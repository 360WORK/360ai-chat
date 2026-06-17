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
}

export default function ResultList<T>({
  items,
  header,
  renderItem,
  getKey,
  initial = 3,
}: ResultListProps<T>) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-text-secondary">{header}</div>
        <p className="text-xs text-text-tertiary">{localize('com_ui_360_no_results')}</p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, initial);
  const hasMore = items.length > initial;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-text-secondary">{header}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            'inline-flex items-center gap-1 self-start text-xs text-text-secondary',
            'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
          )}
        >
          {expanded
            ? localize('com_ui_360_show_less')
            : localize('com_ui_360_show_all', { 0: items.length })}
          <ChevronDown
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
