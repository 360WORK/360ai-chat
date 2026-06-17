import { Globe, Linkedin, MapPin } from 'lucide-react';
import type { Company } from '../types';
import { useLocalize } from '~/hooks';
import { Pill, LinkButton, CopyButton, ExpandableText } from '../Bits';

export default function CompanyCard({ company }: { company: Company }) {
  const localize = useLocalize();
  const copyText = [company.name, company.website].filter(Boolean).join(' — ');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-medium bg-surface-primary p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-text-primary">{company.name}</h4>
            {company.employee_range && <Pill>{company.employee_range}</Pill>}
          </div>
          {company.industry && (
            <p className="truncate text-xs text-text-secondary">{company.industry}</p>
          )}
        </div>
      </div>
      {company.location && (
        <p className="flex items-center gap-1 text-xs text-text-secondary">
          <MapPin className="size-3.5" aria-hidden="true" />
          {company.location}
        </p>
      )}
      <ExpandableText text={company.description} />
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <LinkButton
          href={company.website}
          label={localize('com_ui_360_website')}
          icon={<Globe />}
        />
        <LinkButton
          href={company.linkedin_url}
          label={localize('com_ui_360_linkedin')}
          icon={<Linkedin />}
        />
        {copyText && <CopyButton text={copyText} />}
      </div>
    </div>
  );
}
