import type { CompanyProfileData, PersonalProfileData } from '../acumen/profile';
import { LEGACY_PERSONAL_KEYS, buildUserContextSummary } from '../acumen/profile';
import {
  COMPANY_PROFILE_KEYS,
  PERSONAL_PROFILE_KEYS,
  buildInterviewInstructions,
} from './interview';

const NON_PROFILE_TOKENS = new Set([
  'save_onboarding_profile',
  'profile_json',
  'tailored_prompts_json',
  'snake_case',
]);

const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

const finishingSection = (scope: 'company' | 'personal'): string => {
  const text = buildInterviewInstructions(scope);
  const index = text.indexOf('# Finishing up');
  expect(index).toBeGreaterThan(-1);
  return text.slice(index);
};

const mentionedKeys = (scope: 'company' | 'personal'): string[] =>
  [...new Set(finishingSection(scope).match(SNAKE_CASE) ?? [])].filter(
    (token) => !NON_PROFILE_TOKENS.has(token),
  );

const recordedReads = <T extends object>(run: (proxy: T) => void): string[] => {
  const reads = new Set<string>();
  const proxy = new Proxy({} as T, {
    get: (_target, prop) => {
      if (typeof prop === 'string') {
        reads.add(prop);
      }
      return undefined;
    },
  });
  run(proxy);
  return [...reads];
};

describe('onboarding profile key contract', () => {
  const personalKeys = new Set<string>(PERSONAL_PROFILE_KEYS);
  const companyKeys = new Set<string>(COMPANY_PROFILE_KEYS);

  it('every key mentioned in the personal finishing instructions is canonical', () => {
    const unknown = mentionedKeys('personal').filter((key) => !personalKeys.has(key));
    expect(unknown).toEqual([]);
  });

  it('every key mentioned in the company finishing instructions is canonical', () => {
    const unknown = mentionedKeys('company').filter(
      (key) => !personalKeys.has(key) && !companyKeys.has(key),
    );
    expect(unknown).toEqual([]);
  });

  it('the interview instructions mention every canonical key', () => {
    const personalText = buildInterviewInstructions('personal');
    const companyText = buildInterviewInstructions('company');
    for (const key of PERSONAL_PROFILE_KEYS) {
      expect(personalText).toContain(key);
      expect(companyText).toContain(key);
    }
    for (const key of COMPANY_PROFILE_KEYS) {
      expect(companyText).toContain(key);
    }
  });

  it('buildUserContextSummary only reads canonical or legacy personal keys', () => {
    const reads = recordedReads<PersonalProfileData>((personal) =>
      buildUserContextSummary({ personal }),
    );
    expect(reads.length).toBeGreaterThan(0);
    const allowed = new Set<string>([...PERSONAL_PROFILE_KEYS, ...LEGACY_PERSONAL_KEYS]);
    expect(reads.filter((key) => !allowed.has(key))).toEqual([]);
  });

  it('buildUserContextSummary only reads company keys the Laravel whitelist accepts', () => {
    const reads = recordedReads<CompanyProfileData>((company) =>
      buildUserContextSummary({ company }),
    );
    expect(reads.length).toBeGreaterThan(0);
    const laravelCompanyFields = new Set<string>([
      ...COMPANY_PROFILE_KEYS,
      'industry',
      'target_roles',
      'hiring_volume',
      'tooling',
      'candidate_icp',
      'employer_value_prop',
    ]);
    expect(reads.filter((key) => !laravelCompanyFields.has(key))).toEqual([]);
  });
});
