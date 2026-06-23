import { normalizeBusinessType, buildUserContextSummary } from './profile';

describe('normalizeBusinessType', () => {
  it('maps the two pluralized values correctly', () => {
    expect(normalizeBusinessType('recruitment_agency')).toBe('recruitment-agencies');
    expect(normalizeBusinessType('rpo_provider')).toBe('rpo-providers');
  });
  it('maps the straightforward values', () => {
    expect(normalizeBusinessType('executive_search')).toBe('executive-search');
    expect(normalizeBusinessType('rec2rec')).toBe('rec2rec');
    expect(normalizeBusinessType('in_house_ta')).toBe('in-house-ta');
    expect(normalizeBusinessType('enterprise_talent')).toBe('enterprise-talent');
  });
  it('returns null for unknown/empty/nullish', () => {
    expect(normalizeBusinessType('something_else')).toBeNull();
    expect(normalizeBusinessType('')).toBeNull();
    expect(normalizeBusinessType(null)).toBeNull();
    expect(normalizeBusinessType(undefined)).toBeNull();
  });
});

describe('buildUserContextSummary', () => {
  it('summarizes present company + personal fields, skipping absent ones', () => {
    const out = buildUserContextSummary({
      company: { industry: 'biotech', target_roles: ['CSO', 'VP R&D'], markets: 'EMEA' },
      personal: { role: 'Partner', desk: 'life sciences' },
    });
    expect(out).toContain('biotech');
    expect(out).toContain('CSO, VP R&D');
    expect(out).toContain('Partner');
  });
  it('returns undefined when there is nothing to summarize', () => {
    expect(buildUserContextSummary({})).toBeUndefined();
    expect(buildUserContextSummary({ company: null, personal: null })).toBeUndefined();
  });
});
