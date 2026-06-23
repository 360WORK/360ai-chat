# AI Acumen — Workspaces UI Implementation Plan (sub-project #3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the AI Acumen workspaces (the use-cases available to the user's business type) as clickable cards on the chat landing page; a click kicks off that use-case so the composer assembles the matching core+lens.

**Architecture:** A thin backend endpoint `GET /api/acumen/workspaces` reuses the wrapper's `resolveProfile` + the grid's `workspacesFor` and returns `{ businessType, workspaces: [{ useCaseId, label, kickoff }] }`. The frontend fetches it via a React Query hook and renders cards in the landing slot (when onboarding is complete and workspaces exist), each card sending its `kickoff` text via the existing `submitMessage`. The kickoff strings are crafted to match the backend router's keyword regexes, so the existing composer path resolves the right core+lens with zero new request-pipeline plumbing.

**Tech Stack:** TypeScript (`packages/api`, `packages/data-provider`, `client`), Express (`/api` JS route), React Query, Jest.

## Global Constraints

- New backend logic is **TypeScript in `packages/api/src/acumen`**; the `/api` route is a thin JS handler. Shared FE/BE types + the query hook go in `packages/data-provider`. No `any`; avoid `unknown`/`Record<string,unknown>`.
- Frontend: all user-facing strings via `useLocalize()`; only add English keys in `client/src/locales/en/translation.json`.
- Tests: `cd packages/api && npx jest acumen`; frontend `__tests__` with `test/layout-test-utils`.
- Commits stage **explicit paths only** (branch `feat/360ai-result-cards` carries unrelated WIP). Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Kickoff strings are load-bearing** — each must match the router KEYWORDS in `packages/api/src/acumen/router.ts` for its use-case, and must not match an earlier-in-ORDER use-case. Exact strings are pinned in Task 1.
- Out of scope (separate follow-on #3b): the mid-point confirmation component (marker protocol + client dock). This plan ships the workspaces grid only.

---

### Task 1: Backend — workspace metadata + endpoint

**Files:**
- Create: `packages/api/src/acumen/workspaces.ts`
- Test: `packages/api/src/acumen/workspaces.spec.ts`
- Modify: `packages/api/src/acumen/index.ts` (export)
- Create: `api/server/routes/acumen.js` (thin route)
- Modify: `api/server/routes/index.js` (mount) — or the existing route-registration file
- Modify: `api/server/controllers/agents/acumen.js` (export `resolveProfile` for reuse)

**Interfaces:**
- Consumes: `BusinessType`, `UseCaseId` from `./types`; `workspacesFor` from `./grid`.
- Produces: `interface WorkspaceMeta { useCaseId: UseCaseId; label: string; kickoff: string }`; `workspacesMetaFor(businessType: BusinessType): WorkspaceMeta[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { workspacesMetaFor } from './workspaces';
import { selectUseCase } from './router';

describe('workspacesMetaFor', () => {
  it('returns the executive-search workspaces with labels + kickoffs', () => {
    const ws = workspacesMetaFor('executive-search');
    const ids = ws.map((w) => w.useCaseId).sort();
    expect(ids).toEqual(['market-mapping', 'prospecting', 'signal-tracking', 'talent-mapping'].sort());
    for (const w of ws) {
      expect(w.label.length).toBeGreaterThan(0);
      expect(w.kickoff.length).toBeGreaterThan(0);
    }
  });

  it('every kickoff string routes back to its own use-case (grid-constrained)', () => {
    // the kickoff is what the card sends; the router must resolve it to the same use-case
    const ws = workspacesMetaFor('executive-search');
    for (const w of ws) {
      expect(selectUseCase(w.kickoff, 'executive-search')?.useCaseId).toBe(w.useCaseId);
    }
  });

  it('returns [] for a business type with no workspaces is impossible — all six have cells; spot-check rec2rec', () => {
    expect(workspacesMetaFor('rec2rec').map((w) => w.useCaseId).sort()).toEqual(
      ['prospecting', 'talent-mapping'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && npx jest acumen/workspaces`
Expected: FAIL — cannot find module `./workspaces`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';

export interface WorkspaceMeta {
  useCaseId: UseCaseId;
  label: string;
  kickoff: string;
}

// Kickoff strings are crafted to match router.ts KEYWORDS for their use-case
// and to not match an earlier-in-ORDER use-case.
const META: Record<UseCaseId, { label: string; kickoff: string }> = {
  'talent-mapping': {
    label: 'Talent Mapping',
    kickoff: "Help me map the talent for a role I'm working on.",
  },
  'market-mapping': {
    label: 'Market Mapping',
    kickoff: 'Map the market for a sector I want to understand.',
  },
  'skill-mapping': {
    label: 'Skill Mapping',
    kickoff: 'Map the skills landscape for a capability I care about.',
  },
  'workforce-planning': {
    label: 'Workforce Planning',
    kickoff: 'Help me build a workforce plan.',
  },
  prospecting: {
    label: 'Prospecting',
    kickoff: 'Build me a prospect list of companies to pitch.',
  },
  'signal-tracking': {
    label: 'Signal Tracking',
    kickoff: 'Set up a watch to track moves in my market.',
  },
  'recruitment-research': {
    label: 'Recruitment Research',
    kickoff: 'I have a research question about my market.',
  },
};

export const workspacesMetaFor = (businessType: BusinessType): WorkspaceMeta[] =>
  workspacesFor(businessType).map((useCaseId) => ({
    useCaseId,
    label: META[useCaseId].label,
    kickoff: META[useCaseId].kickoff,
  }));
```

> If the `every kickoff routes back` test fails for a use-case, adjust that kickoff string until `selectUseCase(kickoff, businessType)` returns the intended id — do NOT change `router.ts`. The router's ORDER puts signal-tracking first, so the signal-tracking kickoff is safe; verify market/skill/talent kickoffs don't collide.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && npx jest acumen/workspaces`
Expected: PASS (3 tests).

- [ ] **Step 5: Export, route, commit**

Add to `packages/api/src/acumen/index.ts`:

```ts
export { workspacesMetaFor } from './workspaces';
export type { WorkspaceMeta } from './workspaces';
```

In `api/server/controllers/agents/acumen.js`, export the existing `resolveProfile` so the route can reuse the cached profile resolution:

```js
module.exports = { acumenContextPart, resolveProfile };
```

Create `api/server/routes/acumen.js`:

```js
const express = require('express');
const { workspacesMetaFor } = require('@librechat/api');
const { resolveProfile } = require('../controllers/agents/acumen');
const { requireJwtAuth } = require('../middleware');

const router = express.Router();

router.get('/workspaces', requireJwtAuth, async (req, res) => {
  try {
    const { businessType } = await resolveProfile(req.user);
    if (!businessType) {
      return res.json({ businessType: null, workspaces: [] });
    }
    return res.json({ businessType, workspaces: workspacesMetaFor(businessType) });
  } catch (err) {
    return res.json({ businessType: null, workspaces: [] });
  }
});

module.exports = router;
```

> Match the repo's actual auth middleware import (find how other authed routes import `requireJwtAuth` — e.g. `api/server/routes/onboarding.js` or wherever the onboarding status route lives) and mirror it. Mount the router where the onboarding routes are mounted (find `/api/onboarding` registration in `api/server/routes/index.js` and add `/api/acumen` the same way).

```bash
git add packages/api/src/acumen/workspaces.ts packages/api/src/acumen/workspaces.spec.ts packages/api/src/acumen/index.ts api/server/controllers/agents/acumen.js api/server/routes/acumen.js api/server/routes/index.js
git commit -m "feat(acumen): workspaces metadata + GET /api/acumen/workspaces endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: data-provider — types + query hook

**Files:**
- Modify: `packages/data-provider/src/api-endpoints.ts` (add `acumenWorkspaces`)
- Modify: `packages/data-provider/src/data-service.ts` (add `getAcumenWorkspaces`)
- Modify: `packages/data-provider/src/types/queries.ts` (add response types)
- Modify: `packages/data-provider/src/keys.ts` (add a QueryKey)
- Create: `client/src/data-provider/Acumen/queries.ts` + `Acumen/index.ts`
- Modify: `client/src/data-provider/index.ts` (re-export)

**Interfaces:**
- Produces: `TAcumenWorkspace { useCaseId: string; label: string; kickoff: string }`; `TAcumenWorkspacesResponse { businessType: string | null; workspaces: TAcumenWorkspace[] }`; hook `useAcumenWorkspacesQuery()`.

- [ ] **Step 1: Add the endpoint + service + types**

In `api-endpoints.ts`:

```ts
export const acumenWorkspaces = () => '/api/acumen/workspaces';
```

In `types/queries.ts`:

```ts
export interface TAcumenWorkspace {
  useCaseId: string;
  label: string;
  kickoff: string;
}

export interface TAcumenWorkspacesResponse {
  businessType: string | null;
  workspaces: TAcumenWorkspace[];
}
```

In `data-service.ts`:

```ts
export const getAcumenWorkspaces = (): Promise<q.TAcumenWorkspacesResponse> =>
  request.get(endpoints.acumenWorkspaces());
```

In `keys.ts`, add to the `QueryKeys` enum: `acumenWorkspaces = 'acumenWorkspaces'`.

- [ ] **Step 2: Build data-provider**

Run: `npm run build:data-provider` (from repo root)
Expected: clean build, new exports available.

- [ ] **Step 3: Write the client hook**

`client/src/data-provider/Acumen/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TAcumenWorkspacesResponse } from 'librechat-data-provider';

export const useAcumenWorkspacesQuery = (): UseQueryResult<TAcumenWorkspacesResponse> =>
  useQuery<TAcumenWorkspacesResponse>(
    [QueryKeys.acumenWorkspaces],
    () => dataService.getAcumenWorkspaces(),
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );
```

`client/src/data-provider/Acumen/index.ts`: `export * from './queries';`
Add to `client/src/data-provider/index.ts`: `export * from './Acumen';`

> Match the EXACT query-hook style used by `client/src/data-provider/Onboarding/queries.ts` (v4 vs v5 react-query signature — positional args vs options object). Mirror it precisely.

- [ ] **Step 4: Verify build**

Run: `cd client && npx tsc --noEmit` (or the project's typecheck) — Expected: no new errors from these files.

- [ ] **Step 5: Commit**

```bash
git add packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/types/queries.ts packages/data-provider/src/keys.ts client/src/data-provider/Acumen client/src/data-provider/index.ts
git commit -m "feat(acumen): data-provider workspaces query hook + types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Frontend — Workspaces grid in the landing slot

**Files:**
- Create: `client/src/components/Acumen/AcumenWorkspaces.tsx`
- Create: `client/src/components/Acumen/index.ts`
- Test: `client/src/components/Acumen/__tests__/AcumenWorkspaces.spec.tsx`
- Modify: `client/src/components/Chat/ChatView.tsx` (render in the landing slot)
- Modify: `client/src/locales/en/translation.json` (header copy key)

**Interfaces:**
- Consumes: `useAcumenWorkspacesQuery`; `useSubmitMessage` (default export from `~/hooks/Messages/useSubmitMessage`).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from 'test/layout-test-utils';
import { fireEvent } from '@testing-library/react';
import AcumenWorkspaces from '../AcumenWorkspaces';

const submitMessage = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage }),
}));
jest.mock('~/data-provider', () => ({
  useAcumenWorkspacesQuery: () => ({
    data: {
      businessType: 'executive-search',
      workspaces: [
        { useCaseId: 'talent-mapping', label: 'Talent Mapping', kickoff: 'Map the talent' },
        { useCaseId: 'prospecting', label: 'Prospecting', kickoff: 'Build a prospect list' },
      ],
    },
    isLoading: false,
  }),
}));

describe('AcumenWorkspaces', () => {
  beforeEach(() => submitMessage.mockClear());

  it('renders a card per workspace', () => {
    render(<AcumenWorkspaces />);
    expect(screen.getByText('Talent Mapping')).toBeInTheDocument();
    expect(screen.getByText('Prospecting')).toBeInTheDocument();
  });

  it('sends the kickoff text on click', () => {
    render(<AcumenWorkspaces />);
    fireEvent.click(screen.getByText('Talent Mapping'));
    expect(submitMessage).toHaveBeenCalledWith({ text: 'Map the talent' });
  });

  it('renders nothing when there are no workspaces', () => {
    jest.resetModules();
    const { container } = render(<AcumenWorkspaces workspacesOverride={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx jest AcumenWorkspaces`
Expected: FAIL — cannot find module `../AcumenWorkspaces`.

- [ ] **Step 3: Write the component**

```tsx
import { useLocalize } from '~/hooks';
import { useAcumenWorkspacesQuery } from '~/data-provider';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import type { TAcumenWorkspace } from 'librechat-data-provider';

interface AcumenWorkspacesProps {
  workspacesOverride?: TAcumenWorkspace[];
}

export default function AcumenWorkspaces({ workspacesOverride }: AcumenWorkspacesProps) {
  const localize = useLocalize();
  const { data } = useAcumenWorkspacesQuery();
  const { submitMessage } = useSubmitMessage();
  const workspaces = workspacesOverride ?? data?.workspaces ?? [];

  if (!workspaces.length) {
    return null;
  }

  return (
    <div className="mx-auto mb-4 flex w-full max-w-3xl flex-col gap-3">
      <p className="text-sm font-medium text-text-secondary">
        {localize('com_acumen_workspaces_header')}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {workspaces.map((w) => (
          <button
            key={w.useCaseId}
            type="button"
            aria-label={w.label}
            onClick={() => submitMessage({ text: w.kickoff })}
            className="rounded-xl border border-border-light bg-surface-secondary p-3 text-left text-sm font-medium text-text-primary transition hover:border-border-medium hover:bg-surface-tertiary"
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Add to `client/src/locales/en/translation.json`:

```json
"com_acumen_workspaces_header": "Pick a workspace to get started",
```

`client/src/components/Acumen/index.ts`: `export { default as AcumenWorkspaces } from './AcumenWorkspaces';`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx jest AcumenWorkspaces`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the landing slot**

In `client/src/components/Chat/ChatView.tsx`, render `<AcumenWorkspaces />` in the landing slot (the gate-inactive branch where `OnboardingStarters` renders, around L118-122 per investigation). Place it ABOVE the existing starters so workspaces lead; the component self-hides (`return null`) when there are no workspaces, so non-onboarded users see the existing starters unchanged. Import from `~/components/Acumen`.

> Do NOT remove `OnboardingStarters`/`ConversationStarters`. AcumenWorkspaces renders alongside and hides itself when empty — additive, no regression for users without a business type.

- [ ] **Step 6: Verify + commit**

Run: `cd client && npx jest AcumenWorkspaces` — PASS.
Manual (USER): as an onboarded Executive Search user, confirm the four workspace cards appear on the landing page and clicking one sends the kickoff + the agent responds in that use-case's framing.

```bash
git add client/src/components/Acumen client/src/components/Chat/ChatView.tsx client/src/locales/en/translation.json
git commit -m "feat(acumen): workspaces grid on landing page (kickoff-on-click)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Coverage:** backend metadata+endpoint → Task 1; shared types+hook → Task 2; landing UI → Task 3. Selection uses the kickoff-message MVP (router-matched strings, verified by Task 1's `every kickoff routes back` test) — no new request-pipeline plumbing; explicit `useCaseId` threading is the documented future upgrade.

**Live-path safety:** the endpoint and component both no-op (empty workspaces / `return null`) for users without a business type, so non-onboarded users see the unchanged landing experience.

**Type consistency:** `WorkspaceMeta` (backend) ↔ `TAcumenWorkspace` (data-provider) field names match (`useCaseId`/`label`/`kickoff`). `workspacesMetaFor` signature consistent between Task 1 (definition) and the route (consumption).

**Deferred:** mid-point confirmation component (#3b) — its own plan; reuses the onboarding marker/pill stack (`<!--acumen-confirm-->` + a confirm dock).
