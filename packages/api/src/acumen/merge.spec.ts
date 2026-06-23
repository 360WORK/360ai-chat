import { mergeFields } from './merge';
import type { LayerRecord } from './types';

const layer = (id: string, fields: LayerRecord['fields']): LayerRecord =>
  ({ id, kind: 'lens', version: '1', fields });

describe('mergeFields', () => {
  it('later layer wins for a scalar; unset falls upward', () => {
    const out = mergeFields([
      layer('a', { openingCopy: 'foundation copy', vocabulary: ['x'] }),
      layer('b', { openingCopy: 'lens copy' }),
    ]);
    expect(out.openingCopy).toBe('lens copy');
    expect(out.vocabulary).toEqual(['x']);
  });
  it('thresholds: later layer overrides matching keys only', () => {
    const out = mergeFields([
      layer('a', { thresholds: { longlist: 20, sample: 60 } }),
      layer('b', { thresholds: { longlist: 12 } }),
    ]);
    expect(out.thresholds).toEqual({ longlist: 12, sample: 60 });
  });
  it('outputAdditions are additive and de-duped low→high', () => {
    const out = mergeFields([
      layer('a', { outputAdditions: ['coverage'] }),
      layer('b', { outputAdditions: ['coverage', 'movement hook'] }),
    ]);
    expect(out.outputAdditions).toEqual(['coverage', 'movement hook']);
  });
});
