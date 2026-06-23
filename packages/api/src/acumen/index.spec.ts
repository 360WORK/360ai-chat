import * as acumen from './index';

describe('acumen public surface', () => {
  it('exports the composer and grid helpers', () => {
    expect(typeof acumen.composeSystemPrompt).toBe('function');
    expect(typeof acumen.workspacesFor).toBe('function');
    expect(Array.isArray(acumen.LENS_GRID)).toBe(true);
  });

  it('exports layerStore and createFileLayerStore', () => {
    expect(typeof acumen.layerStore).toBe('object');
    expect(typeof acumen.createFileLayerStore).toBe('function');
  });

  it('exports lensIdFor, validateGrid, lintNoRestating', () => {
    expect(typeof acumen.lensIdFor).toBe('function');
    expect(typeof acumen.validateGrid).toBe('function');
    expect(typeof acumen.lintNoRestating).toBe('function');
  });

  it('exports isBusinessType type guard', () => {
    expect(typeof acumen.isBusinessType).toBe('function');
    expect(acumen.isBusinessType('rec2rec')).toBe(true);
    expect(acumen.isBusinessType('not-a-type')).toBe(false);
  });
});
