# Onboarding Chat Integration 2a — Claims Plumbing + Conversational Interview (Plan 2a of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the 360AI OIDC onboarding claims onto the LibreChat user, expose them to the frontend, and make the agent conversationally run the right onboarding interview (company for owners, personal for everyone) when onboarding is incomplete — calling the already-wired `save_onboarding_profile` MCP tool to persist answers.

**Architecture:** Three layers. (1) Data plumbing — a flexible `oidcClaims` object on the user schema, populated from the id_token/userinfo at login, exposed via the user endpoint and the `TUser` type. (2) An interview-script module (pure) that selects + builds the system-prompt augmentation for the active scope. (3) A thin hook in `AgentClient.buildMessages` that injects the selected script into the agent's run context when onboarding is incomplete. The agent already has the `360ai` MCP server's `get_onboarding`/`save_onboarding_profile` tools (registered in `librechat.yaml`), so no tool wiring is needed — the script instructs the agent to use them.

**Tech Stack:** TypeScript (`packages/api`, `packages/data-schemas`, `packages/data-provider`), JS (`/api` thin hooks), Jest per-workspace, Mongoose, Passport OIDC.

**Repo for this plan:** `/Users/eth0/Herd/chat.360ai`. Plan 1 (parent Laravel app) is already shipped and provides the claims (`is_owner`, `role`, `client_id`, `client_name`, `company_onboarded`, `personal_onboarded`) and the MCP tools.

## Global Constraints

- New backend logic is **TypeScript in `packages/api`**; `/api` changes are thin JS wrappers only (per repo CLAUDE.md).
- **Never use `any`.** Reuse existing types from `packages/data-provider` before defining new ones. Add `import type { ... }` standalone.
- Onboarding claim keys are exactly: `is_owner` (boolean), `role` (`'owner'|'member'`), `client_id` (string|null), `client_name` (string|null), `company_onboarded` (boolean), `personal_onboarded` (boolean). Persist them under a single object field `oidcClaims` on the user (provider-agnostic bucket), NOT as six top-level user fields.
- The chat onboarding feature must NOT read or write the user's product flags; it only uses the `oidcClaims` bucket. (Mirrors Plan 1's rule about `clients.onboarding_completed`.)
- Interview scope selection rule: owner who has not completed the **company** profile → run the **company** interview first; otherwise (member, or owner whose company profile is done) if the user's **personal** profile is not complete → run the **personal** interview; if both relevant scopes are complete → no interview (return null).
- All user-facing strings added to the frontend use `useLocalize()` and only English keys in `client/src/locales/en/translation.json` (this plan adds none to the UI; that is Plan 3).
- Tests: run per workspace — `cd packages/api && npx jest <pattern>`, `cd packages/data-schemas && npx jest <pattern>`, etc. Use real logic over mocks; mock only external boundaries.
- Build shared packages after changing them: `npm run build:data-provider` (and the equivalent for data-schemas/api) before consuming workspaces rely on the new output.

---

### Task 1: Persist & expose onboarding claims

**Files:**
- Modify: `packages/data-schemas/src/schema/user.ts` (add `oidcClaims` field)
- Modify: `packages/data-schemas/src/types/user.ts` (or the `IUser` type location — confirm by reading the schema file's imports) to add the optional `oidcClaims` typing
- Modify: `api/strategies/openidStrategy.js` (~lines 686-713, the `user = { ... }` object in `processOpenIDAuth`) to populate `oidcClaims` from `userinfo`
- Modify: `api/server/controllers/UserController.js` (`PUBLIC_USER_RESPONSE_FIELDS`, ~lines 29-48) to include `oidcClaims`
- Modify: `packages/data-provider/src/types.ts` (`TUser`, ~line 213) to add `oidcClaims?`
- Create: `packages/api/src/onboarding/claims.ts` (pure mapper `extractOnboardingClaims(userinfo)`)
- Test: `packages/api/src/onboarding/claims.spec.ts`

**Interfaces:**
- Produces: `extractOnboardingClaims(userinfo: Record<string, unknown>): TOnboardingClaims` where
  `TOnboardingClaims = { is_owner: boolean; role: 'owner' | 'member'; client_id: string | null; client_name: string | null; company_onboarded: boolean; personal_onboarded: boolean }`.
  Exported from `packages/data-provider/src/types.ts` (so both backend and frontend reuse it). The user document gains `oidcClaims?: TOnboardingClaims`.

- [ ] **Step 1: Write the failing test** for the pure mapper

```ts
// packages/api/src/onboarding/claims.spec.ts
import { extractOnboardingClaims } from './claims';

describe('extractOnboardingClaims', () => {
  it('maps present claims with correct types', () => {
    const result = extractOnboardingClaims({
      is_owner: true,
      role: 'owner',
      client_id: '42',
      client_name: 'Acme',
      company_onboarded: true,
      personal_onboarded: false,
    });
    expect(result).toEqual({
      is_owner: true,
      role: 'owner',
      client_id: '42',
      client_name: 'Acme',
      company_onboarded: true,
      personal_onboarded: false,
    });
  });

  it('degrades to safe defaults when claims are absent', () => {
    expect(extractOnboardingClaims({})).toEqual({
      is_owner: false,
      role: 'member',
      client_id: null,
      client_name: null,
      company_onboarded: false,
      personal_onboarded: false,
    });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/api && npx jest src/onboarding/claims.spec.ts`
Expected: FAIL — cannot find module `./claims`.

- [ ] **Step 3: Add the shared type** in `packages/data-provider/src/types.ts` (near `TUser`)

```ts
export type TOnboardingClaims = {
  is_owner: boolean;
  role: 'owner' | 'member';
  client_id: string | null;
  client_name: string | null;
  company_onboarded: boolean;
  personal_onboarded: boolean;
};
```

And extend `TUser` with: `oidcClaims?: TOnboardingClaims;`

- [ ] **Step 4: Implement the mapper** `packages/api/src/onboarding/claims.ts`

```ts
import type { TOnboardingClaims } from 'librechat-data-provider';

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const asBool = (v: unknown): boolean => v === true;

export function extractOnboardingClaims(userinfo: Record<string, unknown>): TOnboardingClaims {
  const isOwner = asBool(userinfo.is_owner);
  return {
    is_owner: isOwner,
    role: isOwner ? 'owner' : 'member',
    client_id: asString(userinfo.client_id),
    client_name: asString(userinfo.client_name),
    company_onboarded: asBool(userinfo.company_onboarded),
    personal_onboarded: asBool(userinfo.personal_onboarded),
  };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd packages/api && npx jest src/onboarding/claims.spec.ts`
Expected: PASS (2 passing).

- [ ] **Step 6: Wire the schema** — in `packages/data-schemas/src/schema/user.ts`, add an optional mixed sub-object (read the file first to match its field style; use `{ type: Object, default: undefined }` or a typed sub-schema consistent with how `personalization` is declared). Update the corresponding `IUser` type to include `oidcClaims?: TOnboardingClaims` (import the type from data-provider as the schema package already imports from it; if it does not, mirror the local type shape). Build: `cd packages/data-schemas && npm run build` (or root `npm run build`).

- [ ] **Step 7: Populate at login** — in `api/strategies/openidStrategy.js`, where the `user` object is built from `userinfo` (~686-713), add `oidcClaims: extractOnboardingClaims(userinfo)` (import `extractOnboardingClaims` from `@librechat/api`). Confirm BOTH the create path and the update path set it (so returning users get refreshed claims each login). Read the surrounding code to confirm the update path also persists `oidcClaims`.

- [ ] **Step 8: Expose to frontend** — in `api/server/controllers/UserController.js`, add `'oidcClaims'` to `PUBLIC_USER_RESPONSE_FIELDS`.

- [ ] **Step 9: Integration test** for the login mapping (data-schemas, real in-memory Mongo)

```ts
// packages/data-schemas/src/schema/__tests__/user.oidcClaims.spec.ts  (match existing test harness in this package)
// Create a user with oidcClaims, read it back, assert the field round-trips with correct types.
```
Write a test that creates a user document with an `oidcClaims` object and asserts it persists and reads back equal. Run: `cd packages/data-schemas && npx jest user.oidcClaims`. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/onboarding/claims.ts packages/api/src/onboarding/claims.spec.ts packages/data-provider/src/types.ts packages/data-schemas/src/schema/user.ts packages/data-schemas/src/types/user.ts api/strategies/openidStrategy.js api/server/controllers/UserController.js packages/data-schemas/src/schema/__tests__/user.oidcClaims.spec.ts
git commit -m "feat(onboarding): persist & expose 360AI onboarding OIDC claims on the user"
```

(Stage only the files you actually changed — adjust the schema/type paths to the real ones you edited.)

---

### Task 2: Interview-script module + scope selector

**Files:**
- Create: `packages/api/src/onboarding/interview.ts`
- Test: `packages/api/src/onboarding/interview.spec.ts`

**Interfaces:**
- Consumes: `TOnboardingClaims` (from Task 1).
- Produces:
  - `selectInterviewScope(claims: TOnboardingClaims): 'company' | 'personal' | null` — implements the Global Constraints selection rule.
  - `buildInterviewInstructions(scope: 'company' | 'personal'): string` — returns the system-prompt augmentation text for that scope (instructs the agent to interview the user, then call `save_onboarding_profile` with `scope` and a `profile_json` of the known fields, and to generate 4-6 `tailored_prompts_json`).
  - `getOnboardingInjection(claims: TOnboardingClaims): string | null` — convenience: `const scope = selectInterviewScope(claims); return scope ? buildInterviewInstructions(scope) : null;`

- [ ] **Step 1: Write the failing test**

```ts
import { selectInterviewScope, buildInterviewInstructions, getOnboardingInjection } from './interview';
import type { TOnboardingClaims } from 'librechat-data-provider';

const base: TOnboardingClaims = {
  is_owner: false, role: 'member', client_id: '1', client_name: 'Acme',
  company_onboarded: false, personal_onboarded: false,
};

describe('selectInterviewScope', () => {
  it('owner without company profile → company', () => {
    expect(selectInterviewScope({ ...base, is_owner: true, role: 'owner' })).toBe('company');
  });
  it('owner with company done but personal not → personal', () => {
    expect(selectInterviewScope({ ...base, is_owner: true, role: 'owner', company_onboarded: true })).toBe('personal');
  });
  it('member without personal profile → personal', () => {
    expect(selectInterviewScope(base)).toBe('personal');
  });
  it('member with personal done → null', () => {
    expect(selectInterviewScope({ ...base, personal_onboarded: true })).toBeNull();
  });
  it('owner with both done → null', () => {
    expect(selectInterviewScope({ ...base, is_owner: true, role: 'owner', company_onboarded: true, personal_onboarded: true })).toBeNull();
  });
});

describe('buildInterviewInstructions', () => {
  it('company script names the company fields and the save tool', () => {
    const s = buildInterviewInstructions('company');
    expect(s).toContain('save_onboarding_profile');
    expect(s).toContain('company');
    expect(s).toContain('industry');
  });
  it('personal script names the personal fields and the save tool', () => {
    const s = buildInterviewInstructions('personal');
    expect(s).toContain('save_onboarding_profile');
    expect(s).toContain('desk');
  });
});

describe('getOnboardingInjection', () => {
  it('returns null when nothing to onboard', () => {
    expect(getOnboardingInjection({ ...base, personal_onboarded: true })).toBeNull();
  });
  it('returns the script when onboarding is pending', () => {
    expect(getOnboardingInjection(base)).toContain('save_onboarding_profile');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/api && npx jest src/onboarding/interview.spec.ts`
Expected: FAIL — cannot find module `./interview`.

- [ ] **Step 3: Implement** `packages/api/src/onboarding/interview.ts`

```ts
import type { TOnboardingClaims } from 'librechat-data-provider';

export type InterviewScope = 'company' | 'personal';

export function selectInterviewScope(claims: TOnboardingClaims): InterviewScope | null {
  if (claims.is_owner && !claims.company_onboarded) {
    return 'company';
  }
  if (!claims.personal_onboarded) {
    return 'personal';
  }
  return null;
}

const COMPANY_INSTRUCTIONS = `You are onboarding the company owner. Before helping with anything else, run a warm, conversational interview to build a comprehensive company profile. Ask about, one topic at a time: industry; what the company recruits for (desks/functions); target roles & seniority; markets/locations; typical hiring volume; tooling/ATS; ideal candidate profile (ICP); and the employer value proposition. Keep it brief and natural — do not dump all questions at once.

When you have enough, call the \`save_onboarding_profile\` tool with scope:"company" and a profile_json JSON object using these keys where known: industry, recruits_for, target_roles, seniority, markets, hiring_volume, tooling, candidate_icp, employer_value_prop. Also pass tailored_prompts_json: a JSON array of 4-6 short, specific recruiting prompts tailored to what you learned (e.g. sourcing searches, market scans). After it returns success, confirm to the user that setup is complete and proceed to help them.`;

const PERSONAL_INSTRUCTIONS = `You are onboarding this recruiter. Before helping with anything else, run a warm, conversational interview to build their personal working profile. Ask, one topic at a time, about: their desk/specialty; their role; the seniority they focus on; the geographies they cover; how they work day-to-day; and what they want this copilot to do for them. Keep it brief and natural.

When you have enough, call the \`save_onboarding_profile\` tool with scope:"personal" and a profile_json JSON object using these keys where known: desk, role, seniority_focus, geographies, workflow, copilot_goals. Also pass tailored_prompts_json: a JSON array of 4-6 short, specific prompts tailored to their desk. After it returns success, confirm setup is complete and proceed to help them.`;

export function buildInterviewInstructions(scope: InterviewScope): string {
  return scope === 'company' ? COMPANY_INSTRUCTIONS : PERSONAL_INSTRUCTIONS;
}

export function getOnboardingInjection(claims: TOnboardingClaims): string | null {
  const scope = selectInterviewScope(claims);
  return scope ? buildInterviewInstructions(scope) : null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd packages/api && npx jest src/onboarding/interview.spec.ts`
Expected: PASS (all).

- [ ] **Step 5: Export** from the package barrel — add `export * from './onboarding/interview';` and `export * from './onboarding/claims';` to `packages/api/src/index.ts` (read the file first; match its export style). Build: `cd packages/api && npm run build` (or root build).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/onboarding/interview.ts packages/api/src/onboarding/interview.spec.ts packages/api/src/index.ts
git commit -m "feat(onboarding): interview-script module + scope selector"
```

---

### Task 3: Inject the interview script into the agent's run context

**Files:**
- Modify: `api/server/controllers/agents/client.js` (the `buildMessages` method, ~lines 502-535 where `agentRunContextParts` is assembled before `applyContextToAgent`)
- Test: `api/server/controllers/agents/__tests__/onboardingInjection.spec.js` (or co-located test matching this controller's existing test layout — confirm by listing the controller's `__tests__`)

**Interfaces:**
- Consumes: `getOnboardingInjection` (from Task 2, via `@librechat/api`), and `this.options.req.user.oidcClaims` (from Task 1).
- Produces: when `getOnboardingInjection(user.oidcClaims)` is non-null, that string is appended to `agentRunContextParts` for the primary agent so it becomes part of the agent's instructions/run context. When null (onboarding complete) or `oidcClaims` is absent, behavior is unchanged.

- [ ] **Step 1: Read the integration point.** Open `api/server/controllers/agents/client.js` around 288-538. Confirm exactly how `agentRunContextParts` (a string-parts array joined with `\n\n`) is built and passed as `sharedRunContext` to `applyContextToAgent`. Note the variable names verbatim — the injection must match the real code.

- [ ] **Step 2: Write the failing test.** Extract the injection decision into a tiny pure helper so it is unit-testable without booting the full agent client. Create the test for that helper:

```js
// api/server/controllers/agents/__tests__/onboardingInjection.spec.js
const { onboardingContextPart } = require('../onboarding');

describe('onboardingContextPart', () => {
  it('returns the interview script for a member who has not onboarded', () => {
    const part = onboardingContextPart({
      is_owner: false, role: 'member', client_id: '1', client_name: 'Acme',
      company_onboarded: false, personal_onboarded: false,
    });
    expect(part).toContain('save_onboarding_profile');
  });
  it('returns null when claims are missing', () => {
    expect(onboardingContextPart(undefined)).toBeNull();
  });
  it('returns null when onboarding is complete', () => {
    expect(onboardingContextPart({
      is_owner: false, role: 'member', client_id: '1', client_name: 'Acme',
      company_onboarded: false, personal_onboarded: true,
    })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd api && npx jest server/controllers/agents/__tests__/onboardingInjection.spec.js`
Expected: FAIL — cannot find module `../onboarding`.

- [ ] **Step 4: Implement the thin helper** `api/server/controllers/agents/onboarding.js`

```js
const { getOnboardingInjection } = require('@librechat/api');

/**
 * @param {import('librechat-data-provider').TOnboardingClaims | undefined} oidcClaims
 * @returns {string | null}
 */
function onboardingContextPart(oidcClaims) {
  if (!oidcClaims) {
    return null;
  }
  return getOnboardingInjection(oidcClaims);
}

module.exports = { onboardingContextPart };
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd api && npx jest server/controllers/agents/__tests__/onboardingInjection.spec.js`
Expected: PASS (3 passing).

- [ ] **Step 6: Use the helper in `buildMessages`.** In `api/server/controllers/agents/client.js`, require the helper at the top (`const { onboardingContextPart } = require('./onboarding');`). Where `agentRunContextParts` is built for the primary agent (the `agentId === this.options.agent.id` branch, ~514-535), compute `const onboardingPart = onboardingContextPart(this.options.req?.user?.oidcClaims);` and push it into `agentRunContextParts` when truthy, BEFORE the `.filter(Boolean).join('\n\n')`. Match the exact variable names found in Step 1. Do not alter the non-primary-agent paths.

- [ ] **Step 7: Verify no regression in the controller's existing tests**

Run: `cd api && npx jest server/controllers/agents`
Expected: PASS (existing agent controller tests still green; new injection test green). If any existing test constructs a `req.user` without `oidcClaims`, the `!oidcClaims` guard keeps it null — confirm.

- [ ] **Step 8: Commit**

```bash
git add api/server/controllers/agents/onboarding.js api/server/controllers/agents/__tests__/onboardingInjection.spec.js api/server/controllers/agents/client.js
git commit -m "feat(onboarding): inject interview script into agent run context when onboarding is incomplete"
```

---

## Self-Review

**Spec coverage (Plan 2a slice):**
- Persist onboarding claims to the user + expose to frontend → Task 1 ✓
- Frontend can read onboarding status from `user.oidcClaims` (enables Plan 3 soft-gate) → Task 1 ✓
- Conversational interview, owner vs member scope selection → Task 2 ✓
- Agent runs the interview when incomplete and is told to call `save_onboarding_profile` (already-wired tool) → Tasks 2 + 3 ✓
- (Deferred: live mid-session status refresh + profile→Memories distillation → Plan 2b. UI components → Plan 3.)

**Placeholder scan:** Tasks 1 Step 6/7 and Task 3 Step 1/6 require reading the real file to confirm exact field-declaration style and variable names before editing — these are "confirm against the codebase then implement using the shown code," not TBDs. All pure-logic steps contain complete code.

**Type/name consistency:** `TOnboardingClaims` is defined once in data-provider and reused by `extractOnboardingClaims`, `selectInterviewScope`, `getOnboardingInjection`, and `onboardingContextPart`. The selection rule in Task 2 matches the Global Constraints rule verbatim.

## Downstream
- **Plan 2b:** `GET /api/onboarding/status` → `OnboardingSync` service (calls `get_onboarding` via MCP, modeled on `api/server/services/MCP.js`), refreshes `user.oidcClaims` flags to defeat login-time staleness, and upserts a distilled memory via `setMemory` (respecting `personalization.memories` + memory `tokenLimit`).
- **Plan 3:** NumberedCardList component; soft-gate nudge + tailored cards on `Landing.tsx` (cards sourced from 2b's status `tailored_prompts`); "Workspace profile" Settings tab editing via the save/get path.
