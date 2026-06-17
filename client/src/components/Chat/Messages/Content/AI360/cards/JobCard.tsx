import { Briefcase, MapPin, ExternalLink, Users } from 'lucide-react';
import type { Job } from '../types';
import { useLocalize } from '~/hooks';
import { Pill, LinkButton, ExpandableText } from '../Bits';

export default function JobCard({ job, variant }: { job: Job; variant: 'search' | 'list' }) {
  const localize = useLocalize();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-medium bg-surface-primary p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-text-primary">{job.title}</h4>
            {variant === 'list' && job.status && <Pill>{job.status}</Pill>}
            {variant === 'search' && job.workplace_type && <Pill>{job.workplace_type}</Pill>}
          </div>
          {variant === 'search' && job.company_name && (
            <p className="truncate text-xs text-text-secondary">{job.company_name}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {job.location}
          </span>
        )}
        {typeof job.openings === 'number' && (
          <span className="flex items-center gap-1">
            <Briefcase className="size-3" aria-hidden="true" />
            {localize('com_ui_360_openings', { 0: job.openings })}
          </span>
        )}
        {variant === 'list' && typeof job.applications_count === 'number' && (
          <span className="flex items-center gap-1">
            <Users className="size-3" aria-hidden="true" />
            {localize('com_ui_360_applications', { 0: job.applications_count })}
          </span>
        )}
      </div>
      {variant === 'search' && <ExpandableText text={job.description} />}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {variant === 'search' && (
          <LinkButton
            href={job.posting_url}
            label={localize('com_ui_360_view_posting')}
            icon={<ExternalLink />}
          />
        )}
      </div>
    </div>
  );
}
