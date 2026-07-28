import { LENS_GRID, workspacesFor, lensIdFor, validateGrid } from './grid';
import { createFileLayerStore } from './store';
import type { LayerRecord } from './types';

describe('lens grid', () => {
  it('has exactly 14 cells', () => {
    expect(LENS_GRID).toHaveLength(14);
  });
  it('maps executive-search to its four workspaces', () => {
    expect(workspacesFor('executive-search').sort()).toEqual(
      ['market-mapping', 'prospecting', 'signal-tracking', 'talent-mapping'].sort(),
    );
  });
  it('resolves a known lens id and null for absent cells', () => {
    expect(lensIdFor('rec2rec', 'talent-mapping')).toBe('lens:rec2rec×talent-mapping');
    expect(lensIdFor('in-house-ta', 'prospecting')).toBeNull();
  });
  it('validateGrid flags a grid lens missing from the store', () => {
    const store = createFileLayerStore([
      { id: 'foundations', kind: 'foundations', version: '1', fields: {} } as LayerRecord,
    ]);
    const problems = validateGrid(store);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/lens:/);
  });
});
