import { accumulateConstraints } from './constraints';
import type { LayerRecord } from './types';

const L = (id: string, hc: LayerRecord['hardConstraints'], loosen?: string[]): LayerRecord =>
  ({ id, kind: 'lens', version: '1', fields: {}, hardConstraints: hc, ...(loosen ? { loosen } : {}) } as LayerRecord);

describe('accumulateConstraints', () => {
  it('unions off-limits and guardrails across layers, de-duped', () => {
    const { constraints } = accumulateConstraints([
      L('found', { guardrails: ['no sensitive personal data'] }),
      L('profile', { offLimits: ['own employees'], guardrails: ['no sensitive personal data'] }),
      L('lens', { offLimits: ['client hands-off'] }),
    ]);
    expect(constraints.offLimits.sort()).toEqual(['client hands-off', 'own employees'].sort());
    expect(constraints.guardrails).toEqual(['no sensitive personal data']);
  });
  it('ignores any loosen attempt and records a flag', () => {
    const { constraints, flags } = accumulateConstraints([
      L('profile', { offLimits: ['own employees'] }),
      L('lens', undefined, ['own employees']),
    ]);
    expect(constraints.offLimits).toEqual(['own employees']);
    expect(flags.some((m) => /loosen/i.test(m))).toBe(true);
  });
});
