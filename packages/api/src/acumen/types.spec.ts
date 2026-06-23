import { isBusinessType, isUseCaseId, BUSINESS_TYPES, USE_CASE_IDS } from './types';

describe('acumen types guards', () => {
  it('recognizes the six business types', () => {
    expect(BUSINESS_TYPES).toHaveLength(6);
    expect(isBusinessType('rec2rec')).toBe(true);
    expect(isBusinessType('not-a-type')).toBe(false);
  });
  it('recognizes the seven use cases', () => {
    expect(USE_CASE_IDS).toHaveLength(7);
    expect(isUseCaseId('talent-mapping')).toBe(true);
    expect(isUseCaseId('nope')).toBe(false);
  });
});
