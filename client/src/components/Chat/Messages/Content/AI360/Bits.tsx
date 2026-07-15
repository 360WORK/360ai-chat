import { useState } from 'react';
import type { ReactNode } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { safeHref } from './href';
import { cn } from '~/utils';

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ai360-chip-border bg-transparent px-2.5 py-0.5 text-xs text-text-secondary">
      {children}
    </span>
  );
}

export function LinkButton({
  href,
  label,
  icon,
}: {
  href?: string | null;
  label: string;
  icon: ReactNode;
}) {
  if (!href) {
    return null;
  }
  const safe = safeHref(href);
  if (!safe) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-ai360-card-border px-2.5 py-1 text-xs font-medium text-text-secondary">
        <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
        'border-ai360-action-border bg-ai360-action-bg text-ai360-action',
        'hover:bg-ai360-action-border/40 transition-colors',
        'focus-visible:ring-ai360-action/40 focus-visible:outline-none focus-visible:ring-2',
      )}
    >
      <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </a>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const textLabel = label ?? localize('com_ui_360_copy');
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? localize('com_ui_360_copied') : textLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-ai360-card-border px-2.5 py-1 text-xs font-medium',
        'text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
      )}
    >
      {copied ? (
        <Check className="size-3.5 shrink-0 text-ai360-positive" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{copied ? localize('com_ui_360_copied') : textLabel}</span>
    </button>
  );
}

export function ExpandableText({ text, clamp = 2 }: { text?: string | null; clamp?: number }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  if (!text || text.trim().length === 0) {
    return null;
  }
  const clampClass = clamp === 3 ? 'line-clamp-3' : 'line-clamp-2';
  return (
    <div className="text-xs leading-relaxed text-text-secondary">
      <p className={cn('whitespace-pre-wrap', !expanded && clampClass)}>{text}</p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-ai360-action hover:text-ai360-accent-hover"
      >
        {expanded ? localize('com_ui_360_show_less') : localize('com_ui_360_show_more')}
        <ChevronDown
          className={cn('size-3 transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function initials(name?: string | null): string {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  if (showImage) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        onError={() => setFailed(true)}
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-ai360-card-border"
      />
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-xs font-semibold text-text-secondary ring-1 ring-ai360-card-border">
      {initials(name)}
    </div>
  );
}

export function SkillChips({ skills, max = 5 }: { skills?: string[]; max?: number }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  if (!skills || skills.length === 0) {
    return null;
  }
  const visible = expanded ? skills : skills.slice(0, max);
  const hidden = skills.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((skill) => (
        <Pill key={skill}>{skill}</Pill>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={localize('com_ui_360_more_skills', { 0: hidden })}
          className="inline-flex items-center rounded-full border border-ai360-chip-border px-2 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {`+${hidden}`}
        </button>
      )}
    </div>
  );
}
