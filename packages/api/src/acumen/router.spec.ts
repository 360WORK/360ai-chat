import { selectUseCase } from './router';

describe('selectUseCase', () => {
  it('routes a market-map brief to market-mapping for enterprise-talent', () => {
    const r = selectUseCase('Can you map the market for cloud security vendors?', 'enterprise-talent');
    expect(r?.useCaseId).toBe('market-mapping');
  });
  it('routes a watch brief to signal-tracking for executive-search', () => {
    const r = selectUseCase('alert me when these CFOs change roles', 'executive-search');
    expect(r?.useCaseId).toBe('signal-tracking');
  });
  it('returns null when the matched use case is not in the business grid', () => {
    // in-house-ta only has talent-mapping; a prospecting brief must not route
    expect(selectUseCase('build me a prospect list of agencies to pitch', 'in-house-ta')).toBeNull();
  });
  it('returns null for empty or ambiguous briefs', () => {
    expect(selectUseCase('', 'rec2rec')).toBeNull();
    expect(selectUseCase('hi there', 'rec2rec')).toBeNull();
  });
});
