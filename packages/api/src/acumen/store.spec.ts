import { createFileLayerStore } from './store';
import type { LayerRecord } from './types';

const recs: LayerRecord[] = [
  { id: 'foundations', kind: 'foundations', version: '1.0.0', fields: {}, body: 'FOUND' },
  { id: 'profile:rec2rec', kind: 'profile', version: '1.0.0', fields: {}, body: 'P' },
  { id: 'core:talent-mapping', kind: 'core', version: '1.0.0', fields: {}, body: 'C' },
];

describe('LayerStore', () => {
  const store = createFileLayerStore(recs);
  it('gets by id and returns null for unknown', () => {
    expect(store.get('profile:rec2rec')?.body).toBe('P');
    expect(store.get('missing')).toBeNull();
  });
  it('require throws for unknown id', () => {
    expect(() => store.require('missing')).toThrow(/missing/);
  });
  it('foundations() returns the single foundations record', () => {
    expect(store.foundations().id).toBe('foundations');
  });
  it('all(kind) filters by kind', () => {
    expect(store.all('core').map((r) => r.id)).toEqual(['core:talent-mapping']);
    expect(store.all()).toHaveLength(3);
  });
  it('rejects duplicate ids', () => {
    expect(() => createFileLayerStore([recs[0], recs[0]])).toThrow(/duplicate/i);
  });
});
