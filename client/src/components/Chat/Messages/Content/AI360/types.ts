export interface Company {
  id?: string | number;
  name?: string | null;
  linkedin_url?: string | null;
  linkedin_universal_name?: string | null;
  website?: string | null;
  industry?: string | null;
  employee_range?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface Talent {
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
  title?: string | null;
  current_company?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  open_to_work?: boolean;
  years_experience?: number | null;
  skills?: string[];
  profile_url?: string | null;
  summary?: string | null;
}

export interface Job {
  id: string | number;
  title?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  posting_url?: string | null;
  location?: string | null;
  workplace_type?: string | null;
  posted_at?: string | null;
  openings?: number | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  applications_count?: number | null;
}

export interface PipelineStage {
  name: string;
  order: number;
  candidates_count: number;
}

export interface JobDetail extends Job {
  department?: string | null;
  employment_type?: string | null;
  seniority_level?: string | null;
  remote_type?: string | null;
  salary_range?: string | null;
  pipeline?: PipelineStage[];
}

export interface Contact {
  full_name?: string | null;
  headline?: string | null;
  work_emails?: string[];
  personal_emails?: string[];
  phones?: string[];
  linkedin_url?: string | null;
  twitter_url?: string | null;
  github_url?: string | null;
  confidence?: string | number | null;
}

export interface OutreachPreview {
  status: 'preview' | 'sent';
  channel?: string | null;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
}

export type Parsed360Result =
  | { kind: 'companies'; companies: Company[]; count: number }
  | {
      kind: 'talents';
      talents: Talent[];
      count: number;
      pool?: string | null;
      talentFinderUrl?: string | null;
    }
  | { kind: 'jobs'; jobs: Job[]; count: number; variant: 'search' | 'list' }
  | { kind: 'job'; job: JobDetail }
  | { kind: 'contact'; contact: Contact }
  | { kind: 'outreach'; outreach: OutreachPreview };
