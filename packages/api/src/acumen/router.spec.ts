import type { BusinessType, UseCaseId } from './types';
import { selectUseCase } from './router';

describe('selectUseCase', () => {
  it('routes a market-map brief to market-mapping for enterprise-talent', () => {
    const r = selectUseCase(
      'Can you map the market for cloud security vendors?',
      'enterprise-talent',
    );
    expect(r?.useCaseId).toBe('market-mapping');
  });
  it('routes a watch brief to signal-tracking for executive-search', () => {
    const r = selectUseCase('alert me when these CFOs change roles', 'executive-search');
    expect(r?.useCaseId).toBe('signal-tracking');
  });
  it('returns null when the matched use case is not in the business grid', () => {
    // in-house-ta only has talent-mapping; a prospecting brief must not route
    expect(
      selectUseCase('build me a prospect list of agencies to pitch', 'in-house-ta'),
    ).toBeNull();
  });
  it('returns null for empty or ambiguous briefs', () => {
    expect(selectUseCase('', 'rec2rec')).toBeNull();
    expect(selectUseCase('hi there', 'rec2rec')).toBeNull();
  });

  const CASES: Array<[string, UseCaseId, BusinessType]> = [
    ['find me senior fintech candidates in London', 'talent-mapping', 'rec2rec'],
    ['build a talent pool of data engineers', 'talent-mapping', 'rec2rec'],
    ['source a shortlist for my Rust role', 'talent-mapping', 'rec2rec'],
    ['which companies should we pitch this quarter', 'prospecting', 'rec2rec'],
    ['build a target account list in med-tech', 'prospecting', 'rec2rec'],
    ['give me a market overview of AI hiring in Berlin', 'market-mapping', 'enterprise-talent'],
    [
      'who are the key players in cyber security recruitment',
      'market-mapping',
      'enterprise-talent',
    ],
    ['what skills does our engineering org lack', 'skill-mapping', 'enterprise-talent'],
    ['plan next year headcount for the platform team', 'workforce-planning', 'enterprise-talent'],
    ['send me a weekly digest of fintech funding rounds', 'signal-tracking', 'executive-search'],
    ['keep an eye on Acme leadership moves', 'signal-tracking', 'executive-search'],
    ['Send me a digest of the market landscape for fintech', 'market-mapping', 'enterprise-talent'],
  ];

  it.each(CASES)('routes "%s" to %s', (brief, useCaseId, businessType) => {
    expect(selectUseCase(brief, businessType)?.useCaseId).toBe(useCaseId);
  });
});
