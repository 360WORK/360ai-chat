# Acumen Routing v2 Implementation Plan (sticky + classifier + visible lens)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Acumen use-case routing stick to the conversation, fall back to a cheap LLM classifier when regexes miss, and surface the active lens in the UI with per-message routing telemetry.

**Architecture:** Resolution pipeline per message in the api/server wrapper: `regexRoute(brief) ?? sticky(conversationId) ?? classifier(brief)`. A regex hit or classifier hit updates an in-memory per-conversation sticky store (mirrors the existing `profileCache` pattern). Pure classifier prompt-building/parsing lives in `packages/api/src/acumen/classifier.ts` (TS, testable); the Anthropic HTTP call is a thin wrapper in `api/server/controllers/agents/acumen.js`. A new `GET /api/acumen/active` endpoint exposes `{businessType, useCaseId}` for a conversation; the frontend renders a small lens chip from it.

**Tech Stack:** TypeScript (`packages/api`, `packages/data-provider`, `client`), Jest, `@anthropic-ai/sdk` (already a dependency of `/api`), React Query.

## Global Constraints

- Branch: `feat/acumen-routing-v2` off current `feat/acumen-delivery-fixes` head. No Laravel changes.
- All new backend logic TypeScript in `packages/api`; `api/` JS kept to thin stateful wrappers (matching the existing `acumen.js` pattern). Never `any`; no narration comments; import order per CLAUDE.md.
- Classifier model: env `ACUMEN_CLASSIFIER_MODEL`, default **exactly** `claude-haiku-4-5`. Classifier enabled only when `process.env.ANTHROPIC_API_KEY` is set and `ACUMEN_CLASSIFIER !== 'false'`.
- Classifier call budget: per-request `timeout: 2000` ms, `maxRetries: 0`; failures/timeouts → `null`, never break the message path. Never call the classifier for briefs with fewer than 4 whitespace-separated words.
- Sticky store: TTL 6 hours, max 2000 conversations, evict-on-insert like `profileCache`'s `evictForInsert`.
- Grid constraint is inviolable: any classifier output not in `workspacesFor(businessType)` resolves to null.
- Frontend: all user-facing text via `useLocalize()`; new keys prefixed `com_acumen_` in `client/src/locales/en/translation.json` only.
- Tests: packages/api from `packages/api/` (`npx jest src/acumen`); api from `api/`; client from `client/`. Mock ONLY the Anthropic HTTP call (external API) — everything else real.

---

### Task 1: Pure classifier module in packages/api

**Files:**
- Create: `packages/api/src/acumen/classifier.ts`
- Create: `packages/api/src/acumen/classifier.spec.ts`
- Modify: `packages/api/src/acumen/index.ts` (export the new functions)

**Interfaces:**
- Consumes: `workspacesFor(businessType)` from `./grid`, `UseCaseId`/`BusinessType` types from `./types`, `USE_CASES` metadata if a labels map exists (check `./types` / `./grid` for label text; if none, derive human labels from the id by replacing hyphens).
- Produces (used verbatim by Task 2):
  - `buildClassifierRequest(brief: string, businessType: BusinessType): ClassifierRequest | null` — returns `null` when the grid allows no use cases; otherwise `{ system: string, userMessage: string, schema: ClassifierSchema, allowed: UseCaseId[] }`.
  - `parseClassifierResult(raw: string, businessType: BusinessType): UseCaseId | null` — parses the model's JSON text, validates `useCaseId` against `workspacesFor(businessType)`, maps the literal `"none"` (and anything invalid) to `null`. Never throws.
  - `MIN_CLASSIFIER_BRIEF_WORDS = 4` exported const.

- [ ] **Step 1: Write failing tests** in `classifier.spec.ts`:

```ts
describe('buildClassifierRequest', () => {
  it('lists only grid-allowed use cases in the schema enum plus "none"', () => {
    const req = buildClassifierRequest('find candidates', 'recruitment-agencies');
    expect(req).not.toBeNull();
    expect(req!.schema.properties.useCaseId.enum).toEqual(
      expect.arrayContaining([...workspacesFor('recruitment-agencies'), 'none']),
    );
    expect(req!.schema.properties.useCaseId.enum).toHaveLength(
      workspacesFor('recruitment-agencies').length + 1,
    );
  });
  it('embeds the brief in the user message', () => {
    const req = buildClassifierRequest('map the fintech market', 'recruitment-agencies');
    expect(req!.userMessage).toContain('map the fintech market');
  });
});

describe('parseClassifierResult', () => {
  it('accepts a grid-allowed id', () => {
    expect(parseClassifierResult('{"useCaseId":"talent-mapping"}', 'recruitment-agencies')).toBe('talent-mapping');
  });
  it('rejects an id outside the grid', () => {
    const outside = 'workforce-planning';
    expect(workspacesFor('recruitment-agencies')).not.toContain(outside);
    expect(parseClassifierResult(`{"useCaseId":"${outside}"}`, 'recruitment-agencies')).toBeNull();
  });
  it('maps "none" and garbage to null without throwing', () => {
    expect(parseClassifierResult('{"useCaseId":"none"}', 'recruitment-agencies')).toBeNull();
    expect(parseClassifierResult('not json', 'recruitment-agencies')).toBeNull();
    expect(parseClassifierResult('', 'recruitment-agencies')).toBeNull();
  });
});
```

(Adjust the outside-the-grid example id after reading `grid.ts` — pick one genuinely absent from that business type's row.)

- [ ] **Step 2: Run to verify failure** — `cd packages/api && npx jest src/acumen/classifier.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** System prompt (concise, deterministic): `You classify a recruiter's request into exactly one use-case id, or "none" if no listed use case clearly fits. Reply with JSON only.` User message: the allowed ids each with a one-line gloss (hardcode short glosses per UseCaseId in this file), then `Request: "<brief>"`. Schema: `{type:'object', properties:{useCaseId:{type:'string', enum:[...allowed,'none']}}, required:['useCaseId'], additionalProperties:false}` typed as a `ClassifierSchema` interface (no `any`). `parseClassifierResult` wraps `JSON.parse` in try/catch.
- [ ] **Step 4: Run full acumen suite** — `npx jest src/acumen` → green.
- [ ] **Step 5: Commit** — `feat(acumen): pure classifier request builder and result parser`.

### Task 2: Sticky store + resolution pipeline + classifier call + telemetry

**Files:**
- Modify: `api/server/controllers/agents/acumen.js`
- Modify: `api/server/controllers/agents/client.js` (call-site: pass conversationId)
- Test: `api/server/controllers/agents/__tests__/acumen.spec.js`

**Interfaces:**
- Consumes: `buildClassifierRequest`, `parseClassifierResult`, `MIN_CLASSIFIER_BRIEF_WORDS`, existing `selectUseCase`, `composeSystemPrompt` from `@librechat/api` (verify export names in `packages/api/src/acumen/index.ts`; rebuild `packages/api` before running api tests: `cd packages/api && npm run build`).
- Produces:
  - `acumenContextPart(user, brief, conversationId)` — third param optional; existing callers with 2 args stay valid.
  - `getActiveUseCase(conversationId): { useCaseId: UseCaseId, expiresAt: number } | null` and `resetAcumenStickyCache()` exported for the route (Task 3) and tests.
- Resolution inside `acumenContextPart` after profile resolves (businessType non-null):
  1. `const regexHit = selectUseCase(brief, businessType)?.useCaseId ?? null;`
  2. `const sticky = getActiveUseCase(conversationId)?.useCaseId ?? null;` (validate sticky is still in `workspacesFor(businessType)`; drop if not)
  3. `let resolved = regexHit ?? sticky;` if still null and brief has ≥ `MIN_CLASSIFIER_BRIEF_WORDS` words and classifier enabled → `resolved = await classifyBrief(brief, businessType)` (2s bound).
  4. On any non-null `resolved` from regex or classifier (not from sticky), write sticky store.
  5. `composeSystemPrompt({ businessType, userContext, brief, useCaseId: resolved ?? undefined })`.
  6. `logger.debug('[acumen] route', { userId, conversationId, businessType, useCaseId: resolved, source })` where source ∈ `'regex' | 'sticky' | 'classifier' | 'none'`.
- `classifyBrief` uses `@anthropic-ai/sdk` (`const Anthropic = require('@anthropic-ai/sdk')` — verify how `api/` elsewhere imports it, e.g. in the anthropic endpoint code, and match that pattern): `client.messages.create({ model: process.env.ACUMEN_CLASSIFIER_MODEL || 'claude-haiku-4-5', max_tokens: 64, output_config: { format: { type: 'json_schema', schema: req.schema } }, system: req.system, messages: [{ role: 'user', content: req.userMessage }] }, { timeout: 2000, maxRetries: 0 })`. Extract the text block, feed to `parseClassifierResult`. try/catch → warn + null. Lazily construct the client once (module-level `let`), only when enabled.

- [ ] **Step 1: Write failing tests** (extend existing spec; follow its existing mock/fake-timer style). Mock only the Anthropic client (`jest.mock('@anthropic-ai/sdk')`). Cases:
  - regex hit routes and stickies: two calls same conversationId; second call with brief `'yes'` (no regex match) still composes WITH the same use case (assert via the composed prompt containing the use-case section, or by spying on the real `composeSystemPrompt` import).
  - sticky invalidated when business type's grid doesn't allow it.
  - classifier called only when regex+sticky miss AND brief ≥ 4 words; not called for `'yes'`.
  - classifier failure/timeout → compose proceeds with no use case (no throw).
  - sticky TTL expiry (fake timers) and `resetAcumenStickyCache`.
- [ ] **Step 2: Verify RED**, **Step 3: implement**, **Step 4:** `cd api && npx jest server/controllers/agents/__tests__/acumen.spec.js` green; also update the `client.js` call-site to `acumenContextPart(this.options.req?.user, messages.at(-1)?.text, this.options.req?.body?.conversationId)` (verify the body field name by grepping how `client.js`/routes read conversationId; use the actual field).
- [ ] **Step 5: Commit** — `feat(acumen): conversation-sticky use case with classifier fallback and routing telemetry`.

### Task 3: GET /api/acumen/active endpoint

**Files:**
- Modify: `api/server/routes/acumen.js`
- Test: `api/server/routes/__tests__/acumen.spec.js`

**Interfaces:**
- Consumes: `resolveProfile` + `getActiveUseCase` from `../controllers/agents/acumen`.
- Produces: `GET /api/acumen/active?conversationId=<id>` (JWT-authed like the existing workspaces route in this file — reuse its middleware): responds `{ businessType: BusinessType | null, useCaseId: UseCaseId | null }`. `businessType` from `resolveProfile(req.user)` (cached, cheap). Missing conversationId → `{ businessType, useCaseId: null }` (200, not error).

- [ ] **Step 1: Write failing route tests** following the existing route spec's setup style (supertest or handler-level — match the file). Cases: authed request returns businessType+useCaseId after a sticky write; null useCaseId when nothing sticky; no 500 when profile resolution fails (falls back to nulls).
- [ ] **Step 2: RED → implement → GREEN** (`cd api && npx jest server/routes/__tests__/acumen.spec.js`).
- [ ] **Step 3: Commit** — `feat(acumen): expose active lens endpoint per conversation`.

### Task 4: Data-provider plumbing + lens chip UI

**Files:**
- Modify: `packages/data-provider/src/api-endpoints.ts`, `src/data-service.ts`, `src/types/queries.ts`, `src/keys.ts` (follow the exact pattern of the existing acumen workspaces endpoint/hook — grep `acumen` in packages/data-provider and client/src/data-provider first)
- Modify: `client/src/data-provider/` acumen feature module (same folder as `useAcumenWorkspacesQuery`)
- Create: `client/src/components/Acumen/AcumenLensChip.tsx`
- Create: `client/src/components/Acumen/__tests__/AcumenLensChip.spec.tsx`
- Modify: `client/src/components/Chat/ChatView.tsx` (mount), `client/src/locales/en/translation.json`

**Interfaces:**
- Produces: `useAcumenActiveQuery(conversationId?: string, lastMessageId?: string)` — query key `[QueryKeys.acumenActive, conversationId, lastMessageId]` (add `acumenActive` to QueryKeys); `enabled: Boolean(conversationId)`; `staleTime: 15_000`; returns `TAcumenActiveResponse = { businessType: string | null; useCaseId: string | null }` (reuse existing acumen types in data-provider if present).
- Chip behavior: renders nothing when `useCaseId` is null. When set: small pill near the chat input area — mount it in `ChatView.tsx` adjacent to `AcumenConfirmDock` (line ~173 area) so it shares the conversation context. Label: use-case label from the shared `ACUMEN_CARD_META` in `packages/data-provider/src/acumen.ts` (it maps useCaseId → label) + business type humanized (`recruitment-agencies` → `Recruitment Agencies`). Text pattern: `<useCaseLabel> · <businessTypeLabel>`; `aria-label` via new key `com_acumen_active_lens` ("Active workspace lens"). `lastMessageId`: derive from the latest message in the conversation via the hooks ChatView already uses (see how `useCurrentConfirmFrame` or messages tree gets latest message; pass its id so the query refetches when a new message lands).

- [ ] **Step 1: FE failing tests** for AcumenLensChip: hidden when useCaseId null; renders label when present; has aria-label. Use `test/layout-test-utils` render + mock the query hook (mocking our own hook at the component boundary is acceptable for FE unit tests per existing Acumen spec patterns — mirror `AcumenWorkspaces.spec.tsx`).
- [ ] **Step 2: RED → implement data-provider (rebuild: `npm run build:data-provider` from root) → implement hook + chip + mount + localization → GREEN** (`cd client && npx jest AcumenLensChip`). Also run the existing Acumen FE specs to confirm no regression.
- [ ] **Step 3: Commit** — `feat(acumen): show active lens chip and wire active-lens query`.

### Task 5: Rebuild, full verification, backend restart

- [ ] **Step 1:** `unset npm_config_prefix; source ~/.nvm/nvm.sh; nvm use` then root `npm run build:data-provider` and `cd packages/api && npm run build`.
- [ ] **Step 2:** Full suites: packages/api `npx jest src/acumen`; api `npx jest server/controllers/agents/__tests__/acumen.spec.js server/routes/__tests__/acumen.spec.js`; client acumen specs.
- [ ] **Step 3:** Sanity: `node -e` compose check still opens with `# Live Instruction (Acumen)`; grep dist for `parseClassifierResult`.
- [ ] **Step 4:** Report; controller restarts the backend.
