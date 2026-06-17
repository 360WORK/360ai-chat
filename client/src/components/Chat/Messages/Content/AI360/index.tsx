import { Sparkles } from 'lucide-react';
import type { Parsed360Result } from './types';
import ResultList from './ResultList';
import { LinkButton } from './Bits';
import CompanyCard from './cards/CompanyCard';
import TalentCard from './cards/TalentCard';
import JobCard from './cards/JobCard';
import JobDetailCard from './cards/JobDetail';
import { useLocalize } from '~/hooks';

export { is360Tool } from './tools';
export { parse360Output } from './parse';

export default function AI360ToolResult({ result }: { result: Parsed360Result }) {
  const localize = useLocalize();

  if (result.kind === 'companies') {
    return (
      <ResultList
        items={result.companies}
        header={localize('com_ui_360_companies_count', { 0: result.count })}
        getKey={(c, i) => String(c.id ?? i)}
        renderItem={(company) => <CompanyCard company={company} />}
      />
    );
  }

  if (result.kind === 'talents') {
    const header = (
      <span className="flex flex-wrap items-center gap-2">
        {localize('com_ui_360_talents_count', { 0: result.count })}
        {result.talentFinderUrl && (
          <LinkButton
            href={result.talentFinderUrl}
            label={localize('com_ui_360_talent_finder')}
            icon={<Sparkles />}
          />
        )}
      </span>
    );
    return (
      <ResultList
        items={result.talents}
        header={header}
        getKey={(t, i) => String(t.id ?? i)}
        renderItem={(talent) => <TalentCard talent={talent} />}
      />
    );
  }

  if (result.kind === 'jobs') {
    return (
      <ResultList
        items={result.jobs}
        header={localize('com_ui_360_jobs_count', { 0: result.count })}
        getKey={(j, i) => String(j.id ?? i)}
        renderItem={(job) => <JobCard job={job} variant={result.variant} />}
      />
    );
  }

  return <JobDetailCard job={result.job} />;
}
