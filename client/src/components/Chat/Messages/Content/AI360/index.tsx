import type { Parsed360Result } from './types';
import ResultList from './ResultList';
import CompanyCard from './cards/CompanyCard';
import ContactCard from './cards/ContactCard';
import OutreachPreviewCard from './cards/OutreachPreviewCard';
import TalentCard from './cards/TalentCard';
import JobCard from './cards/JobCard';
import JobDetailCard from './cards/JobDetail';
import { useLocalize } from '~/hooks';

export { is360Tool } from './tools';
export { parse360Output } from './parse';

type Localize = ReturnType<typeof useLocalize>;

const RENDERERS: Record<Parsed360Result['kind'], (result: Parsed360Result, localize: Localize) => JSX.Element> = {
  companies: (r, localize) => {
    const { companies, count } = r as Extract<Parsed360Result, { kind: 'companies' }>;
    return (
      <ResultList
        items={companies}
        columns={2}
        noun={localize('com_ui_360_noun_companies')}
        header={localize('com_ui_360_companies_count', { 0: count })}
        getKey={(c, i) => String(c.id ?? i)}
        renderItem={(company) => <CompanyCard company={company} />}
      />
    );
  },
  talents: (r, localize) => {
    const { talents, count } = r as Extract<Parsed360Result, { kind: 'talents' }>;
    return (
      <ResultList
        items={talents}
        columns={1}
        noun={localize('com_ui_360_noun_talents')}
        header={localize('com_ui_360_talents_count', { 0: count })}
        getKey={(t, i) => String(t.id ?? i)}
        renderItem={(talent) => <TalentCard talent={talent} />}
      />
    );
  },
  jobs: (r, localize) => {
    const { jobs, count, variant } = r as Extract<Parsed360Result, { kind: 'jobs' }>;
    return (
      <ResultList
        items={jobs}
        columns={2}
        noun={localize('com_ui_360_noun_jobs')}
        header={localize('com_ui_360_jobs_count', { 0: count })}
        getKey={(j, i) => String(j.id ?? i)}
        renderItem={(job) => <JobCard job={job} variant={variant} />}
      />
    );
  },
  job: (r) => {
    const { job } = r as Extract<Parsed360Result, { kind: 'job' }>;
    return <JobDetailCard job={job} />;
  },
  contact: (r) => {
    const { contact } = r as Extract<Parsed360Result, { kind: 'contact' }>;
    return <ContactCard contact={contact} />;
  },
  outreach: (r) => {
    const { outreach } = r as Extract<Parsed360Result, { kind: 'outreach' }>;
    return <OutreachPreviewCard outreach={outreach} />;
  },
};

export default function AI360ToolResult({ result }: { result: Parsed360Result }) {
  const localize = useLocalize();
  return RENDERERS[result.kind](result, localize);
}
