import React from 'react';
import { CornerDownLeft } from 'lucide-react';

export type NumberedCardItem = { id: string; label: string };
export type NumberedCardListProps = {
  items: NumberedCardItem[];
  onSelect?: (item: NumberedCardItem, index: number) => void;
  startIndex?: number;
  ariaLabel?: string;
  selectHint?: string;
};

const rowClass = 'group/row flex w-full items-center gap-3.5 px-4 py-3 text-left';
const indexClass = 'w-5 shrink-0 text-xs tabular-nums text-text-tertiary';
const labelClass = 'flex-1 text-[15px] leading-snug text-text-primary';
const hintClass =
  'ml-3 hidden shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100 sm:flex';
const pad = (n: number) => String(n).padStart(2, '0');

function NumberedCardList({
  items,
  onSelect,
  startIndex = 1,
  ariaLabel,
  selectHint,
}: NumberedCardListProps) {
  if (!items.length) {
    return null;
  }
  return (
    <ul
      aria-label={ariaLabel}
      className="w-full divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light bg-surface-primary"
    >
      {items.map((item, i) => {
        const idx = pad(startIndex + i);
        if (onSelect) {
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-label={item.label}
                onClick={() => onSelect(item, i)}
                className={`${rowClass} cursor-pointer transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none`}
              >
                <span className={indexClass}>{idx}</span>
                <span className={labelClass}>{item.label}</span>
                {selectHint ? (
                  <span className={hintClass} aria-hidden="true">
                    {selectHint}
                    <CornerDownLeft className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            </li>
          );
        }
        return (
          <li key={item.id} className={rowClass}>
            <span className={indexClass}>{idx}</span>
            <span className={labelClass}>{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default React.memo(NumberedCardList);
