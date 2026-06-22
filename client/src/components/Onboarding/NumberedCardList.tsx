import React from 'react';

export type NumberedCardItem = { id: string; label: string };
export type NumberedCardListProps = {
  items: NumberedCardItem[];
  onSelect?: (item: NumberedCardItem, index: number) => void;
  startIndex?: number;
  ariaLabel?: string;
};

const rowClass = 'flex w-full items-center gap-4 px-5 py-4 text-left';
const indexClass = 'w-6 shrink-0 text-xs tabular-nums text-text-secondary';
const labelClass = 'text-balance text-base text-text-primary';
const pad = (n: number) => String(n).padStart(2, '0');

function NumberedCardList({ items, onSelect, startIndex = 1, ariaLabel }: NumberedCardListProps) {
  if (!items.length) {
    return null;
  }
  return (
    <ul
      aria-label={ariaLabel}
      className="w-full divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light"
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
                className={`${rowClass} cursor-pointer transition-colors hover:bg-surface-secondary`}
              >
                <span className={indexClass}>{idx}</span>
                <span className={labelClass}>{item.label}</span>
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
