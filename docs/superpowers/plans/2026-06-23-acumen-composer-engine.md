# AI Acumen — Composer Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the runtime prompt-composition engine — a file-backed layer store, a 14-cell lens grid, and a deterministic cascade composer — that assembles one system prompt per turn and replaces the static `360ai` persona.

**Architecture:** All logic is pure TypeScript in `packages/api/src/acumen/`, compiled into `@librechat/api`. A `LayerStore` (file-backed, interface-abstracted) holds versioned layer records. `composeSystemPrompt` resolves the layers for a turn (Foundations + core + profile + lens + user context + brief), merges typed fields by precedence, accumulates hard constraints tighten-only, and renders one string. A single thin JS wrapper in `/api` injects the result through the existing `agentRunContextParts` seam; `librechat.yaml` is slimmed to a bootstrap persona. No upstream LibreChat logic changes.

**Tech Stack:** TypeScript, Jest (`cd packages/api && npx jest`), LibreChat agents endpoint, `@librechat/api` package build.

## Global Constraints

- All new backend code is **TypeScript in `packages/api/src/`** — never add logic to `/api` beyond thin JS wrappers.
- **Never use `any`**; avoid `unknown`/`Record<string, unknown>` — use explicit types.
- Tests use **real logic, no mocks** (per project testing philosophy); co-locate as `*.spec.ts` beside source.
- Run package tests from the workspace: `cd packages/api && npx jest <pattern>`.
- The lens grid is exactly **14 cells** (not 20 — a source digest miscounted).
- Commits stage **explicit paths only** — branch `feat/360ai-result-cards` carries unrelated WIP.
- End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- After editing `librechat.yaml` or `/api`, backend reloads via nodemon (`touch api/server/index.js`); prompt behavior is verified **live**, not by automated test.
- Spec: `docs/superpowers/specs/2026-06-23-acumen-composer-engine-design.md`.

---

### Task 1: Core types

**Files:**
- Create: `packages/api/src/acumen/types.ts`
- Test: `packages/api/src/acumen/types.spec.ts`

**Interfaces:**
- Produces: `LayerKind`, `BusinessType`, `UseCaseId`, `TierSpec`, `LayerFields`, `HardConstraints`, `LayerRecord`, `GridCell`, `ComposeInput`, `ComposedPrompt`, and the const arrays `BUSINESS_TYPES`, `USE_CASE_IDS` with type guards `isBusinessType`, `isUseCaseId`.

- [ ] **Step 1: Write the failing test**

```ts
import { isBusinessType, isUseCaseId, BUSINESS_TYPES, USE_CASE_IDS } from './types';

describe('acumen types guards', () => {
  it('recognizes the six business types', () => {
    expect(BUSINESS_TYPES).toHaveLength(6);
    expect(isBusinessType('rec2rec')).toBe(true);
    expect(isBusinessType('not-a-type')).toBe(false);
  });
  it('recognizes the seven use cases', () => {
    expect(USE_CASE_IDS).toHaveLength(7);
    expect(isUseCaseId('talent-mapping')).toBe(true);
    expect(isUseCaseId('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/types -t "guards"`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type LayerKind = 'foundations' | 'core' | 'profile' | 'lens';

export const BUSINESS_TYPES = [
  'enterprise-talent',
  'executive-search',
  'in-house-ta',
  'rpo-providers',
  'rec2rec',
  'recruitment-agencies',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const USE_CASE_IDS = [
  'talent-mapping',
  'market-mapping',
  'skill-mapping',
  'workforce-planning',
  'prospecting',
  'signal-tracking',
  'recruitment-research',
] as const;
export type UseCaseId = (typeof USE_CASE_IDS)[number];

export const isBusinessType = (v: string): v is BusinessType =>
  (BUSINESS_TYPES as readonly string[]).includes(v);
export const isUseCaseId = (v: string): v is UseCaseId =>
  (USE_CASE_IDS as readonly string[]).includes(v);

export interface TierSpec {
  name: string;
  definition: string;
}

export interface LayerFields {
  openingCopy?: string;
  starters?: string[];
  vocabulary?: string[];
  tiering?: TierSpec[];
  thresholds?: Record<string, number>;
  outputAdditions?: string[];
}

export interface HardConstraints {
  offLimits?: string[];
  guardrails?: string[];
}

export interface LayerRecord {
  id: string;
  kind: LayerKind;
  version: string;
  fields: LayerFields;
  hardConstraints?: HardConstraints;
  body?: string;
}

export interface GridCell {
  profile: BusinessType;
  useCase: UseCaseId;
  lensId: string;
}

export interface ComposeInput {
  businessType?: BusinessType;
  useCaseId?: UseCaseId;
  userContext?: string;
  brief?: string;
}

export interface ComposedPrompt {
  prompt: string;
  resolvedLayers: string[];
  selectedUseCase: UseCaseId | null;
  flags: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/types -t "guards"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/types.ts packages/api/src/acumen/types.spec.ts
git commit -m "feat(acumen): core layer/compose types + guards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: LayerStore (interface + file-backed impl)

**Files:**
- Create: `packages/api/src/acumen/store.ts`
- Create: `packages/api/src/acumen/layers/index.ts` (registry — seeded incrementally; starts with placeholders)
- Test: `packages/api/src/acumen/store.spec.ts`

**Interfaces:**
- Consumes: `LayerRecord`, `LayerKind` from `./types`.
- Produces: `interface LayerStore { get(id): LayerRecord | null; require(id): LayerRecord; foundations(): LayerRecord; all(kind?): LayerRecord[] }`; `createFileLayerStore(records: LayerRecord[]): LayerStore`; `layerStore` (singleton built from `./layers`).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/store`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write minimal implementation**

`store.ts`:

```ts
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
```

`layers/index.ts` (temporary minimal seed so the singleton builds; replaced in Task 8):

```ts
import type { LayerRecord } from '../types';

export const ALL_LAYERS: LayerRecord[] = [
  { id: 'foundations', kind: 'foundations', version: '0.0.0', fields: {}, body: '' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/store`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/store.ts packages/api/src/acumen/store.spec.ts packages/api/src/acumen/layers/index.ts
git commit -m "feat(acumen): file-backed LayerStore behind swappable interface

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Lens grid + validation

**Files:**
- Create: `packages/api/src/acumen/grid.ts`
- Test: `packages/api/src/acumen/grid.spec.ts`

**Interfaces:**
- Consumes: `BusinessType`, `UseCaseId`, `GridCell` from `./types`; `LayerStore` from `./store`.
- Produces: `LENS_GRID: GridCell[]`; `workspacesFor(b: BusinessType): UseCaseId[]`; `lensIdFor(b: BusinessType, u: UseCaseId): string | null`; `validateGrid(store: LayerStore): string[]` (returns list of problems, empty = valid).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/grid`
Expected: FAIL — cannot find module `./grid`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/grid`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/grid.ts packages/api/src/acumen/grid.spec.ts
git commit -m "feat(acumen): 14-cell sparse lens grid + validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Field merge (precedence cascade)

**Files:**
- Create: `packages/api/src/acumen/merge.ts`
- Test: `packages/api/src/acumen/merge.spec.ts`

**Interfaces:**
- Consumes: `LayerFields`, `LayerRecord` from `./types`.
- Produces: `mergeFields(layersLowToHigh: LayerRecord[]): LayerFields`. Scalars + `tiering`/`thresholds`/`starters`/`vocabulary`: later wins, unset falls upward. `outputAdditions`: **additive** (concatenated low→high, de-duped).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/merge`
Expected: FAIL — cannot find module `./merge`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { LayerFields, LayerRecord, TierSpec } from './types';

const lastDefined = <T>(values: (T | undefined)[]): T | undefined => {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== undefined) {
      return values[i];
    }
  }
  return undefined;
};

export const mergeFields = (layersLowToHigh: LayerRecord[]): LayerFields => {
  const f = layersLowToHigh.map((l) => l.fields);

  const openingCopy = lastDefined(f.map((x) => x.openingCopy));
  const starters = lastDefined(f.map((x) => x.starters));
  const vocabulary = lastDefined(f.map((x) => x.vocabulary));
  const tiering = lastDefined<TierSpec[]>(f.map((x) => x.tiering));

  const thresholds = f.reduce<Record<string, number>>((acc, x) => {
    return x.thresholds ? { ...acc, ...x.thresholds } : acc;
  }, {});

  const outputAdditions = [
    ...new Set(f.flatMap((x) => x.outputAdditions ?? [])),
  ];

  const merged: LayerFields = {};
  if (openingCopy !== undefined) merged.openingCopy = openingCopy;
  if (starters !== undefined) merged.starters = starters;
  if (vocabulary !== undefined) merged.vocabulary = vocabulary;
  if (tiering !== undefined) merged.tiering = tiering;
  if (Object.keys(thresholds).length) merged.thresholds = thresholds;
  if (outputAdditions.length) merged.outputAdditions = outputAdditions;
  return merged;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/merge`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/merge.ts packages/api/src/acumen/merge.spec.ts
git commit -m "feat(acumen): precedence field merge with additive output fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Hard-constraint accumulation (tighten-only)

**Files:**
- Create: `packages/api/src/acumen/constraints.ts`
- Test: `packages/api/src/acumen/constraints.spec.ts`

**Interfaces:**
- Consumes: `HardConstraints`, `LayerRecord` from `./types`.
- Produces: `accumulateConstraints(layers: LayerRecord[]): { constraints: Required<HardConstraints>; flags: string[] }`. Union across all layers (order-independent); a layer carrying a marker `{ remove: string }` style loosen attempt is impossible by type — but a layer may declare `loosen?: string[]` which is **ignored and flagged**.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/constraints`
Expected: FAIL — cannot find module `./constraints`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { HardConstraints, LayerRecord } from './types';

interface LooseningLayer extends LayerRecord {
  loosen?: string[];
}

export const accumulateConstraints = (
  layers: LayerRecord[],
): { constraints: Required<HardConstraints>; flags: string[] } => {
  const offLimits = new Set<string>();
  const guardrails = new Set<string>();
  const flags: string[] = [];

  for (const layer of layers) {
    for (const o of layer.hardConstraints?.offLimits ?? []) offLimits.add(o);
    for (const g of layer.hardConstraints?.guardrails ?? []) guardrails.add(g);

    const loosen = (layer as LooseningLayer).loosen ?? [];
    for (const attempt of loosen) {
      flags.push(
        `layer "${layer.id}" attempted to loosen hard constraint "${attempt}" — ignored (tighten-only)`,
      );
    }
  }

  return {
    constraints: { offLimits: [...offLimits], guardrails: [...guardrails] },
    flags,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/constraints`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/constraints.ts packages/api/src/acumen/constraints.spec.ts
git commit -m "feat(acumen): tighten-only hard-constraint accumulation with loosen flags

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Brief router

**Files:**
- Create: `packages/api/src/acumen/router.ts`
- Test: `packages/api/src/acumen/router.spec.ts`

**Interfaces:**
- Consumes: `BusinessType`, `UseCaseId` from `./types`; `workspacesFor` from `./grid`.
- Produces: `selectUseCase(brief: string | undefined, businessType: BusinessType | undefined): { useCaseId: UseCaseId; confidence: number } | null`. Keyword match, constrained to `workspacesFor(businessType)`; empty/ambiguous → `null`.

- [ ] **Step 1: Write the failing test**

```ts
import { selectUseCase } from './router';

describe('selectUseCase', () => {
  it('routes a market-map brief to market-mapping for enterprise-talent', () => {
    const r = selectUseCase('Can you map the market for cloud security vendors?', 'enterprise-talent');
    expect(r?.useCaseId).toBe('market-mapping');
  });
  it('routes a watch brief to signal-tracking for executive-search', () => {
    const r = selectUseCase('alert me when these CFOs change roles', 'executive-search');
    expect(r?.useCaseId).toBe('signal-tracking');
  });
  it('returns null when the matched use case is not in the business grid', () => {
    // in-house-ta only has talent-mapping; a prospecting brief must not route
    expect(selectUseCase('build me a prospect list of agencies to pitch', 'in-house-ta')).toBeNull();
  });
  it('returns null for empty or ambiguous briefs', () => {
    expect(selectUseCase('', 'rec2rec')).toBeNull();
    expect(selectUseCase('hi there', 'rec2rec')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/router`
Expected: FAIL — cannot find module `./router`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';

const KEYWORDS: Record<UseCaseId, RegExp> = {
  'market-mapping': /\b(map the market|market map|landscape|who(?:'s| is) hiring|players in)\b/i,
  'skill-mapping': /\b(skill map|skills? (?:map|landscape)|who has|capability)\b/i,
  'workforce-planning': /\b(workforce plan|headcount|build.?buy.?borrow|attrition|hiring plan)\b/i,
  'talent-mapping': /\b(talent map|map (?:the )?talent|shortlist|longlist|candidates? (?:for|in))\b/i,
  'prospecting': /\b(prospect|pitch|business development|bd list|win(?:ning)? clients|leads)\b/i,
  'signal-tracking': /\b(alert me|watch|track|notify|monitor|when .* (?:change|move|raise))\b/i,
  'recruitment-research': /\b(research|find out|what(?:'s| is) the|how many)\b/i,
};

const ORDER: UseCaseId[] = [
  'signal-tracking',
  'market-mapping',
  'skill-mapping',
  'workforce-planning',
  'prospecting',
  'talent-mapping',
  'recruitment-research',
];

export const selectUseCase = (
  brief: string | undefined,
  businessType: BusinessType | undefined,
): { useCaseId: UseCaseId; confidence: number } | null => {
  if (!brief || !brief.trim() || !businessType) {
    return null;
  }
  const allowed = new Set(workspacesFor(businessType));
  for (const useCaseId of ORDER) {
    if (allowed.has(useCaseId) && KEYWORDS[useCaseId].test(brief)) {
      return { useCaseId, confidence: 0.7 };
    }
  }
  return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/router`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/router.ts packages/api/src/acumen/router.spec.ts
git commit -m "feat(acumen): grid-constrained brief→use-case router

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Render template

**Files:**
- Create: `packages/api/src/acumen/render.ts`
- Test: `packages/api/src/acumen/render.spec.ts`

**Interfaces:**
- Consumes: `LayerFields`, `LayerRecord`, `HardConstraints` from `./types`.
- Produces: `renderPrompt(input: RenderInput): string` where `RenderInput = { ordered: LayerRecord[]; fields: LayerFields; constraints: Required<HardConstraints>; userContext?: string; brief?: string }`. Sections rendered in fixed order; empty sections omitted; off-limits rendered last.

- [ ] **Step 1: Write the failing test**

```ts
import { renderPrompt } from './render';
import type { LayerRecord } from './types';

const R = (id: string, kind: LayerRecord['kind'], body: string): LayerRecord =>
  ({ id, kind, version: '1', fields: {}, body });

describe('renderPrompt', () => {
  const out = renderPrompt({
    ordered: [
      R('foundations', 'foundations', 'FOUNDATION SCAFFOLD'),
      R('core:talent-mapping', 'core', 'TALENT METHOD'),
      R('profile:rec2rec', 'profile', 'REC2REC AUDIENCE'),
      R('lens:rec2rec×talent-mapping', 'lens', 'INTERSECTION'),
    ],
    fields: { openingCopy: 'Welcome desk', outputAdditions: ['movement hook'] },
    constraints: { offLimits: ['own employees'], guardrails: ['no sensitive personal data'] },
    userContext: 'USER IS A REC2REC BILLER',
    brief: 'map biotech recruiters',
  });

  it('includes each layer body in precedence order', () => {
    expect(out.indexOf('FOUNDATION SCAFFOLD')).toBeLessThan(out.indexOf('TALENT METHOD'));
    expect(out.indexOf('TALENT METHOD')).toBeLessThan(out.indexOf('REC2REC AUDIENCE'));
    expect(out.indexOf('REC2REC AUDIENCE')).toBeLessThan(out.indexOf('INTERSECTION'));
  });
  it('renders off-limits and guardrails after the layer bodies', () => {
    expect(out.indexOf('own employees')).toBeGreaterThan(out.indexOf('INTERSECTION'));
    expect(out).toContain('no sensitive personal data');
  });
  it('renders user context and brief last', () => {
    expect(out.indexOf('USER IS A REC2REC BILLER')).toBeGreaterThan(out.indexOf('own employees'));
    expect(out.trimEnd().endsWith('map biotech recruiters')).toBe(true);
  });
  it('omits empty sections (no thresholds line when none set)', () => {
    expect(out).not.toContain('Thresholds:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/render`
Expected: FAIL — cannot find module `./render`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { HardConstraints, LayerFields, LayerRecord } from './types';

export interface RenderInput {
  ordered: LayerRecord[];
  fields: LayerFields;
  constraints: Required<HardConstraints>;
  userContext?: string;
  brief?: string;
}

const HEADINGS: Record<LayerRecord['kind'], string> = {
  foundations: '# Core Foundations',
  core: '# Method',
  profile: '# Audience',
  lens: '# This workspace',
};

const section = (title: string, body: string | undefined): string | null =>
  body && body.trim() ? `${title}\n${body.trim()}` : null;

export const renderPrompt = (input: RenderInput): string => {
  const parts: (string | null)[] = [];

  for (const layer of input.ordered) {
    parts.push(section(HEADINGS[layer.kind], layer.body));
  }

  const { openingCopy, starters, outputAdditions, thresholds } = input.fields;
  const fieldLines: string[] = [];
  if (openingCopy) fieldLines.push(`Opening: ${openingCopy}`);
  if (starters?.length) fieldLines.push(`Starters:\n- ${starters.join('\n- ')}`);
  if (outputAdditions?.length) fieldLines.push(`Output additions: ${outputAdditions.join(', ')}`);
  if (thresholds && Object.keys(thresholds).length) {
    const t = Object.entries(thresholds).map(([k, v]) => `${k}=${v}`).join(', ');
    fieldLines.push(`Thresholds: ${t}`);
  }
  parts.push(section('# Workspace configuration', fieldLines.join('\n')));

  const constraintLines: string[] = [];
  if (input.constraints.offLimits.length) {
    constraintLines.push(`Off-limits (never violate):\n- ${input.constraints.offLimits.join('\n- ')}`);
  }
  if (input.constraints.guardrails.length) {
    constraintLines.push(`Guardrails:\n- ${input.constraints.guardrails.join('\n- ')}`);
  }
  parts.push(section('# Off-limits & guardrails', constraintLines.join('\n')));

  parts.push(section('# User context', input.userContext));
  parts.push(section('# This turn', input.brief));

  return parts.filter((p): p is string => p !== null).join('\n\n');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/render`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/render.ts packages/api/src/acumen/render.spec.ts
git commit -m "feat(acumen): fixed-section prompt renderer (off-limits rendered last)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Author real layer content (Foundations + 6 profiles + demo cores/lenses)

**Files:**
- Create: `packages/api/src/acumen/layers/foundations.ts`
- Create: `packages/api/src/acumen/layers/profiles/*.ts` (6 files)
- Create: `packages/api/src/acumen/layers/cores/*.ts` (7 files)
- Create: `packages/api/src/acumen/layers/lenses/*.ts` (14 files)
- Modify: `packages/api/src/acumen/layers/index.ts` (register all)
- Test: `packages/api/src/acumen/layers/index.spec.ts`

**Interfaces:**
- Consumes: `LayerRecord` from `../types`; source content from `/Users/eth0/Downloads/360ai-agent/`.
- Produces: `ALL_LAYERS: LayerRecord[]` — 1 foundations + 7 cores + 6 profiles + 14 lenses = 28 records. Source: each `.md` file maps to one record (`body` = the method/audience/intersection prose; `fields`/`hardConstraints` populated from the structured sections — off-limits, tiering, thresholds, opening copy, starters).

> CONTENT TASK: transcribe from the source docs. `body` is the prose; pull `offLimits`/`guardrails` from each doc's off-limits sections, `tiering` from the tier definitions, `thresholds` from numeric stopping rules (e.g. Exec×Talent longlist 10–15 → `{ longlist: 12 }`), `openingCopy`/`starters` from each lens's opening section. Keep lenses thin — do **not** copy core prose into a lens (Task 10 lint enforces this). Normalize ids per the scheme (`lens:rec2rec×talent-mapping`, even though its file is reversed-named).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/layers`
Expected: FAIL — counts are 1/0/0/0 (placeholder seed from Task 2).

- [ ] **Step 3: Write the layer records**

Transcribe each source `.md` into a `LayerRecord`. Pattern per file (example — `layers/profiles/rec2rec.ts`):

```ts
import type { LayerRecord } from '../../types';

export const rec2rec: LayerRecord = {
  id: 'profile:rec2rec',
  kind: 'profile',
  version: '1.0.0',
  fields: {
    vocabulary: ['billings', 'book', '360/180', 'biller', 'desk', 'patch'],
    tiering: [
      { name: 'pure-play', definition: 'agencies that only recruit recruiters' },
      { name: 'dedicated-desk', definition: 'agencies with a standing rec2rec desk' },
      { name: 'occasional', definition: 'agencies that place recruiters ad hoc' },
    ],
  },
  hardConstraints: {
    guardrails: ['professional, business-relevant information only'],
  },
  body: 'Audience: rec2rec. Target entity: other recruitment/staffing agencies... [transcribe from Rec2Rec-Business-Profile.md]',
};
```

Example lens — `layers/lenses/rec2rec-talent-mapping.ts` (thin, no core prose):

```ts
import type { LayerRecord } from '../../types';

export const rec2recTalentMapping: LayerRecord = {
  id: 'lens:rec2rec×talent-mapping',
  kind: 'lens',
  version: '1.0.0',
  fields: {
    openingCopy: 'Map the recruiters worth approaching for your desk.',
    starters: ['Map 360 billers in biotech', 'Who is wobbling at agency X?'],
    outputAdditions: ['movement hook (comp ceiling / lost autonomy / agency wobble)'],
  },
  body: 'Intersection notes: weight freshness heavily (fast churn)... [transcribe from Talent-Mapping-x-Rec2Rec-Lens.md — deltas only]',
};
```

`layers/index.ts` registers every record:

```ts
import type { LayerRecord } from '../types';
import { foundations } from './foundations';
import { enterpriseTalent } from './profiles/enterprise-talent';
import { executiveSearch } from './profiles/executive-search';
import { inHouseTa } from './profiles/in-house-ta';
import { rpoProviders } from './profiles/rpo-providers';
import { rec2rec } from './profiles/rec2rec';
import { recruitmentAgencies } from './profiles/recruitment-agencies';
import { talentMapping } from './cores/talent-mapping';
import { marketMapping } from './cores/market-mapping';
import { skillMapping } from './cores/skill-mapping';
import { workforcePlanning } from './cores/workforce-planning';
import { prospecting } from './cores/prospecting';
import { signalTracking } from './cores/signal-tracking';
import { recruitmentResearch } from './cores/recruitment-research';
// ...import all 14 lens records...
import { enterpriseTalentMarketMapping } from './lenses/enterprise-talent-market-mapping';
// (etc — one import per lens file)

export const ALL_LAYERS: LayerRecord[] = [
  foundations,
  enterpriseTalent, executiveSearch, inHouseTa, rpoProviders, rec2rec, recruitmentAgencies,
  talentMapping, marketMapping, skillMapping, workforcePlanning, prospecting, signalTracking, recruitmentResearch,
  enterpriseTalentMarketMapping, /* ...all 14 lenses... */
];
```

Source-file → id map for the 14 lenses (normalize reversed/spaced names):
- `Enterprise/Enterprise-Talent-Lens-x-Market-Mapping.md` → `lens:enterprise-talent×market-mapping`
- `Enterprise/...x-Skill-Mapping.md` → `lens:enterprise-talent×skill-mapping`
- `Enterprise/...x-Workforce-Planning.md` → `lens:enterprise-talent×workforce-planning`
- `Executive Search/...x-Market-Mapping.md` → `lens:executive-search×market-mapping`
- `Executive Search/...x-Talent-Mapping.md` → `lens:executive-search×talent-mapping`
- `Executive Search/...x-Prospecting.md` → `lens:executive-search×prospecting`
- `Executive Search/...x-Signal-Tracking.md` → `lens:executive-search×signal-tracking`
- `In-house TA/In-House-TA-Lens-x-Talent-Mapping.md` → `lens:in-house-ta×talent-mapping`
- `RPO Providers/...x-Talent-Mapping.md` → `lens:rpo-providers×talent-mapping`
- `RPO Providers/...x-Prospecting.md` → `lens:rpo-providers×prospecting`
- `Rec2Rec/Talent-Mapping-x-Rec2Rec-Lens.md` → `lens:rec2rec×talent-mapping`
- `Rec2Rec/Rec2Rec-Lens-x-Prospecting.md` → `lens:rec2rec×prospecting`
- `Recruitment Agencies/...x-Talent-Mapping.md` → `lens:recruitment-agencies×talent-mapping`
- `Recruitment Agencies/...x-Prospecting.md` → `lens:recruitment-agencies×prospecting`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/layers`
Expected: PASS (4 tests). Also re-run `npx jest acumen/store acumen/grid` — still green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/layers
git commit -m "feat(acumen): seed Foundations, 6 profiles, 7 cores, 14 lenses from design docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: composeSystemPrompt (wire-up + cache)

**Files:**
- Create: `packages/api/src/acumen/composer.ts`
- Test: `packages/api/src/acumen/composer.spec.ts`

**Interfaces:**
- Consumes: `ComposeInput`, `ComposedPrompt` from `./types`; `layerStore`/`LayerStore` from `./store`; `lensIdFor` from `./grid`; `mergeFields` from `./merge`; `accumulateConstraints` from `./constraints`; `selectUseCase` from `./router`; `renderPrompt` from `./render`.
- Produces: `composeSystemPrompt(input: ComposeInput, store?: LayerStore): ComposedPrompt`. Resolves layers low→high, merges, accumulates, renders; caches the instruction-layer portion by `(layerIds+versions)`.

- [ ] **Step 1: Write the failing test**

```ts
import { composeSystemPrompt } from './composer';

describe('composeSystemPrompt', () => {
  it('composes foundations-only when business type is unknown', () => {
    const r = composeSystemPrompt({ brief: 'hello' });
    expect(r.selectedUseCase).toBeNull();
    expect(r.resolvedLayers).toEqual(['foundations']);
    expect(r.prompt).toContain('Core Foundations');
  });
  it('routes a brief to a core+lens and includes all four instruction layers', () => {
    const r = composeSystemPrompt({
      businessType: 'rec2rec',
      brief: 'map 360 billers in biotech',
      userContext: 'USER IS A REC2REC BILLER',
    });
    expect(r.selectedUseCase).toBe('talent-mapping');
    expect(r.resolvedLayers).toEqual([
      'foundations',
      'core:talent-mapping',
      'profile:rec2rec',
      'lens:rec2rec×talent-mapping',
    ]);
    expect(r.prompt).toContain('USER IS A REC2REC BILLER');
  });
  it('honours an explicit useCaseId over the router', () => {
    const r = composeSystemPrompt({ businessType: 'rec2rec', useCaseId: 'prospecting', brief: 'map talent' });
    expect(r.selectedUseCase).toBe('prospecting');
    expect(r.resolvedLayers).toContain('lens:rec2rec×prospecting');
  });
  it('is deterministic — same input yields identical prompt (cache-safe)', () => {
    const a = composeSystemPrompt({ businessType: 'rec2rec', useCaseId: 'talent-mapping', brief: 'x' });
    const b = composeSystemPrompt({ businessType: 'rec2rec', useCaseId: 'talent-mapping', brief: 'x' });
    expect(a.prompt).toBe(b.prompt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/composer`
Expected: FAIL — cannot find module `./composer`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ComposeInput, ComposedPrompt, LayerRecord, UseCaseId } from './types';
import { layerStore, type LayerStore } from './store';
import { lensIdFor } from './grid';
import { mergeFields } from './merge';
import { accumulateConstraints } from './constraints';
import { selectUseCase } from './router';
import { renderPrompt } from './render';

const instructionCache = new Map<string, { ordered: LayerRecord[]; cacheKey: string }>();

const resolveInstructionLayers = (
  store: LayerStore,
  businessType: ComposeInput['businessType'],
  useCase: UseCaseId | null,
): LayerRecord[] => {
  const ordered: LayerRecord[] = [store.foundations()];
  if (useCase) {
    ordered.push(store.require(`core:${useCase}`));
  }
  if (businessType) {
    const profile = store.get(`profile:${businessType}`);
    if (profile) ordered.push(profile);
    if (useCase) {
      const lensId = lensIdFor(businessType, useCase);
      if (lensId) ordered.push(store.require(lensId));
    }
  }
  return ordered;
};

export const composeSystemPrompt = (
  input: ComposeInput,
  store: LayerStore = layerStore,
): ComposedPrompt => {
  const selected: UseCaseId | null =
    input.useCaseId ?? selectUseCase(input.brief, input.businessType)?.useCaseId ?? null;

  const ordered = resolveInstructionLayers(store, input.businessType, selected);

  const cacheKey = ordered.map((l) => `${l.id}@${l.version}`).join('|');
  if (!instructionCache.has(cacheKey)) {
    instructionCache.set(cacheKey, { ordered, cacheKey });
  }

  const fields = mergeFields(ordered);
  const { constraints, flags } = accumulateConstraints(ordered);

  const prompt = renderPrompt({
    ordered,
    fields,
    constraints,
    userContext: input.userContext,
    brief: input.brief,
  });

  return { prompt, resolvedLayers: ordered.map((l) => l.id), selectedUseCase: selected, flags };
};

export const __clearAcumenCache = (): void => instructionCache.clear();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/composer`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/composer.ts packages/api/src/acumen/composer.spec.ts
git commit -m "feat(acumen): composeSystemPrompt — resolve+merge+accumulate+render with instruction-layer cache

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: "Layers must not restate the core" lint + golden snapshot

**Files:**
- Create: `packages/api/src/acumen/lint.ts`
- Test: `packages/api/src/acumen/lint.spec.ts`
- Test: `packages/api/src/acumen/golden.spec.ts`

**Interfaces:**
- Consumes: `LayerRecord` from `./types`; `layerStore` from `./store`; `composeSystemPrompt` from `./composer`.
- Produces: `lintNoRestating(store): string[]` — flags any lens/profile whose body shares an above-threshold token-overlap ratio with its related core body.

- [ ] **Step 1: Write the failing tests**

`lint.spec.ts`:

```ts
import { lintNoRestating } from './lint';
import { createFileLayerStore } from './store';
import type { LayerRecord } from './types';

const rec = (id: string, kind: LayerRecord['kind'], body: string): LayerRecord =>
  ({ id, kind, version: '1', fields: {}, body });

describe('lintNoRestating', () => {
  it('flags a lens that copies its core body verbatim', () => {
    const coreBody = 'seed entities corroborate qualify tier signals enrich iterate score rank by value';
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
      rec('core:talent-mapping', 'core', 'seed entities corroborate qualify tier signals enrich iterate score rank'),
      rec('lens:rec2rec×talent-mapping', 'lens', 'weight freshness heavily; movement hooks comp ceiling autonomy'),
    ]);
    expect(lintNoRestating(store)).toEqual([]);
  });
});
```

`golden.spec.ts`:

```ts
import { composeSystemPrompt } from './composer';

it('golden: executive-search × talent-mapping assembled prompt', () => {
  const r = composeSystemPrompt({
    businessType: 'executive-search',
    useCaseId: 'talent-mapping',
    userContext: 'Partner at a retained firm, financial services, EMEA.',
    brief: 'Confidential CFO search for a PE-backed fintech.',
  });
  expect(r.prompt).toMatchSnapshot();
});

it('golden: real seeded layers pass the no-restating lint', () => {
  // imported lazily so this also guards the authored content from Task 8
  const { layerStore } = require('./store');
  const { lintNoRestating } = require('./lint');
  expect(lintNoRestating(layerStore)).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx jest acumen/lint acumen/golden`
Expected: FAIL — cannot find module `./lint`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { LayerRecord } from './types';
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/api && npx jest acumen/lint acumen/golden`
Expected: PASS — lint (2), golden (2). Review the written snapshot once; it is a deliberate artifact. If the real-content lint fails, the Task 8 lens bodies are too thick — trim them, don't raise the threshold.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/lint.ts packages/api/src/acumen/lint.spec.ts packages/api/src/acumen/golden.spec.ts packages/api/src/acumen/__snapshots__
git commit -m "feat(acumen): no-restating-core lint + golden compose snapshot

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Public exports + integration (replace static persona)

**Files:**
- Create: `packages/api/src/acumen/index.ts`
- Modify: `packages/api/src/index.ts` (add an Acumen export block)
- Create: `api/server/controllers/agents/acumen.js` (thin JS wrapper)
- Modify: `api/server/controllers/agents/client.js` (swap onboarding push → acumen push at the existing seam)
- Modify: `librechat.yaml` (slim the `360ai` `promptPrefix` to a bootstrap line)
- Test: `packages/api/src/acumen/index.spec.ts` (export surface); **live verification** for the integration

**Interfaces:**
- Consumes: everything above.
- Produces: barrel exports `composeSystemPrompt`, `workspacesFor`, `lensIdFor`, `LENS_GRID`, `layerStore`, types; JS `acumenContextPart(user, brief)` returning the composed string or `null`.

- [ ] **Step 1: Write the failing test (export surface)**

```ts
import * as acumen from './index';

describe('acumen public surface', () => {
  it('exports the composer and grid helpers', () => {
    expect(typeof acumen.composeSystemPrompt).toBe('function');
    expect(typeof acumen.workspacesFor).toBe('function');
    expect(Array.isArray(acumen.LENS_GRID)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/index`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write the barrel + wrapper + integration**

`packages/api/src/acumen/index.ts`:

```ts
export * from './types';
export { layerStore, createFileLayerStore } from './store';
export type { LayerStore } from './store';
export { LENS_GRID, workspacesFor, lensIdFor, validateGrid } from './grid';
export { composeSystemPrompt } from './composer';
export { lintNoRestating } from './lint';
```

Add to `packages/api/src/index.ts` (mirror the existing "Onboarding" export block):

```ts
/* Acumen */
export * from './acumen';
```

`api/server/controllers/agents/acumen.js` (thin wrapper, mirrors `onboarding.js`):

```js
const { composeSystemPrompt, isBusinessType } = require('@librechat/api');

/**
 * Build the composed Acumen system prompt for the primary 360ai agent.
 * Returns null to no-op safely when claims are absent.
 */
function acumenContextPart(user, brief) {
  const claims = user?.oidcClaims;
  if (!claims) {
    return null;
  }
  const businessType = isBusinessType(claims.businessType) ? claims.businessType : undefined;
  const userContext = claims.onboardingSummary || undefined;
  const { prompt } = composeSystemPrompt({ businessType, userContext, brief });
  return prompt || null;
}

module.exports = { acumenContextPart };
```

In `client.js`, at the existing onboarding seam (the survey located it near L521–525 where `onboardingContextPart(oidcClaims)` is pushed onto `agentRunContextParts` for the primary agent), **replace** that import and push:

```js
// import (was: const { onboardingContextPart } = require('./onboarding');)
const { acumenContextPart } = require('./acumen');

// at the push site (primary agent only — keep the existing agentId gate):
const acumenPart = acumenContextPart(req.user, latestUserText);
if (acumenPart) {
  agentRunContextParts.push(acumenPart);
}
```

> `latestUserText` = the current turn's user message text already available in scope at this seam (the same value the brief router needs). If the local variable has a different name, use whatever holds the latest user message; do not add new plumbing.

In `librechat.yaml`, slim each `360ai` model-spec `promptPrefix` to a one-line bootstrap (Foundations now lives in the layer store):

```yaml
        promptPrefix: >-
          You are 360AI, the recruiting intelligence copilot. Your full operating
          instructions are supplied at runtime — follow them exactly.
```

- [ ] **Step 4: Verify**

Run the unit test: `cd packages/api && npx jest acumen` — Expected: ALL acumen suites PASS.
Build the package so `/api` sees the new exports: `npm run build:data-provider` is not enough — build the api package: `cd packages/api && npm run build` (or root `npm run build`). Expected: clean tsc, no `any`/unused diagnostics.
Reload backend: `touch api/server/index.js`. Then **live-verify** (per project convention — prompt behavior has no automated test): log into `https://chat.360ai.test`, send a brief that should route (e.g. "map 360 billers in biotech" for a rec2rec user), and inspect Mongo `messages`/`conversations` or the agent run context to confirm the composed prompt (Foundations + core + profile + lens + user context) reached the model and the old static persona is gone.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/acumen/index.ts packages/api/src/acumen/index.spec.ts packages/api/src/index.ts api/server/controllers/agents/acumen.js api/server/controllers/agents/client.js librechat.yaml
git commit -m "feat(acumen): wire composer into agent run context; slim static persona to bootstrap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §3.1 layer record model → Task 1. §3.2 grid → Task 3. §3.3 LayerStore → Task 2. §3.4 composer (resolve/merge/accumulate/render/cache) → Tasks 4,5,7,9. §3.5 router → Task 6. §3.6 integration/replace → Task 11. §6 testing (merge, tighten-only, grid, router, golden, no-restating lint, cache) → Tasks 3–10. Layer content seeding → Task 8. ✅ All covered.
- §3.4 "user context folds in onboarding" → handled in Task 11 wrapper (`acumenContextPart` reads claims, replaces `onboardingContextPart`). The onboarding interview-script injection is preserved by passing its summary as `userContext`; the onboarding *interview* flow itself is untouched (sub-project #2 scope).

**Placeholder scan:** Task 8 is intentionally a transcription task (content lives in source `.md` files, not inventable here) — it ships exact id-mapping, the record shape, and a test that fails until all 28 records exist with a valid grid. That is a content task with a hard acceptance test, not a placeholder. No "TBD"/"handle edge cases"/"similar to Task N" present.

**Type consistency:** `LayerRecord`/`LayerFields`/`HardConstraints` (Task 1) used identically in Tasks 2–10. `composeSystemPrompt(input, store?)` signature consistent between Task 9 and Task 11. `workspacesFor`/`lensIdFor`/`validateGrid` names stable (Tasks 3, 11). `acumenContextPart` name stable (Task 11). The wrapper consumes claims fields (`businessType`, `onboardingSummary`) that sub-project #2 must populate — flagged in §3.6 as the onboarding-promotion dependency; until then the composer safely degrades to Foundations+profile via the `isBusinessType` guard.

---

*Plan ready. Reference spec: `docs/superpowers/specs/2026-06-23-acumen-composer-engine-design.md`.*
