# 360AI MCP Result Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render 360AI MCP tool results (companies, talents/candidates, jobs, single job detail) as native, themed, interactive cards in the chat.360ai frontend instead of a raw JSON block.

**Architecture:** A self-contained `AI360/` module under the message-content tree parses the MCP tool's JSON `output` into a typed discriminated union and renders dedicated card components. A single guarded branch in the existing `ToolCallInfo.tsx` swaps cards in for the 360AI tools; everything else falls through to the current `OutputRenderer`. Parsing is tolerant — any failure returns `null` and the chat falls back to today's behavior.

**Tech Stack:** React + TypeScript, Tailwind (LibreChat theme tokens), `lucide-react` icons, `useLocalize()` i18n, Jest + React Testing Library (`test/layout-test-utils`).

## Global Constraints

- All new frontend code is **TypeScript**; **never use `any`**, limit `unknown`.
- All user-facing strings go through `useLocalize()`; add English keys to `client/src/locales/en/translation.json` only, prefixed `com_ui_360_`. i18n interpolation uses `{{0}}` syntax.
- Use existing LibreChat Tailwind theme tokens (`text-text-primary`, `text-text-secondary`, `border-border-medium`, `border-border-light`, `bg-surface-secondary`, `bg-surface-tertiary`) for automatic light/dark theming.
- External links: `target="_blank" rel="noopener noreferrer"`; link/action buttons render only when their URL/value exists.
- Interactive elements are keyboard-focusable with `aria-label`s.
- Keep the upstream-LibreChat footprint minimal: only `ToolCallInfo.tsx` and `ToolCall.tsx` are modified; all other logic lives under `AI360/`.
- Never break chat: parse failures / shape mismatch / error output → return `null` → existing `OutputRenderer` fallback.
- Run frontend tests from the `client` workspace: `cd client && npx jest <pattern>`.
- All TypeScript/ESLint diagnostics must be clean.

---

## File Structure

All new files under `client/src/components/Chat/Messages/Content/AI360/`:

- `types.ts` — TS interfaces (Company, Talent, Job, JobDetail, PipelineStage) + the `Parsed360Result` discriminated union.
- `tools.ts` — `AI360_TOOLS` name→kind map and `is360Tool(name)` guard.
- `parse.ts` — `parse360Output(toolName, output)` → `Parsed360Result | null`.
- `Bits.tsx` — shared presentational atoms: `Pill`, `LinkButton`, `CopyButton`, `ExpandableText`, `Avatar`, `SkillChips`.
- `ResultList.tsx` — generic "top-3 + show all N" collapsible shell + count header.
- `cards/CompanyCard.tsx`, `cards/TalentCard.tsx`, `cards/JobCard.tsx`, `cards/JobDetail.tsx`.
- `index.tsx` — `AI360ToolResult` dispatcher component (switch on `kind`).
- Tests in `AI360/__tests__/`.

Modified:
- `client/src/components/Chat/Messages/Content/ToolCallInfo.tsx` — accept `toolName` prop; branch to `AI360ToolResult`.
- `client/src/components/Chat/Messages/Content/ToolCall.tsx:248` — pass `toolName={function_name}`.
- `client/src/locales/en/translation.json` — add `com_ui_360_*` keys.

---

## Task 1: Types, tool registry, and tolerant parser

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/types.ts`
- Create: `client/src/components/Chat/Messages/Content/AI360/tools.ts`
- Create: `client/src/components/Chat/Messages/Content/AI360/parse.ts`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Company`, `Talent`, `Job`, `JobDetail`, `PipelineStage`, `Parsed360Result`.
  - `tools.ts`: `AI360_TOOLS` (const map), `AI360ToolName`, `is360Tool(name: string): name is AI360ToolName`.
  - `parse.ts`: `parse360Output(toolName: string, output?: string | null): Parsed360Result | null`.

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/parse.test.ts`
Expected: FAIL — cannot find modules `../parse` / `../tools`.

- [ ] **Step 3: Write `types.ts`**

```typescript
// client/src/components/Chat/Messages/Content/AI360/types.ts
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
  | { kind: 'job'; job: JobDetail };
```

- [ ] **Step 4: Write `tools.ts`**

```typescript
// client/src/components/Chat/Messages/Content/AI360/tools.ts
export const AI360_TOOLS = {
  search_companies: 'companies',
  search_talents: 'talents',
  search_candidates: 'talents',
  search_jobs: 'jobs',
  list_jobs: 'jobs',
  get_job: 'job',
} as const;

export type AI360ToolName = keyof typeof AI360_TOOLS;

export function is360Tool(name: string): name is AI360ToolName {
  return Object.prototype.hasOwnProperty.call(AI360_TOOLS, name);
}
```

- [ ] **Step 5: Write `parse.ts`**

```typescript
// client/src/components/Chat/Messages/Content/AI360/parse.ts
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

function parseTalents(toolName: string, data: unknown): Parsed360Result | null {
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
  if (Array.isArray(data)) {
    const jobs = data as Job[];
    return { kind: 'jobs', jobs, count: jobs.length, variant: 'list' };
  }
  if (!isRecord(data) || !Array.isArray(data.jobs)) {
    return null;
  }
  const jobs = data.jobs as Job[];
  return { kind: 'jobs', jobs, count: toCount(data.count, jobs.length), variant: 'search' };
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
      return parseTalents(toolName, data);
    case 'search_jobs':
    case 'list_jobs':
      return parseJobs(toolName, data);
    case 'get_job':
      return parseJob(data);
    default:
      return null;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/parse.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/types.ts \
        client/src/components/Chat/Messages/Content/AI360/tools.ts \
        client/src/components/Chat/Messages/Content/AI360/parse.ts \
        client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
git commit -m "feat(360ai): typed tolerant parser for MCP tool results"
```

---

## Task 2: Shared presentational atoms (Bits)

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/Bits.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/Bits.test.tsx`

**Interfaces:**
- Consumes: `useLocalize` from `~/hooks`; `cn` from `~/utils`.
- Produces:
  - `Pill({ children })`
  - `LinkButton({ href, label, icon })` — renders `null` when `href` is falsy.
  - `CopyButton({ text, label? })`
  - `ExpandableText({ text, clamp? })` — `clamp` default 2; toggles `line-clamp-{clamp}`; renders nothing when text empty.
  - `Avatar({ src, name })` — image with initials fallback on error/missing.
  - `SkillChips({ skills, max? })` — `max` default 5; shows "+N" toggle.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/Bits.test.tsx
import { fireEvent } from '@testing-library/react';
import { render, screen } from 'test/layout-test-utils';
import { LinkButton, ExpandableText, SkillChips, Avatar } from '../Bits';
import { ExternalLink } from 'lucide-react';

describe('LinkButton', () => {
  it('renders a link with href and opens in new tab', () => {
    render(<LinkButton href="https://acme.com" label="Website" icon={<ExternalLink />} />);
    const link = screen.getByRole('link', { name: 'Website' });
    expect(link).toHaveAttribute('href', 'https://acme.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing without href', () => {
    const { container } = render(<LinkButton href={null} label="Website" icon={<ExternalLink />} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ExpandableText', () => {
  it('toggles expansion', () => {
    render(<ExpandableText text="A long description here" clamp={2} />);
    const toggle = screen.getByRole('button');
    expect(screen.getByText('A long description here')).toHaveClass('line-clamp-2');
    fireEvent.click(toggle);
    expect(screen.getByText('A long description here')).not.toHaveClass('line-clamp-2');
  });

  it('renders nothing for empty text', () => {
    const { container } = render(<ExpandableText text="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SkillChips', () => {
  it('caps visible chips and reveals the rest', () => {
    render(<SkillChips skills={['a', 'b', 'c', 'd', 'e', 'f', 'g']} max={5} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('g')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('+2'));
    expect(screen.getByText('g')).toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('falls back to initials on image error', () => {
    render(<Avatar src="https://broken" name="Jane Doe" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/Bits.test.tsx`
Expected: FAIL — cannot find `../Bits`.

- [ ] **Step 3: Write `Bits.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/Bits.tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
      {children}
    </span>
  );
}

export function LinkButton({
  href,
  label,
  icon,
}: {
  href?: string | null;
  label: string;
  icon: ReactNode;
}) {
  if (!href) {
    return null;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border-medium px-2 py-1 text-xs',
        'text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
      )}
    >
      <span className="size-3.5" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </a>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const text_label = label ?? localize('com_ui_360_copy');
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? localize('com_ui_360_copied') : text_label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border-medium px-2 py-1 text-xs',
        'text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
      )}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span>{copied ? localize('com_ui_360_copied') : text_label}</span>
    </button>
  );
}

export function ExpandableText({ text, clamp = 2 }: { text?: string | null; clamp?: number }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  if (!text || text.trim().length === 0) {
    return null;
  }
  const clampClass = clamp === 3 ? 'line-clamp-3' : 'line-clamp-2';
  return (
    <div className="text-xs text-text-secondary">
      <p className={cn('whitespace-pre-wrap', !expanded && clampClass)}>{text}</p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-text-secondary hover:text-text-primary"
      >
        {expanded ? localize('com_ui_360_show_less') : localize('com_ui_360_show_more')}
        <ChevronDown
          className={cn('size-3 transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function initials(name?: string | null): string {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  if (showImage) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        onError={() => setFailed(true)}
        className="size-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-xs font-medium text-text-secondary">
      {initials(name)}
    </div>
  );
}

export function SkillChips({ skills, max = 5 }: { skills?: string[]; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!skills || skills.length === 0) {
    return null;
  }
  const visible = expanded ? skills : skills.slice(0, max);
  const hidden = skills.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((skill) => (
        <Pill key={skill}>{skill}</Pill>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
        >
          {`+${hidden}`}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add localization keys used by Bits**

Add these entries to `client/src/locales/en/translation.json` (keep file's alphabetical/section grouping; place near other `com_ui_` keys):

```json
"com_ui_360_copy": "Copy",
"com_ui_360_copied": "Copied",
"com_ui_360_show_more": "Show more",
"com_ui_360_show_less": "Show less",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/Bits.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/Bits.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/Bits.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): shared card atoms (Pill, LinkButton, CopyButton, ExpandableText, Avatar, SkillChips)"
```

---

## Task 3: CompanyCard

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/cards/CompanyCard.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/CompanyCard.test.tsx`

**Interfaces:**
- Consumes: `Company` from `../types`; `Pill, LinkButton, CopyButton, ExpandableText` from `../Bits`; `useLocalize`.
- Produces: `export default function CompanyCard({ company }: { company: Company })`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/CompanyCard.test.tsx
import { render, screen } from 'test/layout-test-utils';
import CompanyCard from '../cards/CompanyCard';

const base = {
  name: 'Acme',
  website: 'https://acme.com',
  linkedin_url: 'https://www.linkedin.com/company/acme',
  industry: 'Software',
  employee_range: '1001-5000',
  location: 'Berlin, Germany',
  description: 'We build things.',
};

describe('CompanyCard', () => {
  it('renders name, industry, location, employee range', () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Software')).toBeInTheDocument();
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument();
    expect(screen.getByText('1001-5000')).toBeInTheDocument();
  });

  it('renders Website and LinkedIn links', () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://acme.com');
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/acme',
    );
  });

  it('hides links when URLs are missing', () => {
    render(<CompanyCard company={{ name: 'NoLinks' }} />);
    expect(screen.queryByRole('link', { name: 'Website' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'LinkedIn' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/CompanyCard.test.tsx`
Expected: FAIL — cannot find `../cards/CompanyCard`.

- [ ] **Step 3: Write `CompanyCard.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/cards/CompanyCard.tsx
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
```

- [ ] **Step 4: Add localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_ui_360_website": "Website",
"com_ui_360_linkedin": "LinkedIn",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/CompanyCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/cards/CompanyCard.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/CompanyCard.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): CompanyCard"
```

---

## Task 4: TalentCard

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/cards/TalentCard.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/TalentCard.test.tsx`

**Interfaces:**
- Consumes: `Talent` from `../types`; `Avatar, SkillChips, LinkButton, CopyButton, ExpandableText` from `../Bits`; `useLocalize`.
- Produces: `export default function TalentCard({ talent }: { talent: Talent })`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/TalentCard.test.tsx
import { render, screen } from 'test/layout-test-utils';
import TalentCard from '../cards/TalentCard';

describe('TalentCard', () => {
  it('renders name, title, company, location, years, skills', () => {
    render(
      <TalentCard
        talent={{
          name: 'Jane Doe',
          title: 'Product Manager',
          current_company: 'Acme',
          location: 'Berlin',
          years_experience: 8,
          skills: ['SQL', 'Figma'],
          open_to_work: true,
          profile_url: 'https://360ai.test/talent/1',
          linkedin_url: 'https://linkedin.com/in/jane',
        }}
      />,
    );
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/Product Manager/)).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('8 yrs')).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();
    expect(screen.getByText('Open to work')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute(
      'href',
      'https://360ai.test/talent/1',
    );
  });

  it('hides open-to-work badge and profile link when absent', () => {
    render(<TalentCard talent={{ name: 'John Roe' }} />);
    expect(screen.queryByText('Open to work')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View profile' })).not.toBeInTheDocument();
  });

  it('renders candidate summary when present', () => {
    render(<TalentCard talent={{ name: 'Sam', summary: 'Backend engineer' }} />);
    expect(screen.getByText('Backend engineer')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/TalentCard.test.tsx`
Expected: FAIL — cannot find `../cards/TalentCard`.

- [ ] **Step 3: Write `TalentCard.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/cards/TalentCard.tsx
import { Linkedin, UserRound, MapPin } from 'lucide-react';
import type { Talent } from '../types';
import { useLocalize } from '~/hooks';
import { Avatar, SkillChips, LinkButton, CopyButton, ExpandableText } from '../Bits';

export default function TalentCard({ talent }: { talent: Talent }) {
  const localize = useLocalize();
  const subtitle = [talent.title, talent.current_company].filter(Boolean).join(' @ ');
  const copyText = [talent.name, talent.title, talent.linkedin_url].filter(Boolean).join(' — ');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-medium bg-surface-primary p-3">
      <div className="flex items-start gap-2.5">
        <Avatar src={talent.avatar} name={talent.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-text-primary">{talent.name}</h4>
            {talent.open_to_work === true && (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                {localize('com_ui_360_open_to_work')}
              </span>
            )}
          </div>
          {subtitle && <p className="truncate text-xs text-text-secondary">{subtitle}</p>}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
            {talent.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {talent.location}
              </span>
            )}
            {typeof talent.years_experience === 'number' && (
              <span>{localize('com_ui_360_years_exp', { 0: talent.years_experience })}</span>
            )}
          </div>
        </div>
      </div>
      <SkillChips skills={talent.skills} />
      <ExpandableText text={talent.summary} />
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <LinkButton
          href={talent.profile_url}
          label={localize('com_ui_360_view_profile')}
          icon={<UserRound />}
        />
        <LinkButton
          href={talent.linkedin_url}
          label={localize('com_ui_360_linkedin')}
          icon={<Linkedin />}
        />
        {copyText && <CopyButton text={copyText} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_ui_360_open_to_work": "Open to work",
"com_ui_360_years_exp": "{{0}} yrs",
"com_ui_360_view_profile": "View profile",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/TalentCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/cards/TalentCard.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/TalentCard.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): TalentCard (talents + candidates)"
```

---

## Task 5: JobCard (search + list variants)

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/cards/JobCard.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/JobCard.test.tsx`

**Interfaces:**
- Consumes: `Job` from `../types`; `Pill, LinkButton, CopyButton, ExpandableText` from `../Bits`; `useLocalize`.
- Produces: `export default function JobCard({ job, variant }: { job: Job; variant: 'search' | 'list' })`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/JobCard.test.tsx
import { render, screen } from 'test/layout-test-utils';
import JobCard from '../cards/JobCard';

describe('JobCard search variant', () => {
  it('renders title, company, workplace type, openings and posting link', () => {
    render(
      <JobCard
        variant="search"
        job={{
          id: 'j1',
          title: 'Engineer',
          company_name: 'Acme',
          workplace_type: 'remote',
          openings: 3,
          posting_url: 'https://jobs.acme.com/1',
          description: 'Build cool things.',
        }}
      />,
    );
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('remote')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View posting' })).toHaveAttribute(
      'href',
      'https://jobs.acme.com/1',
    );
  });
});

describe('JobCard list variant', () => {
  it('renders status pill and applications count', () => {
    render(
      <JobCard
        variant="list"
        job={{ id: 5, title: 'Designer', status: 'open', applications_count: 12 }}
      />,
    );
    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('12 applications')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/JobCard.test.tsx`
Expected: FAIL — cannot find `../cards/JobCard`.

- [ ] **Step 3: Write `JobCard.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/cards/JobCard.tsx
import { Briefcase, MapPin, ExternalLink, Users } from 'lucide-react';
import type { Job } from '../types';
import { useLocalize } from '~/hooks';
import { Pill, LinkButton, ExpandableText } from '../Bits';

export default function JobCard({ job, variant }: { job: Job; variant: 'search' | 'list' }) {
  const localize = useLocalize();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-medium bg-surface-primary p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-text-primary">{job.title}</h4>
            {variant === 'list' && job.status && <Pill>{job.status}</Pill>}
            {variant === 'search' && job.workplace_type && <Pill>{job.workplace_type}</Pill>}
          </div>
          {variant === 'search' && job.company_name && (
            <p className="truncate text-xs text-text-secondary">{job.company_name}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {job.location}
          </span>
        )}
        {typeof job.openings === 'number' && (
          <span className="flex items-center gap-1">
            <Briefcase className="size-3" aria-hidden="true" />
            {localize('com_ui_360_openings', { 0: job.openings })}
          </span>
        )}
        {variant === 'list' && typeof job.applications_count === 'number' && (
          <span className="flex items-center gap-1">
            <Users className="size-3" aria-hidden="true" />
            {localize('com_ui_360_applications', { 0: job.applications_count })}
          </span>
        )}
      </div>
      {variant === 'search' && <ExpandableText text={job.description} />}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {variant === 'search' && (
          <LinkButton
            href={job.posting_url}
            label={localize('com_ui_360_view_posting')}
            icon={<ExternalLink />}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_ui_360_view_posting": "View posting",
"com_ui_360_openings": "{{0}} openings",
"com_ui_360_applications": "{{0}} applications",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/JobCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/cards/JobCard.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/JobCard.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): JobCard (search + list variants)"
```

---

## Task 6: JobDetail card

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/cards/JobDetail.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/JobDetail.test.tsx`

**Interfaces:**
- Consumes: `JobDetail` from `../types`; `Pill, ExpandableText` from `../Bits`; `useLocalize`.
- Produces: `export default function JobDetailCard({ job }: { job: JobDetail })`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/JobDetail.test.tsx
import { render, screen } from 'test/layout-test-utils';
import JobDetailCard from '../cards/JobDetail';

describe('JobDetailCard', () => {
  it('renders title, meta fields, and pipeline stages', () => {
    render(
      <JobDetailCard
        job={{
          id: 9,
          title: 'Staff Engineer',
          status: 'open',
          department: 'Engineering',
          employment_type: 'Full-time',
          seniority_level: 'Staff',
          remote_type: 'Hybrid',
          salary_range: '$180k–$220k',
          location: 'NYC',
          applications_count: 14,
          description: 'Lead the platform team.',
          pipeline: [
            { name: 'Applied', order: 1, candidates_count: 10 },
            { name: 'Screen', order: 2, candidates_count: 4 },
          ],
        }}
      />,
    );
    expect(screen.getByText('Staff Engineer')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('$180k–$220k')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Screen')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/JobDetail.test.tsx`
Expected: FAIL — cannot find `../cards/JobDetail`.

- [ ] **Step 3: Write `JobDetail.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/cards/JobDetail.tsx
import type { ReactNode } from 'react';
import type { JobDetail } from '../types';
import { useLocalize } from '~/hooks';
import { Pill, ExpandableText } from '../Bits';

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</span>
      <span className="text-xs text-text-primary">{value}</span>
    </div>
  );
}

export default function JobDetailCard({ job }: { job: JobDetail }) {
  const localize = useLocalize();
  const meta: ReactNode = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MetaItem label={localize('com_ui_360_department')} value={job.department} />
      <MetaItem label={localize('com_ui_360_employment_type')} value={job.employment_type} />
      <MetaItem label={localize('com_ui_360_seniority')} value={job.seniority_level} />
      <MetaItem label={localize('com_ui_360_remote_type')} value={job.remote_type} />
      <MetaItem label={localize('com_ui_360_salary')} value={job.salary_range} />
      <MetaItem label={localize('com_ui_360_location')} value={job.location} />
    </div>
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-medium bg-surface-primary p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-text-primary">{job.title}</h3>
        {job.status && <Pill>{job.status}</Pill>}
      </div>
      {meta}
      <ExpandableText text={job.description} clamp={3} />
      {Array.isArray(job.pipeline) && job.pipeline.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
            {localize('com_ui_360_pipeline')}
          </p>
          <div className="flex flex-wrap gap-2">
            {job.pipeline.map((stage) => (
              <div
                key={`${stage.order}-${stage.name}`}
                className="flex flex-col items-center rounded-md border border-border-light bg-surface-secondary px-3 py-1.5"
              >
                <span className="text-sm font-semibold text-text-primary">
                  {stage.candidates_count}
                </span>
                <span className="text-[11px] text-text-secondary">{stage.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_ui_360_department": "Department",
"com_ui_360_employment_type": "Employment",
"com_ui_360_seniority": "Seniority",
"com_ui_360_remote_type": "Remote",
"com_ui_360_salary": "Salary",
"com_ui_360_location": "Location",
"com_ui_360_pipeline": "Pipeline",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/JobDetail.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/cards/JobDetail.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/JobDetail.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): JobDetail card with pipeline strip"
```

---

## Task 7: ResultList collapsible shell

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/ResultList.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/ResultList.test.tsx`

**Interfaces:**
- Consumes: `useLocalize`; `cn` from `~/utils`.
- Produces:
  `export default function ResultList<T>({ items, header, renderItem, getKey, initial }: { items: T[]; header: ReactNode; renderItem: (item: T) => ReactNode; getKey: (item: T, index: number) => string; initial?: number })`
  — renders `header`, then first `initial` (default 3) items; a "Show all N" button reveals the rest; "Show less" collapses. Renders an empty-state line when `items` is empty.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/ResultList.test.tsx
import { fireEvent } from '@testing-library/react';
import { render, screen } from 'test/layout-test-utils';
import ResultList from '../ResultList';

const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: `Item ${i}` }));

describe('ResultList', () => {
  it('shows only the first 3 items, then reveals the rest', () => {
    render(
      <ResultList
        items={items}
        header={<span>5 things</span>}
        getKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    expect(screen.getByText('Item 0')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.queryByText('Item 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show all 5/i }));
    expect(screen.getByText('Item 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.queryByText('Item 4')).not.toBeInTheDocument();
  });

  it('renders an empty state and no toggle for no items', () => {
    render(
      <ResultList
        items={[]}
        header={<span>0 things</span>}
        getKey={(it: { id: string }) => it.id}
        renderItem={() => null}
      />,
    );
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a toggle when items fit under the initial cap', () => {
    render(
      <ResultList
        items={items.slice(0, 2)}
        header={<span>2 things</span>}
        getKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/ResultList.test.tsx`
Expected: FAIL — cannot find `../ResultList`.

- [ ] **Step 3: Write `ResultList.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/ResultList.tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ResultListProps<T> {
  items: T[];
  header: ReactNode;
  renderItem: (item: T) => ReactNode;
  getKey: (item: T, index: number) => string;
  initial?: number;
}

export default function ResultList<T>({
  items,
  header,
  renderItem,
  getKey,
  initial = 3,
}: ResultListProps<T>) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-text-secondary">{header}</div>
        <p className="text-xs text-text-tertiary">{localize('com_ui_360_no_results')}</p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, initial);
  const hasMore = items.length > initial;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-text-secondary">{header}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((item, index) => (
          <div key={getKey(item, index)}>{renderItem(item)}</div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'inline-flex items-center gap-1 self-start text-xs text-text-secondary',
            'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
          )}
        >
          {expanded
            ? localize('com_ui_360_show_less')
            : localize('com_ui_360_show_all', { 0: items.length })}
          <ChevronDown
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_ui_360_no_results": "No results",
"com_ui_360_show_all": "Show all {{0}}",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/ResultList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/ResultList.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/ResultList.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): ResultList collapsible top-N shell"
```

---

## Task 8: Dispatcher (`index.tsx`)

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/index.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/index.test.tsx`

**Interfaces:**
- Consumes: `Parsed360Result` from `./types`; `is360Tool` from `./tools`; `parse360Output` from `./parse`; all four cards; `ResultList`; `LinkButton` from `./Bits`; `useLocalize`.
- Produces:
  - `export { is360Tool } from './tools';`
  - `export { parse360Output } from './parse';`
  - `export default function AI360ToolResult({ result }: { result: Parsed360Result })`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/AI360/__tests__/index.test.tsx
import { render, screen } from 'test/layout-test-utils';
import AI360ToolResult, { parse360Output, is360Tool } from '../index';

describe('AI360ToolResult dispatcher', () => {
  it('renders company cards from a parsed companies result', () => {
    const result = parse360Output(
      'search_companies',
      JSON.stringify({ count: 1, companies: [{ id: '1', name: 'Acme' }] }),
    );
    expect(result).not.toBeNull();
    render(<AI360ToolResult result={result!} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(/1 companies/)).toBeInTheDocument();
  });

  it('renders the talent finder link in the talents header', () => {
    const result = parse360Output(
      'search_talents',
      JSON.stringify({
        count: 1,
        pool: 'global',
        talent_finder_url: 'https://360ai.test/tf',
        talents: [{ id: 'a', name: 'Jane' }],
      }),
    );
    render(<AI360ToolResult result={result!} />);
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /talent finder/i })).toHaveAttribute(
      'href',
      'https://360ai.test/tf',
    );
  });

  it('renders a single job detail without a list shell', () => {
    const result = parse360Output(
      'get_job',
      JSON.stringify({ id: 1, title: 'Staff Eng', status: 'open' }),
    );
    render(<AI360ToolResult result={result!} />);
    expect(screen.getByText('Staff Eng')).toBeInTheDocument();
  });

  it('re-exports is360Tool', () => {
    expect(is360Tool('search_jobs')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AI360/__tests__/index.test.tsx`
Expected: FAIL — cannot find `../index`.

- [ ] **Step 3: Write `index.tsx`**

```tsx
// client/src/components/Chat/Messages/Content/AI360/index.tsx
import { Sparkles } from 'lucide-react';
import type { Parsed360Result } from './types';
import { useLocalize } from '~/hooks';
import { parse360Output } from './parse';
import { is360Tool } from './tools';
import CompanyCard from './cards/CompanyCard';
import TalentCard from './cards/TalentCard';
import JobCard from './cards/JobCard';
import JobDetailCard from './cards/JobDetail';
import ResultList from './ResultList';
import { LinkButton } from './Bits';

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
```

- [ ] **Step 4: Add localization keys**

Add to `client/src/locales/en/translation.json`:

```json
"com_ui_360_companies_count": "{{0}} companies",
"com_ui_360_talents_count": "{{0}} talents",
"com_ui_360_jobs_count": "{{0}} jobs",
"com_ui_360_talent_finder": "Talent Finder",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest AI360/__tests__/index.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Chat/Messages/Content/AI360/index.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/index.test.tsx \
        client/src/locales/en/translation.json
git commit -m "feat(360ai): result dispatcher (companies/talents/jobs/job)"
```

---

## Task 9: Wire into the tool-result pipeline

**Files:**
- Modify: `client/src/components/Chat/Messages/Content/ToolCallInfo.tsx`
- Modify: `client/src/components/Chat/Messages/Content/ToolCall.tsx:248`
- Test: `client/src/components/Chat/Messages/Content/__tests__/ToolCallInfo.360.test.tsx`

**Interfaces:**
- Consumes: `AI360ToolResult`, `parse360Output`, `is360Tool` from `./AI360`.
- Produces: `ToolCallInfo` gains an optional `toolName?: string` prop; renders `AI360ToolResult` in place of `OutputRenderer` when the output parses to a 360AI result.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/Chat/Messages/Content/__tests__/ToolCallInfo.360.test.tsx
import { render, screen } from 'test/layout-test-utils';
import ToolCallInfo from '../ToolCallInfo';

describe('ToolCallInfo 360AI integration', () => {
  it('renders cards for a 360AI tool output', () => {
    render(
      <ToolCallInfo
        toolName="search_companies"
        input="{}"
        output={JSON.stringify({ count: 1, companies: [{ id: '1', name: 'Acme' }] })}
      />,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('falls back to raw output for non-360 tools', () => {
    render(<ToolCallInfo toolName="some_other_tool" input="{}" output={'plain text output'} />);
    expect(screen.getByText(/plain text output/)).toBeInTheDocument();
  });

  it('falls back to raw output when a 360 tool output fails to parse', () => {
    render(<ToolCallInfo toolName="search_companies" input="{}" output={'not-json'} />);
    expect(screen.getByText(/not-json/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest ToolCallInfo.360.test.tsx`
Expected: FAIL — `toolName` prop ignored; cards not rendered.

- [ ] **Step 3: Modify `ToolCallInfo.tsx`**

Add the import near the other content-component imports (after line 10):

```tsx
import AI360ToolResult, { parse360Output, is360Tool } from './AI360';
```

Add `useMemo` to the existing react import on line 1:

```tsx
import { useState, useMemo } from 'react';
```
(already present — leave as is if `useMemo` is already imported.)

Change the function signature (lines 95–103) to accept `toolName`:

```tsx
export default function ToolCallInfo({
  input,
  output,
  attachments,
  toolName = '',
}: {
  input: string;
  output?: string | null;
  attachments?: TAttachment[];
  toolName?: string;
}) {
```

Immediately before the `return (` (after the `uiResources` declaration, ~line 130), compute the parsed 360 result:

```tsx
  const parsed360 = useMemo(() => {
    if (!output || !is360Tool(toolName)) {
      return null;
    }
    return parse360Output(toolName, output);
  }, [output, toolName]);
```

Replace the output line (line 133):

```tsx
      {output && <OutputRenderer text={output} />}
```

with:

```tsx
      {parsed360 ? <AI360ToolResult result={parsed360} /> : output && <OutputRenderer text={output} />}
```

- [ ] **Step 4: Modify `ToolCall.tsx` to pass the tool name**

At line 248, change:

```tsx
              <ToolCallInfo input={args ?? ''} output={output} attachments={attachments} />
```

to:

```tsx
              <ToolCallInfo
                input={args ?? ''}
                output={output}
                attachments={attachments}
                toolName={function_name}
              />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx jest ToolCallInfo.360.test.tsx`
Expected: PASS (cards for 360 tool; raw fallback otherwise).

- [ ] **Step 6: Run the full AI360 suite + typecheck/lint**

Run: `cd client && npx jest AI360 ToolCallInfo.360`
Expected: PASS.

Run: `npm run build:data-provider` (no-op if unchanged) then from `client`: `npx tsc --noEmit` (or the project's typecheck script) and the linter on the new files.
Expected: no TypeScript/ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Chat/Messages/Content/ToolCallInfo.tsx \
        client/src/components/Chat/Messages/Content/ToolCall.tsx \
        client/src/components/Chat/Messages/Content/__tests__/ToolCallInfo.360.test.tsx
git commit -m "feat(360ai): render MCP result cards in tool-call output"
```

---

## Task 10: Manual verification & polish

**Files:** none (verification only; minor fixes as needed, each its own commit).

- [ ] **Step 1: Run the app**

Per CLAUDE.md: `npm run build:packages` once, then `npm run backend:dev` + `npm run frontend:dev`. Open `https://chat.360ai.test` (or `http://localhost:3090`).

- [ ] **Step 2: Exercise each tool in a chat**

Ask the assistant prompts that trigger each 360AI MCP tool: company search, talent search, candidate search, job search, list internal jobs, and a single job detail. Confirm:
- Cards render (not raw JSON), theme matches light/dark.
- Lists show top-3 with a working "Show all N" / "Show less".
- Links open the right URLs in a new tab; copy buttons work; expand/collapse works.
- Talents header shows pool + Talent Finder link when present.
- `whoami` and any non-360 MCP tool still render as before (raw output).

- [ ] **Step 3: Verify the fallback path**

Force/observe an error or empty result (e.g. a search with no matches) and confirm the empty-state line shows; confirm a tool error still falls back to `OutputRenderer` without breaking the message.

- [ ] **Step 4: Final commit (if any polish was needed)**

```bash
git add -A
git commit -m "polish(360ai): result card verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** companies (T3), talents+candidates (T4), jobs search+list (T5), job detail (T6), collapsible top-3 lists + count header + Talent Finder link + empty state (T7, T8), interactive links/copy/expand (T2 used across cards), tolerant parse + fallback (T1, T9), localization (every card task), streaming preserved (T9 keeps existing in-progress UI; cards only render once `output` exists), tests per unit (every task). All spec sections map to a task.
- **Server-name gating:** the spec mentioned gating on the 360AI server name. This plan gates on the distinctive 360AI tool-name set (`is360Tool`), which is unambiguous in practice and avoids depending on the exact configured MCP server string. If a future MCP server reuses one of these names, tighten `is360Tool`/`ToolCallInfo` to also check `mcpServerName` (already available in `ToolCall.tsx`).
- **Type consistency:** `parse360Output`, `is360Tool`, `Parsed360Result`, and the four card prop shapes are used consistently across tasks; `JobDetailCard` (component) vs `JobDetail` (type) named distinctly to avoid collision.
