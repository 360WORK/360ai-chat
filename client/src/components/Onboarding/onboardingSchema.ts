/**
 * Static onboarding question tree.
 *
 * This is the single client-side source of truth for the structured questions
 * the onboarding agent asks. The agent is instructed (via the injected
 * interview script in `packages/api/src/onboarding/interview.ts`) to ask these
 * questions in order and to append a machine-readable marker to each question
 * message of the form:
 *
 *     <!--onboarding-step:STEP_ID-->
 *
 * The client detects that marker in the latest assistant message, looks up the
 * step here, and renders a pill selector (`PillOptions`) for it.
 *
 * The step IDs here MUST match the IDs the agent emits. They are grouped by
 * path (`business_type` is the root; each path is a linear sequence).
 */

export type OnboardingOption = {
  /** Machine value (used for routing / persistence semantics on the agent side). */
  value: string;
  /** Human-readable label shown on the pill and sent back in the user's reply. */
  label: string;
};

export type OnboardingOptionGroup = {
  /** Group id within the step, e.g. 'seniority' or 'region'. */
  id: string;
  /** Sub-label for compound questions (e.g. "Seniority"); null for single-group steps. */
  label: string | null;
  /** Allow multiple selections within this group. */
  multi: boolean;
  /** Show a "+ add your own" inline entry that adds a custom pill. */
  allowCustom?: boolean;
  options: OnboardingOption[];
};

export type OnboardingStep = {
  /** Stable id matching the agent-emitted marker, e.g. 'recruitment_agency.role'. */
  id: string;
  /** The question prompt (matches what the agent asks). */
  prompt: string;
  /** Optional helper / hint shown under the prompt. */
  helper?: string;
  /** One group for simple questions, two+ for compound ("Seniority + Region"). */
  groups: OnboardingOptionGroup[];
};

/* --------------------------------- options -------------------------------- */

const BUSINESS_TYPES: OnboardingOption[] = [
  { value: 'recruitment_agency', label: 'Recruitment Agency' },
  { value: 'executive_search', label: 'Executive Search' },
  { value: 'rec2rec', label: 'Rec2Rec' },
  { value: 'rpo_provider', label: 'RPO Provider' },
  { value: 'in_house_ta', label: 'In-house TA' },
  { value: 'enterprise_talent', label: 'Enterprise Talent' },
];

const REGIONS: OnboardingOption[] = [
  { value: 'uk_ireland', label: 'UK & Ireland' },
  { value: 'europe', label: 'Europe' },
  { value: 'north_america', label: 'North America' },
  { value: 'apac', label: 'APAC' },
  { value: 'global', label: 'Global' },
];

const multiRegion = (extra: OnboardingOption[] = []): OnboardingOptionGroup => ({
  id: 'region',
  label: 'Region',
  multi: true,
  options: [...REGIONS, ...extra],
});

const single = (id: string, opts: OnboardingOption[]): OnboardingOptionGroup => ({
  id,
  label: null,
  multi: false,
  options: opts,
});

const multi = (
  id: string,
  label: string | null,
  opts: OnboardingOption[],
  allowCustom = false,
): OnboardingOptionGroup => ({
  id,
  label,
  multi: true,
  allowCustom,
  options: opts,
});

const L = (labels: string[]): OnboardingOption[] =>
  labels.map((label) => ({
    value: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
    label,
  }));

/* --------------------------------- Step 1 --------------------------------- */

const BUSINESS_TYPE_STEP: OnboardingStep = {
  id: 'business_type',
  prompt: 'What kind of business are you?',
  helper: 'Tap one — this tailors the rest of setup to your world.',
  groups: [single('value', BUSINESS_TYPES)],
};

/* --------------------------- Recruitment Agency --------------------------- */

const RECRUITMENT_AGENCY: OnboardingStep[] = [
  {
    id: 'recruitment_agency.role',
    prompt: "What's your role?",
    groups: [
      single(
        'role',
        L(['Recruiter', 'Resourcer', 'Researcher', 'Biz Dev', 'Operations', 'Director']),
      ),
    ],
  },
  {
    id: 'recruitment_agency.desk',
    prompt: 'Which side of the desk?',
    groups: [single('desk', L(['Mostly candidates', 'Mostly clients', 'Both']))],
  },
  {
    id: 'recruitment_agency.how',
    prompt: 'How do you work?',
    groups: [single('how', L(['Contingent', 'Retained', 'Contract & temp', 'Mixed']))],
  },
  {
    id: 'recruitment_agency.recruits',
    prompt: 'What do you recruit?',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'recruits',
        null,
        L([
          'Tech',
          'Finance',
          'Healthcare',
          'Engineering',
          'Sales & Marketing',
          'Legal',
          'Life Sciences',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'recruitment_agency.placement',
    prompt: 'Who do you place, and where?',
    helper: 'Tap all that apply.',
    groups: [
      multi('seniority', 'Seniority', L(['Junior', 'Mid', 'Senior', 'Leadership'])),
      multiRegion(),
    ],
  },
];

/* --------------------------- Executive Search ----------------------------- */

const EXECUTIVE_SEARCH: OnboardingStep[] = [
  {
    id: 'executive_search.role',
    prompt: "What's your role?",
    groups: [
      single(
        'role',
        L(['Researcher', 'Associate', 'Consultant', 'Partner', 'Delivery Lead', 'Operations']),
      ),
    ],
  },
  {
    id: 'executive_search.level',
    prompt: 'What level do you search at?',
    groups: [single('level', L(['Board', 'C-suite', 'VP & Director', 'Senior leadership']))],
  },
  {
    id: 'executive_search.search_start',
    prompt: 'How do you usually start a search?',
    groups: [
      single(
        'search_start',
        L(['Market map', 'Target company list', 'Referral-led', 'Client brief']),
      ),
    ],
  },
  {
    id: 'executive_search.practice_areas',
    prompt: 'Practice areas',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'practice_areas',
        null,
        L([
          'Technology',
          'Financial Services',
          'Industrial',
          'Consumer',
          'Life Sciences',
          'PE/VC-backed',
          'Professional Services',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'executive_search.functions_regions',
    prompt: 'Functions and regions',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'functions',
        'Functions',
        L(['CEO/GM', 'Finance', 'Technology', 'Commercial', 'People/HR', 'Operations']),
      ),
      multiRegion(),
    ],
  },
];

/* ------------------------------- Rec2Rec ---------------------------------- */

const REC2REC: OnboardingStep[] = [
  {
    id: 'rec2rec.role',
    prompt: "What's your role?",
    groups: [single('role', L(['Recruiter', 'Researcher', 'Biz Dev', 'Operations', 'Director']))],
  },
  {
    id: 'rec2rec.side',
    prompt: 'Which side are you on?',
    groups: [single('side', L(['Placing recruiters', 'Winning agency clients', 'Both']))],
  },
  {
    id: 'rec2rec.place',
    prompt: 'Who do you place?',
    groups: [
      single(
        'place',
        L([
          'Agency recruiters',
          'In-house TA',
          'Exec search consultants',
          'Recruitment leaders',
          'Resourcers/researchers',
          'Contract recruiters',
        ]),
      ),
    ],
  },
  {
    id: 'rec2rec.desks',
    prompt: 'What desks do they specialise in?',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'desks',
        null,
        L(['Tech', 'Finance', 'Healthcare', 'Engineering', 'Sales', 'Construction', 'Generalist']),
        true,
      ),
    ],
  },
  {
    id: 'rec2rec.seniority_region',
    prompt: 'Seniority and region',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'seniority',
        'Seniority',
        L(['Consultant', 'Senior/Principal', 'Manager', 'Director/Leadership']),
      ),
      multiRegion(),
    ],
  },
];

/* ----------------------------- RPO Provider ------------------------------- */

const RPO_PROVIDER: OnboardingStep[] = [
  {
    id: 'rpo_provider.role',
    prompt: "What's your role?",
    groups: [
      single(
        'role',
        L(['Sourcer', 'Recruiter', 'Account Lead', 'Delivery Manager', 'Operations', 'Director']),
      ),
    ],
  },
  {
    id: 'rpo_provider.model',
    prompt: 'Engagement model?',
    groups: [single('model', L(['Enterprise RPO', 'Project RPO', 'On-demand', 'Embedded']))],
  },
  {
    id: 'rpo_provider.profile',
    prompt: 'Hiring profile?',
    groups: [
      single(
        'profile',
        L(['High-volume', 'Professional/specialist', 'Niche/hard-to-fill', 'Mixed']),
      ),
    ],
  },
  {
    id: 'rpo_provider.sectors',
    prompt: 'Client sectors',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'sectors',
        null,
        L([
          'Tech',
          'Finance',
          'Healthcare',
          'Manufacturing',
          'Retail',
          'Public Sector',
          'Life Sciences',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'rpo_provider.seniority_region',
    prompt: 'Seniority and region',
    helper: 'Tap all that apply.',
    groups: [
      multi('seniority', 'Seniority', L(['Entry/volume', 'Mid', 'Senior', 'Leadership'])),
      multiRegion(),
    ],
  },
];

/* ------------------------------ In-house TA ------------------------------- */

const IN_HOUSE_TA: OnboardingStep[] = [
  {
    id: 'in_house_ta.role',
    prompt: "What's your role?",
    groups: [
      single(
        'role',
        L(['Sourcer', 'Recruiter', 'TA Partner', 'TA Manager', 'Coordinator', 'Head of TA']),
      ),
    ],
  },
  {
    id: 'in_house_ta.company_does',
    prompt: 'What does your company do?',
    groups: [
      multi(
        'company_does',
        null,
        L([
          'Tech/SaaS',
          'Finance',
          'Healthcare',
          'Retail/Consumer',
          'Manufacturing',
          'Professional Services',
          'Public Sector',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'in_house_ta.hire_for',
    prompt: 'What do you hire for?',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'hire_for',
        null,
        L([
          'Engineering',
          'Product',
          'Sales',
          'Marketing',
          'Finance',
          'Operations',
          'Customer',
          'People/G&A',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'in_house_ta.profile',
    prompt: 'Hiring profile?',
    groups: [
      single('profile', L(['Scaling fast', 'Steady backfill', 'Niche/specialist', 'High-volume'])),
    ],
  },
  {
    id: 'in_house_ta.seniority_region',
    prompt: 'Seniority and region',
    helper: 'Tap all that apply.',
    groups: [
      multi('seniority', 'Seniority', L(['Entry', 'Mid', 'Senior', 'Leadership'])),
      multiRegion(),
    ],
  },
];

/* --------------------------- Enterprise Talent ---------------------------- */

const ENTERPRISE_TALENT: OnboardingStep[] = [
  {
    id: 'enterprise_talent.role',
    prompt: "What's your role?",
    groups: [
      single(
        'role',
        L([
          'Sourcer/Recruiter',
          'Talent Intelligence',
          'TA Lead',
          'Workforce Planning',
          'People Analytics',
          'HR Leader',
        ]),
      ),
    ],
  },
  {
    id: 'enterprise_talent.use_for',
    prompt: 'What do you mainly use it for?',
    groups: [
      single(
        'use_for',
        L([
          'Talent mapping',
          'Competitor intelligence',
          'Workforce planning',
          'Diversity benchmarking',
          'Location strategy',
          'Live hiring',
        ]),
      ),
    ],
  },
  {
    id: 'enterprise_talent.sector',
    prompt: 'Your sector?',
    groups: [
      multi(
        'sector',
        null,
        L([
          'Tech',
          'Finance',
          'Healthcare',
          'Manufacturing',
          'Retail/Consumer',
          'Energy',
          'Pharma/Life Sciences',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'enterprise_talent.functions',
    prompt: 'Functions you cover',
    helper: 'Tap all that apply.',
    groups: [
      multi(
        'functions',
        null,
        L([
          'Engineering',
          'Commercial',
          'Finance',
          'Operations',
          'Product',
          'Data/Analytics',
          'People',
        ]),
        true,
      ),
    ],
  },
  {
    id: 'enterprise_talent.seniority_regions',
    prompt: 'Seniority and regions',
    helper: 'Tap all that apply.',
    groups: [
      multi('seniority', 'Seniority', L(['Entry', 'Mid', 'Senior', 'Leadership', 'Exec'])),
      multiRegion([{ value: 'mea', label: 'MEA' }]),
    ],
  },
];

/* -------------------------------- registry -------------------------------- */

export const ONBOARDING_STEPS: Record<string, OnboardingStep> = [BUSINESS_TYPE_STEP]
  .concat(RECRUITMENT_AGENCY)
  .concat(EXECUTIVE_SEARCH)
  .concat(REC2REC)
  .concat(RPO_PROVIDER)
  .concat(IN_HOUSE_TA)
  .concat(ENTERPRISE_TALENT)
  .reduce(
    (acc, step) => {
      acc[step.id] = step;
      return acc;
    },
    {} as Record<string, OnboardingStep>,
  );

/* ------------------------------ marker format ----------------------------- */

/**
 * Regex matching the onboarding-step marker the agent appends to its question
 * messages. Captures the step id in group 1.
 *
 * Marker format (an HTML comment so it is invisible in rendered markdown even
 * before any client-side stripping):
 *
 *     <!--onboarding-step:recruitment_agency.role-->
 *
 * Used for predefined steps in the standard set.
 */
export const ONBOARDING_STEP_MARKER = /<!--\s*onboarding-step:([a-z0-9_.-]+)\s*-->/gi;

/**
 * Regex matching an inline onboarding-question spec emitted by the agent as a
 * fenced code block with info string `onboarding`. Captures the JSON body in
 * group 1. Used for adaptive/dynamic questions that aren't in the standard set.
 *
 *     ```onboarding
 *     { "prompt": "...", "groups": [...] }
 *     ```
 */
export const ONBOARDING_INLINE_BLOCK = /```onboarding\s*\n([\s\S]*?)```/gi;

/**
 * Strip an unclosed trailing opener (a marker/fence still streaming in
 * token-by-token) by cutting from its first remaining occurrence to the end.
 * Called AFTER complete blocks/markers are removed, so any occurrence left is
 * unclosed — but only cut when no closer follows (guards malformed-yet-closed
 * leftovers).
 */
function stripUnclosedTail(text: string, opener: string, closer: string): string {
  const idx = text.indexOf(opener);
  if (idx === -1 || text.indexOf(closer, idx + opener.length) !== -1) {
    return text;
  }
  return text.slice(0, idx);
}

/**
 * Strip ALL onboarding markers (step comments + inline blocks) from text.
 * Also strips a trailing UNCLOSED marker/fence so raw JSON never flashes while
 * a block streams in before its closing fence has arrived.
 */
export function stripOnboardingMarkers(text: string): string {
  if (!text.includes('<!--onboarding-step') && !text.includes('```onboarding')) {
    return text;
  }
  let stripped = text.replace(ONBOARDING_INLINE_BLOCK, '').replace(ONBOARDING_STEP_MARKER, '');
  stripped = stripUnclosedTail(stripped, '```onboarding', '```');
  stripped = stripUnclosedTail(stripped, '<!--onboarding-step', '-->');
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}

/** Extract the first onboarding-step id from message text, if any. */
export function extractOnboardingStepId(text: string): string | null {
  ONBOARDING_STEP_MARKER.lastIndex = 0;
  const match = ONBOARDING_STEP_MARKER.exec(text);
  return match ? match[1] : null;
}

/**
 * Extract and parse the first inline onboarding-question spec from message
 * text, if any. Returns a validated `OnboardingStep` (id synthesised as
 * 'inline' since dynamic questions have no stable id), or null if absent or
 * malformed. Defensive: any shape error returns null so a bad agent payload
 * never crashes the UI (the user can always type instead).
 */
export function extractInlineOnboardingStep(text: string): OnboardingStep | null {
  ONBOARDING_INLINE_BLOCK.lastIndex = 0;
  const match = ONBOARDING_INLINE_BLOCK.exec(text);
  if (!match) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  return normalizeInlineStep(parsed);
}

/** Validate an unknown parsed value into an OnboardingStep, or null. */
function normalizeInlineStep(raw: unknown): OnboardingStep | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  if (!prompt) {
    return null;
  }
  const groups = Array.isArray(obj.groups) ? obj.groups : null;
  if (!groups || groups.length === 0) {
    return null;
  }
  const normalizedGroups: OnboardingOptionGroup[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = normalizeGroup(groups[i], i);
    if (!g) {
      return null;
    }
    normalizedGroups.push(g);
  }
  const helper =
    typeof obj.helper === 'string' && obj.helper.trim() ? obj.helper.trim() : undefined;
  return { id: 'inline', prompt, helper, groups: normalizedGroups };
}

function normalizeGroup(raw: unknown, index: number): OnboardingOptionGroup | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id ? obj.id : `g${index}`;
  const label = typeof obj.label === 'string' && obj.label ? obj.label : null;
  const multi = obj.multi === true;
  const allowCustom = obj.allowCustom === true;
  if (!Array.isArray(obj.options) || obj.options.length === 0) {
    return null;
  }
  const options: OnboardingOption[] = [];
  for (const o of obj.options) {
    const opt = normalizeOption(o);
    if (!opt) {
      return null;
    }
    options.push(opt);
  }
  return { id, label, multi, allowCustom, options };
}

function normalizeOption(raw: unknown): OnboardingOption | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const label = typeof obj.label === 'string' && obj.label ? obj.label : null;
  if (!label) {
    return null;
  }
  const value =
    typeof obj.value === 'string' && obj.value
      ? obj.value
      : label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
  return { value, label };
}

/* --------------------------- selection formatting ------------------------- */

/**
 * Group id → selected option values. Used both by the pill UI (to track
 * toggled pills) and by `formatSelection` (to render the reply text).
 */
export type OnboardingSelection = Record<string, string[]>;

/**
 * Find the display label for a value within a group, falling back to the raw
 * value (handles custom "+ add your own" entries that aren't in `options`).
 */
function labelFor(group: OnboardingOptionGroup, value: string): string {
  const found = group.options.find((o) => o.value === value);
  return found ? found.label : value;
}

/**
 * Render a selection as natural-language text for the user's reply.
 *
 * - Single-group, unlabeled step → "Recruitment Agency" or "Tech, Healthcare".
 * - Compound / labeled groups → "Seniority: Senior; Region: UK & Ireland".
 * - Empty groups are skipped.
 */
export function formatSelection(step: OnboardingStep, selection: OnboardingSelection): string {
  return step.groups
    .map((g) => {
      const values = selection[g.id] ?? [];
      if (values.length === 0) {
        return '';
      }
      const labels = values.map((v) => labelFor(g, v)).join(', ');
      return g.label ? `${g.label}: ${labels}` : labels;
    })
    .filter(Boolean)
    .join('; ');
}

/** Whether every group in the step has at least one selection (for submit gating). */
export function isSelectionComplete(step: OnboardingStep, selection: OnboardingSelection): boolean {
  return step.groups.every((g) => (selection[g.id] ?? []).length > 0);
}

/** Look up a step by id. Returns undefined if the id is unknown. */
export function getOnboardingStep(id: string): OnboardingStep | undefined {
  return ONBOARDING_STEPS[id];
}
