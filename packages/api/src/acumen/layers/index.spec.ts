import { ALL_LAYERS } from './index';
import { createFileLayerStore } from '../store';
import { validateGrid } from '../grid';
import { BUSINESS_TYPES } from '../types';

describe('seeded layers', () => {
  const store = createFileLayerStore(ALL_LAYERS);
  it('contains foundations, 7 cores, 6 profiles, 14 lenses', () => {
    expect(store.all('foundations')).toHaveLength(1);
    expect(store.all('core')).toHaveLength(7);
    expect(store.all('profile')).toHaveLength(6);
    expect(store.all('lens')).toHaveLength(14);
  });
  it('has a profile record for every business type', () => {
    for (const b of BUSINESS_TYPES) {
      expect(store.get(`profile:${b}`)).not.toBeNull();
    }
  });
  it('satisfies grid validation (every grid lens exists, no orphans)', () => {
    expect(validateGrid(store)).toEqual([]);
  });
  it('every lens and profile declares a non-empty body', () => {
    for (const r of [...store.all('lens'), ...store.all('profile')]) {
      expect(r.body && r.body.trim().length).toBeTruthy();
    }
  });
});
