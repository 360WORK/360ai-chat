import type {
  Company,
  Talent,
  Job,
  JobDetail,
  PipelineStage,
  Parsed360Result,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasError(value: unknown): boolean {
  return isRecord(value) && 'error' in value;
}

function toCount(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function parseCompanies(data: unknown): Parsed360Result | null {
  if (!isRecord(data) || !Array.isArray(data.companies)) {
    return null;
  }
  const companies = data.companies as Company[];
  return { kind: 'companies', companies, count: toCount(data.count, companies.length) };
}

function parseTalents(data: unknown): Parsed360Result | null {
  if (Array.isArray(data)) {
    const talents = data as Talent[];
    return { kind: 'talents', talents, count: talents.length };
  }
  if (!isRecord(data) || !Array.isArray(data.talents)) {
    return null;
  }
  const talents = data.talents as Talent[];
  return {
    kind: 'talents',
    talents,
    count: toCount(data.count, talents.length),
    pool: typeof data.pool === 'string' ? data.pool : undefined,
    talentFinderUrl: typeof data.talent_finder_url === 'string' ? data.talent_finder_url : null,
  };
}

function parseJobs(toolName: string, data: unknown): Parsed360Result | null {
  const variant = toolName === 'list_jobs' ? 'list' : 'search';
  if (Array.isArray(data)) {
    const jobs = data as Job[];
    return { kind: 'jobs', jobs, count: jobs.length, variant };
  }
  if (!isRecord(data) || !Array.isArray(data.jobs)) {
    return null;
  }
  const jobs = data.jobs as Job[];
  return { kind: 'jobs', jobs, count: toCount(data.count, jobs.length), variant };
}

function parseJob(data: unknown): Parsed360Result | null {
  if (!isRecord(data) || typeof data.title !== 'string') {
    return null;
  }
  const job = data as unknown as JobDetail;
  if (Array.isArray(job.pipeline)) {
    job.pipeline = (job.pipeline as PipelineStage[])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return { kind: 'job', job };
}

export function parse360Output(
  toolName: string,
  output?: string | null,
): Parsed360Result | null {
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
    case 'search_jobs':
    case 'list_jobs':
      return parseJobs(toolName, data);
    case 'get_job':
      return parseJob(data);
    default:
      return null;
  }
}
