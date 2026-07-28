import type { LayerKind, LayerRecord } from './types';
import { ALL_LAYERS } from './layers';

export interface LayerStore {
  get(id: string): LayerRecord | null;
  require(id: string): LayerRecord;
  foundations(): LayerRecord;
  all(kind?: LayerKind): LayerRecord[];
}

export const createFileLayerStore = (records: LayerRecord[]): LayerStore => {
  const byId = new Map<string, LayerRecord>();
  for (const record of records) {
    if (byId.has(record.id)) {
      throw new Error(`acumen: duplicate layer id "${record.id}"`);
    }
    byId.set(record.id, record);
  }

  const get = (id: string): LayerRecord | null => byId.get(id) ?? null;

  const require = (id: string): LayerRecord => {
    const found = byId.get(id);
    if (!found) {
      throw new Error(`acumen: required layer "${id}" not found in store`);
    }
    return found;
  };

  const foundations = (): LayerRecord => require('foundations');

  const all = (kind?: LayerKind): LayerRecord[] => {
    const list = [...byId.values()];
    return kind ? list.filter((r) => r.kind === kind) : list;
  };

  return { get, require, foundations, all };
};

export const layerStore: LayerStore = createFileLayerStore(ALL_LAYERS);
