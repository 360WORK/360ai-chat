import type { Parsed360Result } from './types';
import ResultList from './ResultList';
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
        columns={2}
        noun={localize('com_ui_360_noun_companies')}
        header={localize('com_ui_360_companies_count', { 0: result.count })}
        getKey={(c, i) => String(c.id ?? i)}
        renderItem={(company) => <CompanyCard company={company} />}
      />
    );
  }

  if (result.kind === 'talents') {
    return (
      <ResultList
        items={result.talents}
        columns={1}
        noun={localize('com_ui_360_noun_talents')}
        header={localize('com_ui_360_talents_count', { 0: result.count })}
        getKey={(t, i) => String(t.id ?? i)}
        renderItem={(talent) => <TalentCard talent={talent} />}
      />
    );
  }

  if (result.kind === 'jobs') {
    return (
      <ResultList
        items={result.jobs}
        columns={2}
        noun={localize('com_ui_360_noun_jobs')}
        header={localize('com_ui_360_jobs_count', { 0: result.count })}
        getKey={(j, i) => String(j.id ?? i)}
        renderItem={(job) => <JobCard job={job} variant={result.variant} />}
      />
    );
  }

  return <JobDetailCard job={result.job} />;
}
