import type { BusinessType, GridCell, UseCaseId } from './types';
import type { LayerStore } from './store';

const cell = (profile: BusinessType, useCase: UseCaseId): GridCell => ({
  profile,
  useCase,
  lensId: `lens:${profile}×${useCase}`,
});

export const LENS_GRID: GridCell[] = [
  cell('enterprise-talent', 'market-mapping'),
  cell('enterprise-talent', 'skill-mapping'),
  cell('enterprise-talent', 'workforce-planning'),
  cell('executive-search', 'market-mapping'),
  cell('executive-search', 'talent-mapping'),
  cell('executive-search', 'prospecting'),
  cell('executive-search', 'signal-tracking'),
  cell('in-house-ta', 'talent-mapping'),
  cell('rpo-providers', 'talent-mapping'),
  cell('rpo-providers', 'prospecting'),
  cell('rec2rec', 'talent-mapping'),
  cell('rec2rec', 'prospecting'),
  cell('recruitment-agencies', 'talent-mapping'),
  cell('recruitment-agencies', 'prospecting'),
];

export const workspacesFor = (b: BusinessType): UseCaseId[] =>
  LENS_GRID.filter((c) => c.profile === b).map((c) => c.useCase);

export const lensIdFor = (b: BusinessType, u: UseCaseId): string | null =>
  LENS_GRID.find((c) => c.profile === b && c.useCase === u)?.lensId ?? null;

export const validateGrid = (store: LayerStore): string[] => {
  const problems: string[] = [];
  const lensIds = new Set(store.all('lens').map((r) => r.id));
  for (const c of LENS_GRID) {
    if (!store.get(c.lensId)) {
      problems.push(`grid cell ${c.profile}×${c.useCase} references missing ${c.lensId}`);
    }
    lensIds.delete(c.lensId);
  }
  for (const orphan of lensIds) {
    problems.push(`stored lens ${orphan} is not present in LENS_GRID`);
  }
  return problems;
};
