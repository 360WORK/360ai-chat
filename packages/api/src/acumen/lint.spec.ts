import { lintNoRestating } from './lint';
import { createFileLayerStore } from './store';
import type { LayerRecord } from './types';

const rec = (id: string, kind: LayerRecord['kind'], body: string): LayerRecord => ({
  id,
  kind,
  version: '1',
  fields: {},
  body,
});

describe('lintNoRestating', () => {
  it('flags a lens that copies its core body verbatim', () => {
    const coreBody =
      'seed entities corroborate qualify tier signals enrich iterate score rank by value';
    const store = createFileLayerStore([
      rec('foundations', 'foundations', 'shared'),
      rec('core:talent-mapping', 'core', coreBody),
      rec('lens:rec2rec×talent-mapping', 'lens', coreBody),
    ]);
    const problems = lintNoRestating(store);
    expect(problems.some((p) => /lens:rec2rec×talent-mapping/.test(p))).toBe(true);
  });
  it('passes a thin lens that only sets deltas', () => {
    const store = createFileLayerStore([
      rec('foundations', 'foundations', 'shared'),
      rec(
        'core:talent-mapping',
        'core',
        'seed entities corroborate qualify tier signals enrich iterate score rank',
      ),
      rec(
        'lens:rec2rec×talent-mapping',
        'lens',
        'weight freshness heavily; movement hooks comp ceiling autonomy',
      ),
    ]);
    expect(lintNoRestating(store)).toEqual([]);
  });
});
