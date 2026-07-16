import type {
  Company,
  Contact,
  OutreachPreview,
  Talent,
  Job,
  JobDetail,
  PipelineStage,
  Parsed360Result,
  CandidateProfile,
} from './types';
import { is360Tool } from './tools';

function safeParse(output?: string | null): unknown {
  if (typeof output !== 'string' || output.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasError(value: unknown): boolean {
  return isRecord(value) && 'error' in value;
}

function toCount(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function filterRecords<T>(items: unknown[], requiredField: string): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (isRecord(item) && typeof item[requiredField] === 'string' && item[requiredField]) {
      out.push(item as T);
    }
  }
  return out;
}

function parseCompanies(data: unknown): Parsed360Result | null {
  if (!isRecord(data) || !Array.isArray(data.companies)) {
    return null;
  }
  const companies = filterRecords<Company>(data.companies, 'name');
  return { kind: 'companies', companies, count: toCount(data.count, companies.length) };
}

function parseTalents(data: unknown): Parsed360Result | null {
  if (Array.isArray(data)) {
    const talents = filterRecords<Talent>(data, 'name');
    return { kind: 'talents', talents, count: talents.length };
  }
  if (!isRecord(data) || !Array.isArray(data.talents)) {
    return null;
  }
  const talents = filterRecords<Talent>(data.talents, 'name');
  return {
    kind: 'talents',
    talents,
    count: toCount(data.count, talents.length),
    pool: typeof data.pool === 'string' ? data.pool : undefined,
    talentFinderUrl: typeof data.talent_finder_url === 'string' ? data.talent_finder_url : null,
  };
}

function candidateToTalent(candidate: CandidateProfile): Talent {
  const profiles = Array.isArray(candidate.profiles) ? candidate.profiles : [];
  const linkedin = profiles.find((p) => isRecord(p) && p.network === 'linkedin')?.url ?? null;
  const openToWork = isRecord(candidate.open_to_work)
    ? candidate.open_to_work.looking === true
    : candidate.open_to_work === true;
  return {
    id: candidate.id,
    name: candidate.name,
    avatar: candidate.avatar,
    title: candidate.title,
    current_company: candidate.current_company,
    location: candidate.location,
    linkedin_url: linkedin,
    open_to_work: openToWork,
    skills: candidate.skills,
    summary: candidate.summary,
  };
}

function parseCandidateProfiles(data: unknown): Parsed360Result | null {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return null;
  }
  const talents = filterRecords<CandidateProfile>(data.candidates, 'name').map(candidateToTalent);
  return { kind: 'talents', talents, count: toCount(data.count, talents.length) };
}

function parseJobs(toolName: string, data: unknown): Parsed360Result | null {
  const variant = toolName === 'list_jobs' ? 'list' : 'search';
  if (Array.isArray(data)) {
    const jobs = filterRecords<Job>(data, 'title');
    return { kind: 'jobs', jobs, count: jobs.length, variant };
  }
  if (!isRecord(data) || !Array.isArray(data.jobs)) {
    return null;
  }
  const jobs = filterRecords<Job>(data.jobs, 'title');
  return { kind: 'jobs', jobs, count: toCount(data.count, jobs.length), variant };
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string');
  return out.length ? out : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseContact(data: unknown): Parsed360Result | null {
  if (!isRecord(data)) return null;
  const contact: Contact = {
    full_name: asString(data.full_name) ?? asString(data.name),
    headline: typeof data.headline === 'string' ? data.headline : undefined,
    work_emails: asStringArray(data.work_emails),
    personal_emails: asStringArray(data.personal_emails),
    phones: asStringArray(data.phones),
    linkedin_url: typeof data.linkedin_url === 'string' ? data.linkedin_url : undefined,
    twitter_url: typeof data.twitter_url === 'string' ? data.twitter_url : undefined,
    github_url: typeof data.github_url === 'string' ? data.github_url : undefined,
    confidence:
      typeof data.confidence === 'string' || typeof data.confidence === 'number'
        ? data.confidence
        : undefined,
  };
  return { kind: 'contact', contact };
}

function parseOutreach(data: unknown): Parsed360Result | null {
  if (!isRecord(data)) return null;
  const status = data.status === 'sent' || data.status === 'preview' ? data.status : null;
  if (status === null) return null;
  const outreach: OutreachPreview = {
    status,
    channel: typeof data.channel === 'string' ? data.channel : undefined,
    recipient: typeof data.recipient === 'string' ? data.recipient : undefined,
    subject: typeof data.subject === 'string' ? data.subject : undefined,
    body: typeof data.body === 'string' ? data.body : undefined,
  };
  return { kind: 'outreach', outreach };
}

function parseJob(data: unknown): Parsed360Result | null {
  if (!isRecord(data) || typeof data.title !== 'string') {
    return null;
  }
  const job = data as unknown as JobDetail;
  const pipeline = Array.isArray(job.pipeline)
    ? filterRecords<PipelineStage>(job.pipeline, 'name').sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      )
    : job.pipeline;
  return { kind: 'job', job: { ...job, pipeline } };
}

export function parse360Output(toolName: string, output?: string | null): Parsed360Result | null {
  if (!is360Tool(toolName)) {
    return null;
  }
  const data = safeParse(output);
  if (data === undefined || hasError(data)) {
    return null;
  }
  switch (toolName) {
    case 'search_companies':
      return parseCompanies(data);
    case 'search_talents':
    case 'search_candidates':
      return parseTalents(data);
    case 'get_candidates':
      return parseCandidateProfiles(data);
    case 'search_jobs':
    case 'list_jobs':
      return parseJobs(toolName, data);
    case 'get_job':
      return parseJob(data);
    case 'enrich_contact':
      return parseContact(data);
    case 'send_outreach':
      return parseOutreach(data);
    default:
      return null;
  }
}
