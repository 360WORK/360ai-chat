import type { Job } from '../types';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { Pill } from '../Bits';

export default function JobCard({ job, variant }: { job: Job; variant: 'search' | 'list' }) {
  const localize = useLocalize();
  const meta =
    variant === 'search'
      ? [job.company_name, job.location].filter(Boolean).join(' · ')
      : [
          job.location,
          typeof job.applications_count === 'number'
            ? localize('com_ui_360_applications', { 0: job.applications_count })
            : null,
        ]
          .filter(Boolean)
          .join(' · ');
  const pill = variant === 'search' ? job.workplace_type : job.status;
  const href = variant === 'search' ? job.posting_url || undefined : undefined;
  const className = cn(
    'flex items-center gap-3 rounded-xl border border-ai360-card-border bg-ai360-card px-3 py-2.5',
    'transition-colors hover:bg-surface-secondary',
  );
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold capitalize text-text-primary">{job.title}</p>
        {meta && <p className="truncate text-xs text-text-secondary">{meta}</p>}
      </div>
      {pill && <Pill>{pill}</Pill>}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {body}
      </a>
    );
  }
  return <div className={className}>{body}</div>;
}
