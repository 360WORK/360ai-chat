import { parse360Output } from '../parse';
import { is360Tool } from '../tools';

describe('is360Tool', () => {
  it('recognizes 360AI tool names and rejects others', () => {
    expect(is360Tool('search_companies')).toBe(true);
    expect(is360Tool('search_talents')).toBe(true);
    expect(is360Tool('search_candidates')).toBe(true);
    expect(is360Tool('search_jobs')).toBe(true);
    expect(is360Tool('list_jobs')).toBe(true);
    expect(is360Tool('get_job')).toBe(true);
    expect(is360Tool('get_candidates')).toBe(true);
    expect(is360Tool('get_candidate')).toBe(false);
    expect(is360Tool('whoami')).toBe(false);
    expect(is360Tool('some_other_tool')).toBe(false);
  });
});

describe('parse360Output', () => {
  it('parses search_companies envelope', () => {
    const output = JSON.stringify({
      count: 1,
      companies: [
        {
          id: '7',
          name: 'Acme',
          website: 'https://acme.com',
          linkedin_url: 'https://www.linkedin.com/company/acme',
          industry: 'Software',
          employee_range: '1001-5000',
          location: 'Berlin, Germany',
          description: 'We build things.',
        },
      ],
    });
    const result = parse360Output('search_companies', output);
    expect(result).toEqual({
      kind: 'companies',
      count: 1,
      companies: [
        {
          id: '7',
          name: 'Acme',
          website: 'https://acme.com',
          linkedin_url: 'https://www.linkedin.com/company/acme',
          industry: 'Software',
          employee_range: '1001-5000',
          location: 'Berlin, Germany',
          description: 'We build things.',
        },
      ],
    });
  });

  it('parses search_talents envelope with meta', () => {
    const output = JSON.stringify({
      pool: 'global',
      count: 2,
      talent_finder_url: 'https://360ai.test/talent-finder?q=x',
      talents: [
        { id: 'a', name: 'Jane Doe', title: 'PM', current_company: 'Acme', skills: ['SQL'] },
        { id: 'b', name: 'John Roe', open_to_work: true },
      ],
    });
    const result = parse360Output('search_talents', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.count).toBe(2);
      expect(result.pool).toBe('global');
      expect(result.talentFinderUrl).toBe('https://360ai.test/talent-finder?q=x');
      expect(result.talents).toHaveLength(2);
    }
  });

  it('parses search_candidates bare array into talents kind', () => {
    const output = JSON.stringify([
      { id: 'c', name: 'Sam', title: 'Eng', summary: 'Backend dev' },
    ]);
    const result = parse360Output('search_candidates', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.count).toBe(1);
      expect(result.talents[0].summary).toBe('Backend dev');
    }
  });

  it('parses search_jobs as jobs/search variant', () => {
    const output = JSON.stringify({
      count: 1,
      jobs: [
        { id: 'j1', title: 'Engineer', company_name: 'Acme', workplace_type: 'remote', openings: 3 },
      ],
    });
    const result = parse360Output('search_jobs', output);
    expect(result?.kind).toBe('jobs');
    if (result?.kind === 'jobs') {
      expect(result.variant).toBe('search');
      expect(result.count).toBe(1);
    }
  });

  it('parses list_jobs bare array as jobs/list variant', () => {
    const output = JSON.stringify([
      { id: 5, title: 'Designer', status: 'open', applications_count: 12 },
    ]);
    const result = parse360Output('list_jobs', output);
    expect(result?.kind).toBe('jobs');
    if (result?.kind === 'jobs') {
      expect(result.variant).toBe('list');
      expect(result.jobs[0].applications_count).toBe(12);
    }
  });

  it('parses get_job into job detail', () => {
    const output = JSON.stringify({
      id: 9,
      title: 'Staff Engineer',
      status: 'open',
      pipeline: [
        { name: 'Applied', order: 1, candidates_count: 10 },
        { name: 'Screen', order: 2, candidates_count: 4 },
      ],
    });
    const result = parse360Output('get_job', output);
    expect(result?.kind).toBe('job');
    if (result?.kind === 'job') {
      expect(result.job.title).toBe('Staff Engineer');
      expect(result.job.pipeline).toHaveLength(2);
    }
  });

  it('returns null on malformed JSON', () => {
    expect(parse360Output('search_companies', '{not json')).toBeNull();
  });

  it('returns null on shape mismatch', () => {
    expect(parse360Output('search_companies', JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('returns null on error-shaped output', () => {
    expect(parse360Output('search_companies', JSON.stringify({ error: 'boom' }))).toBeNull();
  });

  it('returns null for empty/missing output and unknown tools', () => {
    expect(parse360Output('search_companies', '')).toBeNull();
    expect(parse360Output('search_companies', null)).toBeNull();
    expect(parse360Output('whoami', JSON.stringify({ user: {} }))).toBeNull();
  });

  it('parseTalents carries latitude/longitude through', () => {
    const out = parse360Output('search_talents', JSON.stringify({
      count: 1,
      talents: [{ id: '1', name: 'Jane', latitude: 40.7128, longitude: -74.006 }],
    }));
    expect(out).not.toBeNull();
    const t = (out as Extract<typeof out, { kind: 'talents' }>).talents[0];
    expect(t.latitude).toBe(40.7128);
    expect(t.longitude).toBe(-74.006);
  });

  it('parses get_candidates batch envelope into talents kind', () => {
    const output = JSON.stringify({
      count: 2,
      not_found: ['zzz'],
      candidates: [
        {
          id: 'a',
          name: 'Jane Doe',
          avatar: 'https://cdn.example.com/jane.png',
          title: 'Senior Laravel Engineer',
          current_company: 'Acme',
          location: 'London, United Kingdom',
          skills: ['PHP', 'Laravel'],
          summary: 'Ten years of PHP.',
          open_to_work: { looking: true, availability: 'immediately' },
          profiles: [
            { network: 'github', url: 'https://github.com/janedoe' },
            { network: 'linkedin', url: 'https://www.linkedin.com/in/janedoe' },
          ],
        },
        { id: 'b', name: 'John Roe', open_to_work: null, profiles: [] },
      ],
    });
    const result = parse360Output('get_candidates', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.count).toBe(2);
      expect(result.talents).toHaveLength(2);
      expect(result.talents[0].open_to_work).toBe(true);
      expect(result.talents[0].linkedin_url).toBe('https://www.linkedin.com/in/janedoe');
      expect(result.talents[0].skills).toEqual(['PHP', 'Laravel']);
      expect(result.talents[1].open_to_work).toBe(false);
      expect(result.talents[1].linkedin_url).toBeNull();
    }
  });

  it('falls back to candidates length when get_candidates count is missing', () => {
    const output = JSON.stringify({
      candidates: [{ id: 'a', name: 'Jane Doe' }],
      not_found: [],
    });
    const result = parse360Output('get_candidates', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.count).toBe(1);
    }
  });

  it('survives malformed nested shapes on get_candidates items', () => {
    const output = JSON.stringify({
      count: 1,
      candidates: [
        {
          id: 'a',
          name: 'Jane Doe',
          title: 'Engineer',
          profiles: 'oops',
          open_to_work: 'oops',
        },
      ],
    });
    const result = parse360Output('get_candidates', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.talents).toHaveLength(1);
      expect(result.talents[0].name).toBe('Jane Doe');
      expect(result.talents[0].title).toBe('Engineer');
      expect(result.talents[0].linkedin_url).toBeNull();
      expect(result.talents[0].open_to_work).toBe(false);
    }
  });

  it('returns null for get_candidates error or malformed payloads', () => {
    expect(parse360Output('get_candidates', JSON.stringify({ error: 'nope' }))).toBeNull();
    expect(parse360Output('get_candidates', JSON.stringify({ candidates: 'oops' }))).toBeNull();
    expect(parse360Output('get_candidates', 'not json')).toBeNull();
  });
});
