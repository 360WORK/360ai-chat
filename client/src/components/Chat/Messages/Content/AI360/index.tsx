import { Suspense, lazy, useState } from 'react';
import type { Parsed360Result } from './types';
import ResultList from './ResultList';
import CompanyCard from './cards/CompanyCard';
import ContactCard from './cards/ContactCard';
import OutreachPreviewCard from './cards/OutreachPreviewCard';
import TalentCard from './cards/TalentCard';
import JobCard from './cards/JobCard';
import JobDetailCard from './cards/JobDetail';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const TalentMap = lazy(() => import('./cards/TalentMap'));

export { is360Tool, AI360_MCP_SERVER } from './tools';
export { parse360Output } from './parse';

type Localize = ReturnType<typeof useLocalize>;

function TalentsResult({ result }: { result: Extract<Parsed360Result, { kind: 'talents' }> }) {
  const localize = useLocalize();
  const [view, setView] = useState<'list' | 'map'>('list');
  const hasCoords = result.talents.some(
    (t) => typeof t.latitude === 'number' && typeof t.longitude === 'number',
  );

  return (
    <div className="space-y-2">
      {hasCoords ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs',
              view === 'list' ? 'bg-ai360-action-bg text-ai360-action' : 'text-text-secondary',
            )}
          >
            {localize('com_ui_360_list_view')}
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs',
              view === 'map' ? 'bg-ai360-action-bg text-ai360-action' : 'text-text-secondary',
            )}
          >
            {localize('com_ui_360_map_view')}
          </button>
        </div>
      ) : null}

      {view === 'map' && hasCoords ? (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-surface-secondary" />}>
          <TalentMap talents={result.talents} />
        </Suspense>
      ) : (
        <ResultList
          items={result.talents}
          columns={1}
          noun={localize('com_ui_360_noun_talents')}
          header={localize('com_ui_360_talents_count', { 0: result.count })}
          getKey={(t, i) => String(t.id ?? i)}
          renderItem={(talent) => <TalentCard talent={talent} />}
        />
      )}
    </div>
  );
}

const RENDERERS: Record<
  Parsed360Result['kind'],
  (result: Parsed360Result, localize: Localize) => JSX.Element
> = {
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
  talents: (r) => <TalentsResult result={r as Extract<Parsed360Result, { kind: 'talents' }>} />,
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
