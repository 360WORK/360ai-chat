# Onboarding Chat Integration 2b — Live Status + Profile Read/Write Proxy (Plan 2b of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chat frontend a live, always-fresh way to read onboarding status + profile + tailored prompts, and to edit the profile — by calling the existing `get_onboarding` / `save_onboarding_profile` MCP tools (authenticated as the current user) from thin chat backend routes. This defeats the login-time staleness of the persisted claims and unblocks Plan 3's tailored cards and Workspace-profile Settings tab.

**Architecture:** A single backend helper (`callOnboardingTool`) wraps `mcpManager.callTool` for the `360ai` server, mirroring the existing non-agent caller in `api/server/services/MCP.js` and resolving the user's OpenID access token via `packages/api/src/utils/oidc.ts`. Two thin authenticated routes use it: `GET /api/onboarding/status` (reads `get_onboarding`, also refreshes the persisted `user.oidcClaims` flags so other surfaces stay consistent) and `PUT /api/onboarding/profile` (writes via `save_onboarding_profile`). Frontend gets a query hook + a mutation hook. Profile→Memories distillation is intentionally NOT in this plan — the agent reads `get_onboarding` inline when it needs profile content (decided in 2a).

**Tech Stack:** JS (`/api` routes — thin), TypeScript (`packages/api` helper + `packages/data-provider` types/endpoints/service), React Query (`client`), Jest per-workspace.

**Repo:** `/Users/eth0/Herd/chat.360ai` only. Depends on: Plan 1 (MCP tools `get_onboarding`/`save_onboarding_profile` in the Laravel app) and Plan 2a (`TOnboardingClaims`, `user.oidcClaims`, `extractOnboardingClaims`).

## Global Constraints

- New backend logic is **TypeScript in `packages/api`**; `/api` routes are thin JS wrappers. Never use `any`. Reuse `TOnboardingClaims` from `packages/data-provider`; extend it rather than redefining.
- The MCP call MUST be authenticated as the current user. Do NOT invent `callTool` arguments — **mirror the existing `callMCPTool` invocation in `api/server/services/MCP.js`** (managers via `getMCPManager(userId)`, `getFlowStateManager(getLogStores(CacheKeys.FLOWS))`, server config via `getMCPServersRegistry().getServerConfig('360ai', userId, {})`, `tokenMethods` from `~/models`, and the user's OpenID token resolved through `packages/api/src/utils/oidc.ts` — `extractOpenIDTokenInfo` / `processOpenIDPlaceholders`). The server name is `360ai`.
- The MCP tool returns a Response whose content is JSON text — parse it to an object. `get_onboarding` returns exactly Plan 1's `getFor` shape: `{ is_owner, client: {id,name}, company: {completed, profile}, personal: {completed, profile}, tailored_prompts: string[] }`. `save_onboarding_profile` takes `{ scope: 'company'|'personal', profile_json: string, tailored_prompts_json?: string }` and returns `{ status:'saved', scope, completed:true }`.
- **Two distinct shapes — do NOT conflate them.** (a) The raw `get_onboarding` result is **nested snake_case** (`is_owner`, `client.id`, `company.completed`, `personal.completed`, `tailored_prompts`) — this is what the `/api/onboarding/status` response carries verbatim. (b) `TOnboardingClaims` (already shipped in 2a, stored on `user.oidcClaims`) is **flat camelCase**: `{ isOwner, role, clientId: string|null, clientName: string|null, companyOnboarded, personalOnboarded }`. `extractOnboardingClaims` maps *flat userinfo* → camelCase and is NOT reusable on the nested `get_onboarding` result; `refreshUserClaims` must map the nested result to camelCase by hand.
- Routes use `requireJwtAuth` (and `configMiddleware` where memory/config is needed), registered in `api/server/routes/index.js`. Follow the shape of `api/server/routes/memories.js`.
- Tests: per workspace (`cd packages/api && npx jest …`, `cd api && npx jest …`). Mock ONLY the external MCP boundary (the `mcpManager.callTool` result and the Laravel response); exercise real parsing/route logic.
- If, while implementing Task 1, the `callTool` token wiring proves not replicable from a bare route after genuinely mirroring `MCP.js` (e.g. the access token is only available inside the agent request config, not derivable from `req.user`), STOP and report BLOCKED with specifics — the documented fallback is to add plain OIDC-guarded REST endpoints `GET/PUT /api/onboarding` on the Laravel app and have these chat routes `fetch` them with a Bearer token from `extractOpenIDTokenInfo(req.user)`. Do not silently switch architectures without surfacing it.

---

### Task 1: `callOnboardingTool` helper (authenticated MCP call)

**Files:**
- Read first (the pattern to mirror): `api/server/services/MCP.js` (the `callMCPTool`/`callTool` invocation, ~lines 780-851) and `packages/api/src/utils/oidc.ts` (`extractOpenIDTokenInfo`, `processOpenIDPlaceholders`).
- Create: `api/server/services/Onboarding.js` (CommonJS service, since it consumes `~/config`, `~/cache`, `~/models` which live in `/api`)
- Test: `api/server/services/__tests__/Onboarding.spec.js`

**Interfaces:**
- Produces:
  - `async callOnboardingTool(user, toolName, toolArguments)` → parsed JSON object returned by the MCP tool (`get_onboarding` or `save_onboarding_profile`). Throws on MCP error.
  - `parseToolResult(result)` → the JSON object parsed from the MCP Response content array (exported for unit testing).

- [ ] **Step 1: Read `MCP.js` and `oidc.ts`** to capture the exact `callTool` argument set and how the OpenID token is resolved. Note them — Task implementation must match.

- [ ] **Step 2: Write the failing test for `parseToolResult`** (pure, no MCP needed)

```js
// api/server/services/__tests__/Onboarding.spec.js
const { parseToolResult } = require('../Onboarding');

describe('parseToolResult', () => {
  it('parses JSON from an MCP content array', () => {
    const result = { content: [{ type: 'text', text: JSON.stringify({ is_owner: true, tailored_prompts: ['a'] }) }] };
    expect(parseToolResult(result)).toEqual({ is_owner: true, tailored_prompts: ['a'] });
  });
  it('returns the object directly if already parsed', () => {
    expect(parseToolResult({ is_owner: false })).toEqual({ is_owner: false });
  });
  it('throws on an MCP error result', () => {
    expect(() => parseToolResult({ isError: true, content: [{ type: 'text', text: 'No workspace selected.' }] }))
      .toThrow('No workspace selected.');
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd api && npx jest server/services/__tests__/Onboarding.spec.js`
Expected: FAIL — cannot find module `../Onboarding`.

- [ ] **Step 4: Implement `api/server/services/Onboarding.js`.** Write `parseToolResult` (handle: already-object; `{content:[{text}]}` JSON; `isError` → throw the text). Write `callOnboardingTool(user, toolName, toolArguments)` by **mirroring `MCP.js`'s `callTool` invocation exactly** — same managers, `serverName: '360ai'`, `serverConfig` from the registry, `provider`, `tokenMethods` from `~/models`, and the user's resolved OpenID token (via the oidc util / the same `customUserVars`/`requestBody` path `MCP.js` uses). Then `return parseToolResult(result)`. Keep the function small; do not add retry/caching.

(Full code is not transcribed here because it must match `MCP.js` verbatim in argument shape — copy that call site and substitute `serverName='360ai'`, `toolName`, `toolArguments`. This is the one task where reading the reference file is mandatory before writing.)

- [ ] **Step 5: Run the `parseToolResult` test, verify it passes**

Run: `cd api && npx jest server/services/__tests__/Onboarding.spec.js`
Expected: PASS (3 passing). (The `callOnboardingTool` MCP path is covered by the route integration test in Task 2 with the MCP boundary mocked.)

- [ ] **Step 6: Commit**

```bash
git add api/server/services/Onboarding.js api/server/services/__tests__/Onboarding.spec.js
git commit -m "feat(onboarding): callOnboardingTool MCP helper + result parser"
```

---

### Task 2: `GET /api/onboarding/status` route (+ refresh persisted claims)

**Files:**
- Modify: `api/server/services/Onboarding.js` (add `getOnboardingStatus(user)` + `refreshUserClaims(user, status)`)
- Create: `api/server/routes/onboarding.js`
- Modify: `api/server/routes/index.js` (register `onboarding`) and wherever route modules are mounted (mirror how `memories` is mounted — confirm the mount path so it serves at `/api/onboarding`)
- Test: `api/server/routes/__tests__/onboarding.spec.js`

**Interfaces:**
- Consumes: `callOnboardingTool` (Task 1), `TOnboardingClaims` (2a, camelCase), user-update model method from `~/models` (find the existing `updateUser`). Note: `refreshUserClaims` maps the nested snake_case `get_onboarding` result to camelCase by hand — it does NOT reuse `extractOnboardingClaims` (which expects flat userinfo).
- Produces:
  - `getOnboardingStatus(user)` → `{ is_owner, role, client, company, personal, tailored_prompts }` (the `get_onboarding` result, with `role` derived as `is_owner ? 'owner' : 'member'`).
  - `refreshUserClaims(user, status)` → updates `user.oidcClaims` (`company_onboarded = status.company.completed`, `personal_onboarded = status.personal.completed`, plus `is_owner`/`role`/`client_*`) via `updateUser`, defeating login-time staleness.
  - Route `GET /api/onboarding/status` → `{ onboarding: <status> }`.

- [ ] **Step 1: Write the failing route test** (mock `callOnboardingTool` at the service boundary; real Express route + real `requireJwtAuth` via the test harness used by other route specs — confirm the existing pattern in `api/server/routes/__tests__`)

```js
// api/server/routes/__tests__/onboarding.spec.js
// Mock '../../services/Onboarding' callOnboardingTool to return a fixed get_onboarding payload.
// Hit GET /api/onboarding/status as an authenticated user; assert body.onboarding.company.completed
// and body.onboarding.tailored_prompts are returned; assert updateUser was called with refreshed oidcClaims flags.
```
Write the concrete test mirroring an existing route spec's auth/setup. Assert: 200; `body.onboarding.tailored_prompts` equals the mocked value; `updateUser` spy called with `oidcClaims.companyOnboarded` (camelCase) matching the mock's `company.completed`.

- [ ] **Step 2: Run it, verify it fails**

Run: `cd api && npx jest server/routes/__tests__/onboarding.spec.js`
Expected: FAIL — route not found / module missing.

- [ ] **Step 3: Implement `getOnboardingStatus` + `refreshUserClaims`** in `Onboarding.js`:

```js
async function getOnboardingStatus(user) {
  const status = await callOnboardingTool(user, 'get_onboarding', {});
  return { ...status, role: status.is_owner ? 'owner' : 'member' };
}

async function refreshUserClaims(user, status) {
  const { updateUser } = require('~/models');
  // Map the NESTED snake_case get_onboarding result → flat camelCase TOnboardingClaims.
  const oidcClaims = {
    isOwner: !!status.is_owner,
    role: status.is_owner ? 'owner' : 'member',
    clientId: status.client?.id != null ? String(status.client.id) : null,
    clientName: status.client?.name ?? null,
    companyOnboarded: !!status.company?.completed,
    personalOnboarded: !!status.personal?.completed,
  };
  await updateUser(user.id, { oidcClaims });
  return oidcClaims;
}
```
(Confirm `updateUser`'s exact signature in `~/models` and adjust.)

- [ ] **Step 4: Implement the route** `api/server/routes/onboarding.js` (mirror `memories.js`):

```js
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { getOnboardingStatus, refreshUserClaims } = require('~/server/services/Onboarding');

const router = express.Router();
router.use(requireJwtAuth);

router.get('/status', async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.user);
    await refreshUserClaims(req.user, status);
    res.json({ onboarding: status });
  } catch (error) {
    res.status(502).json({ error: 'Failed to load onboarding status.' });
  }
});

module.exports = router;
```

- [ ] **Step 5: Register + mount** in `api/server/routes/index.js` (add `onboarding`) and the server mount file (find where `memories` is mounted as `/api/memories` or similar and add `onboarding` at `/api/onboarding`).

- [ ] **Step 6: Run the route test, verify it passes**

Run: `cd api && npx jest server/routes/__tests__/onboarding.spec.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/server/services/Onboarding.js api/server/routes/onboarding.js api/server/routes/index.js api/server/routes/__tests__/onboarding.spec.js
git commit -m "feat(onboarding): GET /api/onboarding/status route with live MCP read + claim refresh"
```

(Adjust the staged path list to include the actual server mount file you edited.)

---

### Task 3: `PUT /api/onboarding/profile` write route

**Files:**
- Modify: `api/server/services/Onboarding.js` (add `saveOnboardingProfile(user, { scope, profile, tailoredPrompts })`)
- Modify: `api/server/routes/onboarding.js` (add `PUT /profile`)
- Test: extend `api/server/routes/__tests__/onboarding.spec.js`

**Interfaces:**
- Consumes: `callOnboardingTool`.
- Produces: `saveOnboardingProfile(user, { scope, profile, tailoredPrompts })` → calls `save_onboarding_profile` with `scope`, `profile_json: JSON.stringify(profile)`, and (if `tailoredPrompts`) `tailored_prompts_json: JSON.stringify(tailoredPrompts)`; returns the tool result. Route `PUT /api/onboarding/profile` body `{ scope, profile, tailored_prompts? }` → `{ saved: true }` on success; 400 on invalid `scope`; 502 on tool error.

- [ ] **Step 1: Write the failing test** — PUT with `{scope:'personal', profile:{desk:'AI'}}` → assert `callOnboardingTool` called with `('save_onboarding_profile', { scope:'personal', profile_json: '{"desk":"AI"}' })`; assert 200 `{saved:true}`. PUT with `{scope:'bogus'}` → 400.

- [ ] **Step 2: Run it, verify it fails** — `cd api && npx jest server/routes/__tests__/onboarding.spec.js` → new cases FAIL.

- [ ] **Step 3: Implement** `saveOnboardingProfile` in the service and the `PUT /profile` handler (validate `scope ∈ {company,personal}` → else 400; build the `*_json` strings; call the tool; map errors to 502).

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add api/server/services/Onboarding.js api/server/routes/onboarding.js api/server/routes/__tests__/onboarding.spec.js
git commit -m "feat(onboarding): PUT /api/onboarding/profile write route"
```

---

### Task 4: Frontend data-provider wiring (query + mutation hooks)

**Files:**
- Modify: `packages/data-provider/src/api-endpoints.ts` (add `onboardingStatus`, `onboardingProfile` endpoints)
- Modify: `packages/data-provider/src/data-service.ts` (add `getOnboardingStatus`, `updateOnboardingProfile`)
- Modify: `packages/data-provider/src/types/queries.ts` (add `TOnboardingStatusResponse`) and `packages/data-provider/src/keys.ts` (add `QueryKeys.onboardingStatus`)
- Create: `client/src/data-provider/Onboarding/queries.ts` + `index.ts`, and re-export via `client/src/data-provider/index.ts`
- Test: `client/src/data-provider/Onboarding/__tests__/queries.spec.tsx` (mirror an existing query-hook test)

**Interfaces:**
- Consumes: the routes from Tasks 2–3, `TOnboardingClaims`.
- Produces:
  - `TOnboardingStatusResponse = { onboarding: { is_owner: boolean; role: 'owner'|'member'; client: { id: string|number; name: string } | null; company: { completed: boolean; profile: Record<string, unknown> | null }; personal: { completed: boolean; profile: Record<string, unknown> | null }; tailored_prompts: string[] } }`
  - `useOnboardingStatusQuery(options?)` → React Query hook on `[QueryKeys.onboardingStatus]` calling `dataService.getOnboardingStatus()`.
  - `useUpdateOnboardingProfileMutation(options?)` → mutation calling `dataService.updateOnboardingProfile({ scope, profile, tailored_prompts? })`, invalidating `[QueryKeys.onboardingStatus]` on success.

- [ ] **Step 1: Write the failing hook test** (mirror `client/src/data-provider/.../queries` test util) — render `useOnboardingStatusQuery` with a mocked `dataService.getOnboardingStatus` resolving a fixed payload; assert the hook returns it.

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement** endpoints (`export const onboardingStatus = () => \`${BASE}/api/onboarding/status\`;` etc.), data-service GET/PUT functions, the response type, the QueryKey, and the two hooks (mirror `useMemoriesQuery` / `useUpdateMemoryMutation`). Build: `npm run build:data-provider`.

- [ ] **Step 4: Run the hook test, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/types/queries.ts packages/data-provider/src/keys.ts client/src/data-provider/Onboarding/ client/src/data-provider/index.ts
git commit -m "feat(onboarding): data-provider status query + profile mutation hooks"
```

---

## Self-Review

**Spec coverage (Plan 2b slice):**
- Live status read (defeats login-time staleness) → Tasks 1–2 ✓
- Persisted `user.oidcClaims` refreshed from live status → Task 2 ✓
- Tailored prompts available to the frontend → Tasks 2 + 4 (in the status payload) ✓
- Profile read (for the Settings tab) → status payload `company.profile` / `personal.profile` (Task 2) ✓
- Profile write (Settings tab edits) → Task 3 ✓
- Frontend hooks for Plan 3 → Task 4 ✓
- (Deferred deliberately: profile→Memories distillation — agent reads `get_onboarding` inline. Documented in 2a.)

**Placeholder scan:** Task 1 Step 4 intentionally instructs "mirror `MCP.js` verbatim" rather than transcribing a `callTool` arg list I cannot guarantee — this is the honest treatment of intricate existing infra, paired with a mandatory read step and a documented BLOCKED fallback. All pure-logic steps (`parseToolResult`, claim refresh, validation, hooks) carry complete code.

**Type/name consistency:** `getOnboardingStatus`/`refreshUserClaims`/`saveOnboardingProfile`/`callOnboardingTool`/`parseToolResult` are named consistently across Tasks 1–3; the `get_onboarding` shape in Task 4's `TOnboardingStatusResponse` matches Plan 1's `getFor` and Task 2's service output; `QueryKeys.onboardingStatus` is defined once and reused by the hook + mutation invalidation.

## Downstream — Plan 3 (UI)
Consumes `useOnboardingStatusQuery` (soft-gate from `company`/`personal.completed`; tailored cards from `tailored_prompts`) and `useUpdateOnboardingProfileMutation` (Workspace-profile Settings tab). Builds the reusable `NumberedCardList`, the landing soft-gate nudge + tailored cards, and the Settings tab.
