# AI Acumen — Composer Engine + Layer Store + Lens Grid (Sub-project #1)

**Status:** Design approved, ready for implementation plan
**Date:** 2026-06-23
**Branch:** `feat/360ai-result-cards` (chat.360ai)
**Source design docs:** `/Users/eth0/Downloads/360ai-agent/` (Engineering-Brief.md, Core-Foundations.md, 7 cores, 6 profiles, 14 lenses, Onboarding.docx)

---

## 1. Context

"AI Acumen" is a **runtime prompt-composition system** for 360AI Chat (a LibreChat fork). Instead of a static persona per agent, one system prompt is assembled per turn from stacked layers — CSS-cascade style, later wins:

```
In-session brief › User context › Lens › Business profile › Use-case core › Core Foundations (default)
```

**Instruction layers** (shared, stored once): Core Foundations (always loaded), 7 use-case **cores** (Talent / Market / Skill / Workforce Mapping, Prospecting, Signal Tracking, Recruitment Research), 6 business **profiles** (Enterprise Talent, Executive Search, In-House TA, RPO Providers, Rec2Rec, Recruitment Agencies), 14 **lenses** (sparse intersections — only 14 of the 36 possible cells exist).

**Context inputs** (per user): onboarding answers (the "user context" layer — *already built*) + this turn's brief.

The full program decomposes into five sub-projects (composer engine → onboarding promotion → workspaces UI + confirmation component → capability layer → stateful cores). **This spec covers sub-project #1 only: the composer engine, the layer store, and the lens grid.** It is the foundation everything else depends on. Stateful machinery (scheduler, verification queue, HRIS import, Smartlead outbound) is explicitly out of scope.

### What already exists (reconciled, not rebuilt)
- **Onboarding** (`packages/api/src/onboarding/`, `client/src/components/Onboarding/`) is the user-context layer. It collects the full per-business-type question tree but does **not** yet store `business_type` as a first-class field or drive a lens grid — that promotion is sub-project #2, out of scope here. This spec consumes onboarding claims as-is and folds the existing `onboardingContextPart` injection into the composer.
- **Static agent personas**: the `360ai` model-specs in `librechat.yaml` carry large `promptPrefix` personas. These are the static precursor this engine **replaces**.
- **Injection seam**: `api/server/controllers/agents/client.js` assembles dynamic per-run context into `agentRunContextParts` → `additional_instructions` via `applyContextToAgent`. Onboarding already pushes here (`onboardingContextPart`). The composer reuses this exact seam.

---

## 2. Goals / Non-goals

**Goals**
1. A deterministic `composeSystemPrompt(...)` that merges the layers by precedence into one system prompt.
2. A file-backed, versioned `LayerStore` behind an abstract interface (swappable to Mongo later with zero composer changes).
3. The 14-cell sparse lens grid as config that both the composer (validity) and, later, the UI (workspaces) read.
4. The two security/quality rules enforced **in code, not prose**: (a) hard constraints only tighten; (b) layers must not restate the core.
5. Replace the static `promptPrefix` persona with composer output, through the existing injection seam, with zero upstream LibreChat code changes beyond the already-present wrapper call.

**Non-goals (later sub-projects)**
- Workspaces UI / landing surfaces (#3) and the shared mid-point confirmation component (#3).
- Business-type promotion in onboarding + grid-driven workspace rendering (#2).
- Binding cores to MCP capabilities / aggregate vs individual data modes (#4).
- Any stateful core machinery: scheduler, watch/baseline store, saved ICPs, managed verification queue, HRIS import, Smartlead outbound (#5).
- Runtime authoring UI for layers (deferred; git is the authoring path for v1).

---

## 3. Architecture

All new code is TypeScript in `packages/api/src/acumen/`, compiled to `@librechat/api`, consumed by `/api` through one thin JS wrapper. The only `/api`-side change is one wrapper call at the existing seam; the only `librechat.yaml` change is slimming the persona.

```
packages/api/src/acumen/
  types.ts            # LayerRecord, BusinessType, UseCaseId, ComposeInput, ComposedPrompt
  layers/
    foundations.ts    # the one shared scaffold (moved out of librechat.yaml promptPrefix)
    cores/            # 7 use-case cores
    profiles/         # 6 business profiles
    lenses/           # 20 lens records
    index.ts          # registers all layer records into the store
  grid.ts             # the sparse 20-cell lens grid
  store.ts            # LayerStore interface + file-backed implementation
  router.ts           # selectUseCase(brief, ctx) — brief → core picker
  composer.ts         # composeSystemPrompt(...) — the cascade merge + render
  lint.ts             # "layers must not restate core" check (run as a test)
  index.ts            # public exports

api/server/controllers/agents/acumen.js   # thin JS wrapper → composeSystemPrompt
```

### 3.1 Layer record model

The source content is genuinely both **config** (off-limits lists, thresholds, tiering, vocabulary, opening copy) and **prose** (method/reasoning). The record reflects that split so config can merge field-by-field while prose is assembled positionally.

```ts
type LayerKind = 'foundations' | 'core' | 'profile' | 'lens';

type BusinessType =
  | 'enterprise-talent' | 'executive-search' | 'in-house-ta'
  | 'rpo-providers' | 'rec2rec' | 'recruitment-agencies';

type UseCaseId =
  | 'talent-mapping' | 'market-mapping' | 'skill-mapping'
  | 'workforce-planning' | 'prospecting' | 'signal-tracking'
  | 'recruitment-research';

interface TierSpec { name: string; definition: string }

interface LayerFields {
  openingCopy?: string;
  starters?: string[];
  vocabulary?: string[];
  tiering?: TierSpec[];
  thresholds?: Record<string, number>;
  outputAdditions?: string[];
  // extensible; unknown fields are carried through the merge untouched
}

interface HardConstraints {
  offLimits?: string[];
  guardrails?: string[];
}

interface LayerRecord {
  id: string;          // 'foundations' | 'core:talent-mapping' | 'profile:rec2rec' | 'lens:rec2rec×talent-mapping'
  kind: LayerKind;
  version: string;     // semver-ish; bump on any content change (shared deps, treat as versioned)
  fields: LayerFields;
  hardConstraints?: HardConstraints;
  body?: string;       // method/reasoning prose, rendered in the layer's section
}
```

**ID scheme** (string keys, never file paths — source files have inconsistent naming, e.g. the reversed `Talent-Mapping-x-Rec2Rec` and folder spaces; normalize at authoring time):
- `foundations`
- `core:<use-case-id>`
- `profile:<business-type>`
- `lens:<business-type>×<use-case-id>`

### 3.2 The lens grid

`grid.ts` declares the 14 cells explicitly. Sparse by design — a cell's existence means that workspace is offered to that business type.

```ts
interface GridCell { profile: BusinessType; useCase: UseCaseId; lensId: string }

const LENS_GRID: GridCell[] = [
  // Enterprise Talent
  { profile: 'enterprise-talent', useCase: 'market-mapping',     lensId: 'lens:enterprise-talent×market-mapping' },
  { profile: 'enterprise-talent', useCase: 'skill-mapping',      lensId: 'lens:enterprise-talent×skill-mapping' },
  { profile: 'enterprise-talent', useCase: 'workforce-planning', lensId: 'lens:enterprise-talent×workforce-planning' },
  // Executive Search
  { profile: 'executive-search',  useCase: 'market-mapping',     lensId: 'lens:executive-search×market-mapping' },
  { profile: 'executive-search',  useCase: 'talent-mapping',     lensId: 'lens:executive-search×talent-mapping' },
  { profile: 'executive-search',  useCase: 'prospecting',        lensId: 'lens:executive-search×prospecting' },
  { profile: 'executive-search',  useCase: 'signal-tracking',    lensId: 'lens:executive-search×signal-tracking' },
  // In-House TA
  { profile: 'in-house-ta',       useCase: 'talent-mapping',     lensId: 'lens:in-house-ta×talent-mapping' },
  // RPO Providers
  { profile: 'rpo-providers',     useCase: 'talent-mapping',     lensId: 'lens:rpo-providers×talent-mapping' },
  { profile: 'rpo-providers',     useCase: 'prospecting',        lensId: 'lens:rpo-providers×prospecting' },
  // Rec2Rec
  { profile: 'rec2rec',           useCase: 'talent-mapping',     lensId: 'lens:rec2rec×talent-mapping' },
  { profile: 'rec2rec',           useCase: 'prospecting',        lensId: 'lens:rec2rec×prospecting' },
  // Recruitment Agencies
  { profile: 'recruitment-agencies', useCase: 'talent-mapping',  lensId: 'lens:recruitment-agencies×talent-mapping' },
  { profile: 'recruitment-agencies', useCase: 'prospecting',     lensId: 'lens:recruitment-agencies×prospecting' },
];
```

That is the complete grid — all 14 lens cells, matching the 14 files under `3- Third Layer - Lenses/`. (One source digest miscounted these as 20; the directory listing confirms 14.) Naming normalization still applies: e.g. Rec2Rec's `Talent-Mapping-x-Rec2Rec-Lens.md` is filed in reversed order but keys as `lens:rec2rec×talent-mapping`.

Grid functions: `workspacesFor(businessType): UseCaseId[]`, `lensIdFor(businessType, useCase): string | null`, `validateGrid(store)` (every grid `lensId` must resolve to a stored lens; every stored lens must appear in the grid).

### 3.3 LayerStore

```ts
interface LayerStore {
  get(id: string): LayerRecord | null;
  require(id: string): LayerRecord;          // throws if missing
  foundations(): LayerRecord;
  all(kind?: LayerKind): LayerRecord[];
}
```

v1 implementation is file-backed: layer records are authored as TS modules under `layers/` and registered into an in-memory map at module load. The interface is the seam — a future `MongoLayerStore` (sub-project graduation) drops in without composer changes.

### 3.4 Composer

`composeSystemPrompt(input: ComposeInput): ComposedPrompt`

```ts
interface ComposeInput {
  businessType: BusinessType;
  useCaseId?: UseCaseId;        // explicit (from a future workspace); else router decides
  userContext?: string;          // onboarding-derived block (folds in existing onboardingContextPart)
  brief?: string;                // this turn's message, for the router
}

interface ComposedPrompt {
  prompt: string;                // the assembled system prompt
  resolvedLayers: string[];      // layer ids used (for cache key + debugging)
  selectedUseCase: UseCaseId | null;
  flags: string[];               // surfaced conflicts (e.g. attempted loosen of a hard constraint)
}
```

**Algorithm**
1. **Resolve layers** in precedence order (low → high): Foundations (always) → core (`useCaseId`, else `router.selectUseCase(brief, ctx)`, else none) → profile (`businessType`) → lens (`grid.lensIdFor(profile, useCase)`; if the grid says a lens should exist but the store lacks it, throw — config error) → user context → brief.
2. **Merge typed fields**: walk layers low→high; for each field in `LayerFields`, later wins; unset falls upward; an unset field finally resolves to a Foundations default. Arrays for `starters`/`vocabulary`/`outputAdditions` replace (later wins) unless documented as additive (`outputAdditions` is additive — lenses *add* output columns).
3. **Accumulate hard constraints** across **all** layers as a union — tighten-only. If a lower-precedence constraint would be removed by a higher layer, it is **kept** and the attempt is recorded in `flags`. There is no code path that drops an off-limit or guardrail. This is the security property.
4. **Render** a fixed section template, in precedence order, slotting resolved fields + prose bodies:
   ```
   [Core Foundations scaffold]
   [Use-case method]            (core.body)
   [Audience]                   (profile.body + profile fields)
   [Intersection]               (lens.body + lens fields: opening copy, starters, output additions, threshold overrides)
   [Off-limits & guardrails]    (accumulated union — rendered last so it is unmissable)
   [User context]
   [This turn]
   ```
5. **Cache** the instruction-layer portion (Foundations + core + profile + lens) keyed by `(sorted resolvedLayer ids + versions)`. User context + brief are applied per request **on top** and never cached into the shared artefact. v1 cache is a process-local LRU/Map; key design is what matters, eviction is simple.

### 3.5 Router

`selectUseCase(brief, ctx): { useCaseId: UseCaseId; confidence: number } | null` — for v1, a deterministic keyword/intent matcher over the brief (e.g. "map the market" → `market-mapping`; "watch / alert me when" → `signal-tracking`). Constrained to the use-cases valid for the user's business type (per the grid). On low confidence or empty brief, returns `null` → composer produces the audience-stable prompt (Foundations + profile + user context), which is the Recruitment-Research posture. When a future workspace passes `useCaseId` explicitly, the router is bypassed. No LLM call in v1 — keep it cheap and testable; an LLM-routed upgrade is a later option behind the same interface.

### 3.6 Integration (replace persona, zero upstream code change)

- `librechat.yaml`: the `360ai` model-spec `promptPrefix` personas are **slimmed to a one-line bootstrap** (config edit only). Core Foundations content moves into `layers/foundations.ts`.
- `acumen.js` thin wrapper exposes `acumenContextPart(user, brief)`: derives `businessType` from onboarding claims, calls `composeSystemPrompt`, returns the assembled string (or `null` to no-op safely).
- In `client.js`, the existing `onboardingContextPart` push is **replaced** by the `acumenContextPart` push at the same `agentRunContextParts` location — the composer now owns the user-context layer (folding in onboarding) and emits the full assembled prompt into `additional_instructions`. Net upstream code delta: one import swap + one wrapper call swap (no new seam, no change to `applyContextToAgent` or the instructions assembly).
- Primary-agent gating stays as-is (composer applies to the primary `360ai` agent; handoff agents unchanged in v1).

---

## 4. Data flow

```
turn → client.js (primary agent)
     → acumenContextPart(req.user, brief)
        → businessType from req.user.oidcClaims
        → composeSystemPrompt({ businessType, useCaseId?, userContext, brief })
           → LayerStore.resolve(...) → merge fields → accumulate hard constraints → render
           → cache instruction-layer portion by (ids+versions)
        → assembled prompt string
     → agentRunContextParts.push(...) → applyContextToAgent → additional_instructions → model
```

---

## 5. Error handling & edge cases

- **Unknown business type** (claims missing/garbled): compose Foundations-only (safe generic) and record a flag; never throw into the request path.
- **Grid says lens exists but store lacks it**: throw at compose time — this is a build/config error and must fail loudly in tests, not silently degrade in prod. `validateGrid` runs in CI to catch it before deploy.
- **Router picks a use-case with no lens for this business type**: treated as "no core" → audience-stable compose. The router is grid-constrained so this should not happen, but the composer degrades gracefully if it does.
- **Hard-constraint loosen attempt**: kept + flagged, never applied (§3.4 step 3).
- **Empty brief / blank box**: `null` use-case → stable compose with the profile's opening copy + starters surfaced.

---

## 6. Testing (real logic, no mocks)

- **Merge unit tests**: precedence (later wins), fall-upward to Foundations default, additive vs replace array semantics.
- **Tighten-only tests**: a layer attempting to remove an off-limit/guardrail must not loosen the union, and must surface a flag. This is the security-critical test.
- **Grid validation test**: every `lensId` in the grid resolves; every stored lens appears in the grid; `workspacesFor` returns the expected set per business type.
- **Router tests**: representative briefs map to the expected core; ambiguous/empty → `null`; selection is grid-constrained to the business type.
- **Golden-file test**: compose a known pair (e.g. `executive-search × talent-mapping`) and snapshot the full assembled prompt — regression guard for the whole cascade. Snapshot updates are deliberate, reviewed events.
- **"No restating core" lint test** (`lint.ts`): flag a lens/profile whose body substantially duplicates its core's body (token-overlap heuristic over a threshold). Per Engineering-Brief rule #2.
- **Cache test**: identical instruction-layer inputs hit the cache; user-context/brief changes do not pollute the cached artefact.

---

## 7. Open questions for the plan stage

1. Exact field set per `LayerFields` — finalize by enumerating what the 7 cores / 6 profiles / 20 lenses actually set (the digests give the inventory; the plan pins the schema).
2. Whether `foundations.ts` content is authored as one prose block or pre-split into the section template slots (leaning: keep Foundations as labelled slots so the render template is data-driven).
3. Seed scope for the demo: which business type + lenses to author first (default: the user's own type, to get one full `profile×useCase×lens` compose demoable end-to-end).
