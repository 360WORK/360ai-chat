# AI Acumen — Activate via Profile Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Flip the dormant Acumen composer live by fetching the onboarding profile at request time (source of truth) and deriving `business_type` from it — no OIDC claim dependency.

**Architecture:** Laravel persists `business_type` first-class on the company profile (one-line whitelist fix). The chat wrapper `acumenContextPart` becomes async: it fetches the onboarding profile via the existing `getOnboardingStatus(user)`, normalizes the business-type value to a composer `BusinessType` id via an explicit map, builds a user-context summary, and calls the pure `composeSystemPrompt`. Per-user TTL cache avoids a round-trip every turn. The composer stays pure (no I/O); all I/O lives in the JS wrapper.

**Tech Stack:** Laravel 11 (PHP, `/Users/eth0/Herd/360ai`), TypeScript (`packages/api/src/acumen`), Jest, PHPUnit.

## Global Constraints

- Two repos / two branches: Laravel on `feature/360ai-chat-auth` (`/Users/eth0/Herd/360ai`); chat on `feat/360ai-result-cards` (`/Users/eth0/Herd/chat.360ai`). Commits stage **explicit paths only** (both branches carry unrelated WIP).
- Chat: new logic is **TypeScript in `packages/api/src/acumen`**; the `/api` wrapper stays thin JS. No `any`; avoid `unknown`/`Record<string,unknown>`.
- Chat tests: `cd packages/api && npx jest acumen`. Laravel tests: `php artisan test` (filter to the touched test).
- After editing Laravel OIDC/profile/tools, run `php artisan optimize:clear`.
- After editing chat `/api` or config, backend reloads via nodemon (`touch api/server/index.js`); live prompt behavior is verified by the USER (manual login), not automated.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **business_type value → composer id map (load-bearing, explicit — NOT `_`→`-`):**
  `recruitment_agency`→`recruitment-agencies`; `executive_search`→`executive-search`; `rec2rec`→`rec2rec`; `rpo_provider`→`rpo-providers`; `in_house_ta`→`in-house-ta`; `enterprise_talent`→`enterprise-talent`.

---

### Task 1: Pure helpers — `normalizeBusinessType` + `buildUserContextSummary` (chat, TS)

**Files:**
- Create: `packages/api/src/acumen/profile.ts`
- Test: `packages/api/src/acumen/profile.spec.ts`

**Interfaces:**
- Consumes: `BusinessType`, `isBusinessType` from `./types`.
- Produces:
  - `normalizeBusinessType(value: string | null | undefined): BusinessType | null`
  - `CompanyProfileData` / `PersonalProfileData` interfaces (explicit optional fields, values `string | string[]`)
  - `buildUserContextSummary(input: { company?: CompanyProfileData | null; personal?: PersonalProfileData | null }): string | undefined`

- [ ] **Step 1: Write the failing test**

```ts
import { normalizeBusinessType, buildUserContextSummary } from './profile';

describe('normalizeBusinessType', () => {
  it('maps the two pluralized values correctly', () => {
    expect(normalizeBusinessType('recruitment_agency')).toBe('recruitment-agencies');
    expect(normalizeBusinessType('rpo_provider')).toBe('rpo-providers');
  });
  it('maps the straightforward values', () => {
    expect(normalizeBusinessType('executive_search')).toBe('executive-search');
    expect(normalizeBusinessType('rec2rec')).toBe('rec2rec');
    expect(normalizeBusinessType('in_house_ta')).toBe('in-house-ta');
    expect(normalizeBusinessType('enterprise_talent')).toBe('enterprise-talent');
  });
  it('returns null for unknown/empty/nullish', () => {
    expect(normalizeBusinessType('something_else')).toBeNull();
    expect(normalizeBusinessType('')).toBeNull();
    expect(normalizeBusinessType(null)).toBeNull();
    expect(normalizeBusinessType(undefined)).toBeNull();
  });
});

describe('buildUserContextSummary', () => {
  it('summarizes present company + personal fields, skipping absent ones', () => {
    const out = buildUserContextSummary({
      company: { industry: 'biotech', target_roles: ['CSO', 'VP R&D'], markets: 'EMEA' },
      personal: { role: 'Partner', desk: 'life sciences' },
    });
    expect(out).toContain('biotech');
    expect(out).toContain('CSO, VP R&D');
    expect(out).toContain('Partner');
  });
  it('returns undefined when there is nothing to summarize', () => {
    expect(buildUserContextSummary({})).toBeUndefined();
    expect(buildUserContextSummary({ company: null, personal: null })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/profile`
Expected: FAIL — cannot find module `./profile`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { BusinessType } from './types';

const BUSINESS_TYPE_MAP: Record<string, BusinessType> = {
  recruitment_agency: 'recruitment-agencies',
  executive_search: 'executive-search',
  rec2rec: 'rec2rec',
  rpo_provider: 'rpo-providers',
  in_house_ta: 'in-house-ta',
  enterprise_talent: 'enterprise-talent',
};

export const normalizeBusinessType = (value: string | null | undefined): BusinessType | null =>
  (value && BUSINESS_TYPE_MAP[value]) || null;

export interface CompanyProfileData {
  industry?: string | string[];
  recruits_for?: string | string[];
  target_roles?: string | string[];
  seniority?: string | string[];
  markets?: string | string[];
  hiring_volume?: string | string[];
}

export interface PersonalProfileData {
  desk?: string | string[];
  role?: string | string[];
  seniority_focus?: string | string[];
  geographies?: string | string[];
  workflow?: string | string[];
  copilot_goals?: string | string[];
}

const asText = (v: string | string[] | undefined): string | null => {
  if (Array.isArray(v)) {
    return v.length ? v.join(', ') : null;
  }
  return v && v.trim() ? v.trim() : null;
};

const line = (label: string, fields: Array<[string, string | string[] | undefined]>): string | null => {
  const parts = fields
    .map(([k, v]) => [k, asText(v)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? `${label} — ${parts.join('; ')}` : null;
};

export const buildUserContextSummary = (input: {
  company?: CompanyProfileData | null;
  personal?: PersonalProfileData | null;
}): string | undefined => {
  const c = input.company;
  const p = input.personal;
  const lines = [
    c &&
      line('Company', [
        ['industry', c.industry],
        ['recruits for', c.recruits_for],
        ['target roles', c.target_roles],
        ['seniority', c.seniority],
        ['markets', c.markets],
        ['hiring volume', c.hiring_volume],
      ]),
    p &&
      line('You', [
        ['role', p.role],
        ['desk', p.desk],
        ['seniority focus', p.seniority_focus],
        ['geographies', p.geographies],
        ['workflow', p.workflow],
        ['goals', p.copilot_goals],
      ]),
  ].filter((l): l is string => Boolean(l));
  return lines.length ? lines.join('\n') : undefined;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/profile`
Expected: PASS (5 tests).

- [ ] **Step 5: Export + commit**

Add to `packages/api/src/acumen/index.ts`:

```ts
export { normalizeBusinessType, buildUserContextSummary } from './profile';
export type { CompanyProfileData, PersonalProfileData } from './profile';
```

```bash
git add packages/api/src/acumen/profile.ts packages/api/src/acumen/profile.spec.ts packages/api/src/acumen/index.ts
git commit -m "feat(acumen): business-type normalizer + user-context summary helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Persist `business_type` first-class (Laravel)

**Files:** (in `/Users/eth0/Herd/360ai`, branch `feature/360ai-chat-auth`)
- Modify: `app/Services/Agent/OnboardingProfile.php` (add `'business_type'` to `COMPANY_FIELDS`)
- Modify: `app/Mcp/Tools/SaveOnboardingProfile.php` (mention `business_type` in the company schema description so the agent reliably includes it)
- Test: the existing `OnboardingProfile` test (or create `tests/Unit/OnboardingProfileTest.php`)

**Interfaces:**
- Produces: `company.profile.business_type` now survives `saveCompany()` and is returned by `getFor()` / `get_onboarding` at `company.profile.business_type`.

- [ ] **Step 1: Write the failing test**

Find any existing test for `OnboardingProfile`; if none, create `tests/Unit/OnboardingProfileTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Models\Client;
use App\Services\Agent\OnboardingProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OnboardingProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_save_company_persists_business_type(): void
    {
        $client = Client::factory()->create();
        $service = app(OnboardingProfile::class);

        $service->saveCompany($client, [
            'business_type' => 'recruitment_agency',
            'industry' => 'biotech',
            'not_whitelisted' => 'dropme',
        ]);

        $profile = $service->getFor($client->fresh()->users()->first() ?? $client->owner);
        $this->assertSame('recruitment_agency', $profile['company']['profile']['business_type']);
        $this->assertArrayNotHasKey('not_whitelisted', $profile['company']['profile']);
    }
}
```

> Adjust the factory/`getFor` user lookup to match the real app (the investigator found `getFor($user)` reads `$user->currentClient`). If `Client::factory()` or the owner relation differs, adapt the arrange step — the assertion (business_type survives, non-whitelisted dropped) is the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=test_save_company_persists_business_type`
Expected: FAIL — `business_type` is stripped by the whitelist (key absent).

- [ ] **Step 3: Make the change**

In `app/Services/Agent/OnboardingProfile.php`, add `'business_type'` to the `COMPANY_FIELDS` array (keep it first for clarity):

```php
    private const COMPANY_FIELDS = [
        'business_type',
        'industry', 'recruits_for', 'target_roles', 'seniority',
        'markets', 'hiring_volume', 'tooling', 'candidate_icp', 'employer_value_prop',
    ];
```

In `app/Mcp/Tools/SaveOnboardingProfile.php`, extend the company-scope schema `description` so the agent includes `business_type` (one of: `recruitment_agency`, `executive_search`, `rec2rec`, `rpo_provider`, `in_house_ta`, `enterprise_talent`) in the company `profile_json`.

- [ ] **Step 4: Run test + clear caches**

Run: `php artisan test --filter=test_save_company_persists_business_type`
Expected: PASS.
Then: `php artisan optimize:clear`

- [ ] **Step 5: Commit**

```bash
git add app/Services/Agent/OnboardingProfile.php app/Mcp/Tools/SaveOnboardingProfile.php tests/Unit/OnboardingProfileTest.php
git commit -m "feat(onboarding): persist business_type first-class on company profile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Async fetch wrapper + cache + await seam (chat)

**Files:**
- Rewrite: `api/server/controllers/agents/acumen.js`
- Modify: `api/server/controllers/agents/client.js` (await the now-async wrapper)

**Interfaces:**
- Consumes: `getOnboardingStatus` from `../../services/Onboarding`; `composeSystemPrompt`, `normalizeBusinessType`, `buildUserContextSummary` from `@librechat/api`.
- Produces: `async acumenContextPart(user, brief): Promise<string | null>` with a per-user TTL cache of the resolved `{ businessType, userContext }`.

- [ ] **Step 1: Rewrite the wrapper**

Replace the body of `api/server/controllers/agents/acumen.js`:

```js
const {
  composeSystemPrompt,
  normalizeBusinessType,
  buildUserContextSummary,
} = require('@librechat/api');
const { getOnboardingStatus } = require('../../services/Onboarding');

const PROFILE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map();

function readCache(userId) {
  const hit = profileCache.get(userId);
  if (!hit) {
    return null;
  }
  if (hit.expiresAt <= Date.now()) {
    profileCache.delete(userId);
    return null;
  }
  return hit.value;
}

async function resolveProfile(user) {
  const userId = user?.id ? String(user.id) : null;
  if (userId) {
    const cached = readCache(userId);
    if (cached) {
      return cached;
    }
  }
  const status = await getOnboardingStatus(user);
  const company = status?.company?.profile || null;
  const personal = status?.personal?.profile || null;
  const businessType = normalizeBusinessType(company?.business_type);
  const userContext = buildUserContextSummary({ company, personal });
  const value = { businessType, userContext };
  if (userId) {
    profileCache.set(userId, { value, expiresAt: Date.now() + PROFILE_TTL_MS });
  }
  return value;
}

/**
 * Build the composed Acumen system prompt for the primary 360ai agent.
 * Fetches the onboarding profile (source of truth) to resolve business type and
 * user context. Returns null (no-op) when the business type is unknown or any
 * lookup fails, so the live path is never broken.
 */
async function acumenContextPart(user, brief) {
  if (!user) {
    return null;
  }
  try {
    const { businessType, userContext } = await resolveProfile(user);
    if (!businessType) {
      return null;
    }
    const { prompt } = composeSystemPrompt({ businessType, userContext, brief });
    return prompt || null;
  } catch (err) {
    return null;
  }
}

module.exports = { acumenContextPart };
```

- [ ] **Step 2: Await the wrapper at the seam**

In `api/server/controllers/agents/client.js`, the acumen push lives inside the `await Promise.all(allAgents.map(({ agent, agentId }) => {...}))` block, behind the primary-agent gate. Make that `.map` callback `async` (it already returns a promise to `Promise.all`, so this is safe) and `await` the wrapper. Change the existing push from:

```js
const acumenPart = acumenContextPart(req.user, latestUserText);
if (acumenPart) { agentRunContextParts.push(acumenPart); }
```

to:

```js
const acumenPart = await acumenContextPart(this.options.req?.user, messages.at(-1)?.text);
if (acumenPart) { agentRunContextParts.push(acumenPart); }
```

> Use the same `req.user` reference the surrounding code already uses (the investigator found `this.options.req?.user`; if the existing onboarding push uses a local `req`/`oidcClaims`, match that). `messages.at(-1)?.text` is the current user message (verified: `messages = orderedMessages`, last element is the current user turn). Do NOT add new plumbing. Keep the onboarding push untouched.

- [ ] **Step 3: Build + verify**

Run: `cd packages/api && npm run build` — Expected: clean tsc (the new exports resolve).
Run: `cd packages/api && npx jest acumen` — Expected: all acumen suites green (profile included).
Reload backend: `touch api/server/index.js`.

**Manual verification (USER step — cannot be automated):** as an owner, complete/confirm company onboarding so `business_type` is saved; then in a chat turn, confirm via Mongo `messages` (or agent run context) that the composed Acumen prompt (Foundations + profile + lens when a use case routes) now appears in the system tail. As a member of the same client, confirm the company `business_type` is inherited. Confirm a user with no company `business_type` still gets the normal agent (wrapper returns null).

- [ ] **Step 4: Commit**

```bash
git add api/server/controllers/agents/acumen.js api/server/controllers/agents/client.js
git commit -m "feat(acumen): activate composer via onboarding-profile fetch (async wrapper + TTL cache)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Coverage:** Laravel first-class storage → Task 2. Value→id map (explicit, pluralization-safe) → Task 1. User-context summary → Task 1. Async fetch + cache + compose → Task 3. Await seam → Task 3. ✅

**Cache:** the Task 3 cache is READ-through with TTL expiry and per-user keying (bounded by active users; expired entries evicted on access) — deliberately unlike the write-only cache removed from the composer. It caches the resolved `{businessType, userContext}`, not the prompt.

**Live-path safety:** wrapper still returns `null` on unknown business type or any fetch error (try/catch) — so users without a saved company `business_type` are unaffected; only fully-onboarded users light up.

**Type consistency:** `normalizeBusinessType`/`buildUserContextSummary` signatures identical between Task 1 (definition) and Task 3 (consumption via `@librechat/api`). `composeSystemPrompt({ businessType, userContext, brief })` matches the existing composer signature.
