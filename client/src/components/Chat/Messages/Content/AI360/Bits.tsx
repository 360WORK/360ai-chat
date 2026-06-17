import { useState } from 'react';
import type { ReactNode } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
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
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border-medium px-2 py-1 text-xs',
        'text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
      )}
    >
      <span className="size-3.5" aria-hidden="true">
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
  const text_label = label ?? localize('com_ui_360_copy');
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? localize('com_ui_360_copied') : text_label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border-medium px-2 py-1 text-xs',
        'text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
      )}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span>{copied ? localize('com_ui_360_copied') : text_label}</span>
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
    <div className="text-xs text-text-secondary">
      <p className={cn('whitespace-pre-wrap', !expanded && clampClass)}>{text}</p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-text-secondary hover:text-text-primary"
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
        className="size-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-xs font-medium text-text-secondary">
      {initials(name)}
    </div>
  );
}

export function SkillChips({ skills, max = 5 }: { skills?: string[]; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!skills || skills.length === 0) {
    return null;
  }
  const visible = expanded ? skills : skills.slice(0, max);
  const hidden = skills.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((skill) => (
        <Pill key={skill}>{skill}</Pill>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
        >
          {`+${hidden}`}
        </button>
      )}
    </div>
  );
}
