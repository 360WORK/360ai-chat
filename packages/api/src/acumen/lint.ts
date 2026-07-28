import type { LayerStore } from './store';

const OVERLAP_THRESHOLD = 0.6;

const tokens = (body: string | undefined): Set<string> =>
  new Set(
    (body ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

const overlapRatio = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
};

const coreIdFor = (lensOrProfileId: string): string | null => {
  const m = lensOrProfileId.match(/^lens:[^×]+×(.+)$/);
  return m ? `core:${m[1]}` : null;
};

export const lintNoRestating = (store: LayerStore): string[] => {
  const problems: string[] = [];
  for (const lens of store.all('lens')) {
    const coreId = coreIdFor(lens.id);
    if (!coreId) continue;
    const core = store.get(coreId);
    if (!core) continue;
    const ratio = overlapRatio(tokens(lens.body), tokens(core.body));
    if (ratio >= OVERLAP_THRESHOLD) {
      problems.push(
        `${lens.id} restates ${coreId} (token overlap ${ratio.toFixed(2)} ≥ ${OVERLAP_THRESHOLD})`,
      );
    }
  }
  return problems;
};
