import type { Job } from '../types';
import { useLocalize } from '~/hooks';
import { safeHref } from '../href';
import { CardShell, Pill } from '../Bits';

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
  const href = variant === 'search' ? safeHref(job.posting_url) : undefined;
  return (
    <CardShell href={href}>
      <div className="min-w-0 flex-1">
        {job.title && (
          <p className="truncate text-sm font-semibold capitalize text-text-primary">{job.title}</p>
        )}
        {meta && <p className="truncate text-xs text-text-secondary">{meta}</p>}
      </div>
      {pill && <Pill>{pill}</Pill>}
    </CardShell>
  );
}
