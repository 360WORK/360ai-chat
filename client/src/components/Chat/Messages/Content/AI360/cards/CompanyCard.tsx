import type { Company } from '../types';
import { cn } from '~/utils';
import { Avatar, Pill } from '../Bits';

export default function CompanyCard({ company }: { company: Company }) {
  const meta = [company.industry, company.location].filter(Boolean).join(' · ');
  const href = company.website || company.linkedin_url || undefined;
  const className = cn(
    'flex items-center gap-3 rounded-xl border border-ai360-card-border bg-ai360-card px-3 py-2.5',
    'transition-colors hover:bg-surface-secondary',
  );
  const body = (
    <>
      <Avatar src={null} name={company.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold capitalize text-text-primary">{company.name}</p>
        {meta && <p className="truncate text-xs text-text-secondary">{meta}</p>}
      </div>
      {company.employee_range && <Pill>{company.employee_range}</Pill>}
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
