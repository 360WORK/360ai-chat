import type { JobDetail } from '../types';
import { useLocalize } from '~/hooks';
import { Pill, ExpandableText } from '../Bits';

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</span>
      <span className="text-xs text-text-primary">{value}</span>
    </div>
  );
}

export default function JobDetailCard({ job }: { job: JobDetail }) {
  const localize = useLocalize();
  const meta = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MetaItem label={localize('com_ui_360_department')} value={job.department} />
      <MetaItem label={localize('com_ui_360_employment_type')} value={job.employment_type} />
      <MetaItem label={localize('com_ui_360_seniority')} value={job.seniority_level} />
      <MetaItem label={localize('com_ui_360_remote_type')} value={job.remote_type} />
      <MetaItem label={localize('com_ui_360_salary')} value={job.salary_range} />
      <MetaItem label={localize('com_ui_360_location')} value={job.location} />
    </div>
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-medium bg-surface-primary p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-text-primary">{job.title}</h3>
        {job.status && <Pill>{job.status}</Pill>}
      </div>
      {meta}
      <ExpandableText text={job.description} clamp={3} />
      {Array.isArray(job.pipeline) && job.pipeline.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
            {localize('com_ui_360_pipeline')}
          </p>
          <div className="flex flex-wrap gap-2">
            {job.pipeline.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((stage) => (
              <div
                key={`${stage.order}-${stage.name}`}
                className="flex flex-col items-center rounded-md border border-border-light bg-surface-secondary px-3 py-1.5"
              >
                <span className="text-sm font-semibold text-text-primary">
                  {stage.candidates_count}
                </span>
                <span className="text-[11px] text-text-secondary">{stage.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
