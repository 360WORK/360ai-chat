import type { Company } from '../types';
import { safeHref } from '../href';
import { Avatar, CardShell, Pill } from '../Bits';

export default function CompanyCard({ company }: { company: Company }) {
  const meta = [company.industry, company.location].filter(Boolean).join(' · ');
  const href = safeHref(company.website) ?? safeHref(company.linkedin_url);
  return (
    <CardShell href={href}>
      <Avatar src={null} name={company.name} />
      <div className="min-w-0 flex-1">
        {company.name && (
          <p className="truncate text-sm font-semibold capitalize text-text-primary">
            {company.name}
          </p>
        )}
        {meta && <p className="truncate text-xs text-text-secondary">{meta}</p>}
      </div>
      {company.employee_range && <Pill>{company.employee_range}</Pill>}
    </CardShell>
  );
}
