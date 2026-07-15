import type { PersonalProfileKey } from '../onboarding/interview';
import type { BusinessType } from './types';

const BUSINESS_TYPE_MAP: Record<string, BusinessType> = {
  recruitment_agency: 'recruitment-agencies',
  executive_search: 'executive-search',
  rec2rec: 'rec2rec',
  rpo_provider: 'rpo-providers',
  in_house_ta: 'in-house-ta',
  enterprise_talent: 'enterprise-talent',
};

export const normalizeBusinessType = (value: string | null | undefined): BusinessType | null =>
  (value && BUSINESS_TYPE_MAP[value]) || null;

export interface CompanyProfileData {
  industry?: string | string[];
  recruits_for?: string | string[];
  target_roles?: string | string[];
  seniority?: string | string[];
  markets?: string | string[];
  hiring_volume?: string | string[];
}

export const LEGACY_PERSONAL_KEYS = [
  'seniority_focus',
  'geographies',
  'workflow',
  'copilot_goals',
] as const;

type LegacyPersonalKey = (typeof LEGACY_PERSONAL_KEYS)[number];

type ProfileValue = string | string[];

export type PersonalProfileData = Partial<Record<PersonalProfileKey | LegacyPersonalKey, ProfileValue>>;

const asText = (v: string | string[] | undefined): string | null => {
  if (Array.isArray(v)) {
    return v.length ? v.join(', ') : null;
  }
  return v && v.trim() ? v.trim() : null;
};

const line = (label: string, fields: Array<[string, string | string[] | undefined]>): string | null => {
  const parts = fields
    .map(([k, v]) => [k, asText(v)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? `${label} — ${parts.join('; ')}` : null;
};

export const buildUserContextSummary = (input: {
  company?: CompanyProfileData | null;
  personal?: PersonalProfileData | null;
}): string | undefined => {
  const c = input.company;
  const p = input.personal;
  const lines = [
    c &&
      line('Company', [
        ['industry', c.industry],
        ['recruits for', c.recruits_for],
        ['target roles', c.target_roles],
        ['seniority', c.seniority],
        ['markets', c.markets],
        ['hiring volume', c.hiring_volume],
      ]),
    p &&
      line('You', [
        ['role', p.role],
        ['desk', p.desk],
        ['how you work', p.how_we_work ?? p.workflow],
        ['recruits', p.recruits],
        ['seniority', p.seniority ?? p.level ?? p.seniority_focus],
        ['regions', p.regions ?? p.geographies],
        ['search start', p.search_start],
        ['practice areas', p.practice_areas],
        ['functions', p.functions],
        ['engagement model', p.model],
        ['hiring profile', p.profile],
        ['sectors', p.sectors],
        ['company does', p.company_does],
        ['hires for', p.hire_for],
        ['uses 360AI for', p.use_for],
        ['goals', p.copilot_goals],
      ]),
  ].filter((l): l is string => Boolean(l));
  return lines.length ? lines.join('\n') : undefined;
};
