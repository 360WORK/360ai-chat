# Onboarding Chat UI — Numbered Cards, Soft-Gate, Workspace Profile Tab (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The visible onboarding UI: a reusable numbered-card list (the `01…06` reference style), a landing soft-gate that shows a "Finish setup" nudge while onboarding is incomplete and tailored numbered prompt cards once complete, and a "Workspace profile" Settings tab to view/edit the profile.

**Architecture:** A presentational `NumberedCardList` component shared by both surfaces. An `OnboardingStarters` container reads `useOnboardingStatusQuery` (Plan 2b) and decides what to render in the empty-chat landing slot (currently `ConversationStarters`, mounted at `ChatView.tsx:122` behind `isLandingPage`): the nudge when incomplete, tailored cards when complete (send-on-click via `useSubmitMessage`), or the existing generic `ConversationStarters` as fallback. A `WorkspaceProfile` Settings tab reads the same status and writes via `useUpdateOnboardingProfileMutation`.

**Tech Stack:** React + TypeScript (`client/`), Tailwind (existing design tokens: `border-border-light`, `surface-secondary`, `text-text-primary/secondary`), React Query hooks from Plan 2b, `useLocalize`.

**Repo:** `/Users/eth0/Herd/chat.360ai` (`feat/360ai-result-cards`). Depends on Plan 2b hooks: `useOnboardingStatusQuery` (returns `{ onboarding: { is_owner, role, client, company:{completed,profile}, personal:{completed,profile}, tailored_prompts: string[] } }`) and `useUpdateOnboardingProfileMutation`.

## Global Constraints

- All user-facing text via `useLocalize()`; add only English keys to `client/src/locales/en/translation.json`, semantic prefix `com_onboarding_`.
- TypeScript only, never `any`; reuse `TOnboardingStatusResponse` / `TOnboardingClaims` from `librechat-data-provider`.
- Match the reference numbered-card visual: full-width rows in a single rounded bordered container with hairline row separators (`divide-y divide-border-light`), a muted zero-padded index (`01`, `02`, … via `String(n).padStart(2,'0')`, `tabular-nums`, `text-text-secondary`), left-aligned label in `text-text-primary`, comfortable padding (`px-5 py-4`), and a subtle `hover:bg-surface-secondary` when interactive.
- **Incomplete-onboarding rule** (mirror Plan 2a's `selectInterviewScope`): onboarding is incomplete for the current user when `(is_owner && !company.completed) || !personal.completed`.
- Tailored cards **replace** the generic `ConversationStarters` and **send the prompt immediately** on click (`submitMessage({ text })`).
- Accessibility: interactive rows are real `<button>`s with `aria-label`; the list has an appropriate `role`/`aria-label`. Cover loading, success, and error/empty states.
- Frontend tests in `__tests__` dirs using `test/layout-test-utils`; mock the data-provider hooks.

---

### Task 1: `NumberedCardList` presentational component

**Files:**
- Create: `client/src/components/Onboarding/NumberedCardList.tsx`
- Create: `client/src/components/Onboarding/index.ts` (barrel)
- Test: `client/src/components/Onboarding/__tests__/NumberedCardList.spec.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type NumberedCardItem = { id: string; label: string };
  export type NumberedCardListProps = {
    items: NumberedCardItem[];
    onSelect?: (item: NumberedCardItem, index: number) => void; // interactive when provided
    startIndex?: number; // default 1
    ariaLabel?: string;
  };
  ```
  Renders nothing (`null`) when `items` is empty. Rows are `<button>` when `onSelect` is provided, else static `<li>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from 'test/layout-test-utils';
import NumberedCardList from '../NumberedCardList';

const items = [
  { id: 'a', label: 'AI companies headquartered in Seattle' },
  { id: 'b', label: 'SaaS companies that raised Series A funding' },
];

describe('NumberedCardList', () => {
  it('renders zero-padded indices and labels', () => {
    render(<NumberedCardList items={items} />);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText(/Seattle/)).toBeInTheDocument();
  });
  it('fires onSelect with item + index when interactive', () => {
    const onSelect = jest.fn();
    render(<NumberedCardList items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/Series A/));
    expect(onSelect).toHaveBeenCalledWith(items[1], 1);
  });
  it('renders null for empty items', () => {
    const { container } = render(<NumberedCardList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd client && npx jest src/components/Onboarding/__tests__/NumberedCardList.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `client/src/components/Onboarding/NumberedCardList.tsx`

```tsx
import React from 'react';

export type NumberedCardItem = { id: string; label: string };
export type NumberedCardListProps = {
  items: NumberedCardItem[];
  onSelect?: (item: NumberedCardItem, index: number) => void;
  startIndex?: number;
  ariaLabel?: string;
};

const rowClass = 'flex w-full items-center gap-4 px-5 py-4 text-left';
const indexClass = 'w-6 shrink-0 text-xs tabular-nums text-text-secondary';
const labelClass = 'text-balance text-base text-text-primary';

function NumberedCardList({ items, onSelect, startIndex = 1, ariaLabel }: NumberedCardListProps) {
  if (!items.length) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <ul
      aria-label={ariaLabel}
      className="w-full divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light"
    >
      {items.map((item, i) => {
        const idx = pad(startIndex + i);
        if (onSelect) {
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-label={item.label}
                onClick={() => onSelect(item, i)}
                className={`${rowClass} cursor-pointer transition-colors hover:bg-surface-secondary`}
              >
                <span className={indexClass}>{idx}</span>
                <span className={labelClass}>{item.label}</span>
              </button>
            </li>
          );
        }
        return (
          <li key={item.id} className={rowClass}>
            <span className={indexClass}>{idx}</span>
            <span className={labelClass}>{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default React.memo(NumberedCardList);
```

- [ ] **Step 4: Barrel export** — `client/src/components/Onboarding/index.ts`:

```ts
export { default as NumberedCardList } from './NumberedCardList';
export type { NumberedCardItem, NumberedCardListProps } from './NumberedCardList';
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd client && npx jest src/components/Onboarding/__tests__/NumberedCardList.spec.tsx`
Expected: PASS (3 passing).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Onboarding/NumberedCardList.tsx client/src/components/Onboarding/index.ts client/src/components/Onboarding/__tests__/NumberedCardList.spec.tsx
git commit -m "feat(onboarding): reusable NumberedCardList component"
```

---

### Task 2: `OnboardingStarters` — landing soft-gate + tailored cards

**Files:**
- Create: `client/src/components/Onboarding/OnboardingStarters.tsx`
- Modify: `client/src/components/Onboarding/index.ts` (export it)
- Modify: `client/src/components/Chat/ChatView.tsx` (~line 122: swap `{isLandingPage && <ConversationStarters />}`)
- Add localization keys: `client/src/locales/en/translation.json`
- Test: `client/src/components/Onboarding/__tests__/OnboardingStarters.spec.tsx`

**Interfaces:**
- Consumes: `useOnboardingStatusQuery` (Plan 2b), `useSubmitMessage` (`client/src/hooks/Messages/useSubmitMessage.ts` → `{ submitMessage }`, call `submitMessage({ text })`), `NumberedCardList` (Task 1), `ConversationStarters` (existing, used as fallback).
- Produces: `OnboardingStarters` (no props). Logic:
  - While the query is loading or errors → render `<ConversationStarters />` (never block the landing on onboarding).
  - If incomplete (`(is_owner && !company.completed) || !personal.completed`) → render the **nudge**: a short heading + a single `NumberedCardList`-styled "Start setup" affordance whose click sends a kickoff prompt (company scope → "Let's set up my company profile"; else → "Let's set up my profile") via `submitMessage`.
  - Else if `tailored_prompts.length` → render `NumberedCardList` of the tailored prompts; click → `submitMessage({ text: prompt })`.
  - Else → `<ConversationStarters />` (fallback).

- [ ] **Step 1: Add localization keys** to `client/src/locales/en/translation.json` (alphabetical position with other `com_onboarding_` keys if any):

```json
"com_onboarding_nudge_title": "Let's set up your workspace",
"com_onboarding_nudge_company": "Tell 360AI about your company so it can tailor sourcing to you.",
"com_onboarding_nudge_personal": "Tell 360AI about your desk so it can tailor results to you.",
"com_onboarding_start": "Start setup",
"com_onboarding_suggestions_label": "Suggested for you"
```

- [ ] **Step 2: Write the failing test** (mock the hooks)

```tsx
import { render, screen, fireEvent } from 'test/layout-test-utils';
import OnboardingStarters from '../OnboardingStarters';

const mockSubmit = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmit }),
  useSubmitMessage: () => ({ submitMessage: mockSubmit }),
}));
const mockUseStatus = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useOnboardingStatusQuery: (...a: unknown[]) => mockUseStatus(...a),
}));
// Stub ConversationStarters to a sentinel so we can assert the fallback path.
jest.mock('~/components/Chat/Input/ConversationStarters', () => () => <div>generic-starters</div>);

beforeEach(() => { mockSubmit.mockClear(); });

it('shows the nudge when personal onboarding is incomplete', () => {
  mockUseStatus.mockReturnValue({ data: { onboarding: { is_owner: false, company: { completed: true }, personal: { completed: false }, tailored_prompts: [] } }, isLoading: false, isError: false });
  render(<OnboardingStarters />);
  expect(screen.getByText(/set up your workspace/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Start setup/i));
  expect(mockSubmit).toHaveBeenCalledWith({ text: expect.stringMatching(/set up my profile/i) });
});

it('shows tailored cards when complete and sends on click', () => {
  mockUseStatus.mockReturnValue({ data: { onboarding: { is_owner: false, company: { completed: true }, personal: { completed: true }, tailored_prompts: ['Source ML engineers in Berlin'] } }, isLoading: false, isError: false });
  render(<OnboardingStarters />);
  fireEvent.click(screen.getByText(/Source ML engineers/));
  expect(mockSubmit).toHaveBeenCalledWith({ text: 'Source ML engineers in Berlin' });
});

it('falls back to generic starters while loading', () => {
  mockUseStatus.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  render(<OnboardingStarters />);
  expect(screen.getByText('generic-starters')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run it, verify it fails** — `cd client && npx jest src/components/Onboarding/__tests__/OnboardingStarters.spec.tsx` → FAIL (module missing).

- [ ] **Step 4: Implement** `client/src/components/Onboarding/OnboardingStarters.tsx`

```tsx
import React, { useCallback, useMemo } from 'react';
import { useOnboardingStatusQuery } from '~/data-provider';
import { useSubmitMessage, useLocalize } from '~/hooks';
import ConversationStarters from '~/components/Chat/Input/ConversationStarters';
import NumberedCardList from './NumberedCardList';
import type { NumberedCardItem } from './NumberedCardList';

function OnboardingStarters() {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  const { data, isLoading, isError } = useOnboardingStatusQuery();

  const send = useCallback((text: string) => submitMessage({ text }), [submitMessage]);

  const onboarding = data?.onboarding;
  const incomplete = useMemo(() => {
    if (!onboarding) {
      return false;
    }
    return (onboarding.is_owner && !onboarding.company.completed) || !onboarding.personal.completed;
  }, [onboarding]);

  if (isLoading || isError || !onboarding) {
    return <ConversationStarters />;
  }

  if (incomplete) {
    const isCompanyScope = onboarding.is_owner && !onboarding.company.completed;
    const description = isCompanyScope
      ? localize('com_onboarding_nudge_company')
      : localize('com_onboarding_nudge_personal');
    const kickoff = isCompanyScope ? "Let's set up my company profile" : "Let's set up my profile";
    const items: NumberedCardItem[] = [{ id: 'start', label: localize('com_onboarding_start') }];
    return (
      <div className="mb-8 mt-2 flex w-full max-w-2xl flex-col gap-3 px-4">
        <div className="text-center">
          <div className="text-base font-medium text-text-primary">{localize('com_onboarding_nudge_title')}</div>
          <div className="mt-1 text-sm text-text-secondary">{description}</div>
        </div>
        <NumberedCardList items={items} onSelect={() => send(kickoff)} ariaLabel={localize('com_onboarding_nudge_title')} />
      </div>
    );
  }

  const prompts = onboarding.tailored_prompts ?? [];
  if (!prompts.length) {
    return <ConversationStarters />;
  }

  const items: NumberedCardItem[] = prompts.map((label, i) => ({ id: `tp-${i}`, label }));
  return (
    <div className="mb-8 mt-2 flex w-full max-w-2xl flex-col gap-2 px-4">
      <NumberedCardList
        items={items}
        onSelect={(item) => send(item.label)}
        ariaLabel={localize('com_onboarding_suggestions_label')}
      />
    </div>
  );
}

export default React.memo(OnboardingStarters);
```

- [ ] **Step 5: Wire into ChatView** — in `client/src/components/Chat/ChatView.tsx` (~line 122), replace `{isLandingPage && <ConversationStarters />}` with `{isLandingPage && <OnboardingStarters />}` and add the import (`import OnboardingStarters from '~/components/Onboarding/OnboardingStarters';`). Confirm the exact line by reading it first. Export `OnboardingStarters` from the Onboarding barrel.

- [ ] **Step 6: Run the tests, verify they pass** — `cd client && npx jest src/components/Onboarding/__tests__/OnboardingStarters.spec.tsx`. Adjust mock import paths to match the project's actual hook export style (read `client/src/hooks/Messages/useSubmitMessage.ts` and `client/src/data-provider/index.ts` to confirm whether `useSubmitMessage` is a default or named export, and that `useOnboardingStatusQuery` is exported from `~/data-provider`).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Onboarding/OnboardingStarters.tsx client/src/components/Onboarding/index.ts client/src/components/Chat/ChatView.tsx client/src/locales/en/translation.json client/src/components/Onboarding/__tests__/OnboardingStarters.spec.tsx
git commit -m "feat(onboarding): landing soft-gate nudge + tailored prompt cards"
```

---

### Task 3: "Workspace profile" Settings tab

**Files:**
- Modify: `packages/data-provider/src/config.ts` (`SettingsTabValues` enum → add `WORKSPACE_PROFILE = 'workspace_profile'`); build data-provider.
- Create: `client/src/components/Nav/SettingsTabs/WorkspaceProfile/WorkspaceProfile.tsx` + `index.ts`
- Modify: `client/src/components/Nav/SettingsTabs/index.ts` (export), `client/src/components/Nav/Settings.tsx` (add tab entry + `<Tabs.Content>`)
- Add localization keys: `client/src/locales/en/translation.json`
- Test: `client/src/components/Nav/SettingsTabs/WorkspaceProfile/__tests__/WorkspaceProfile.spec.tsx`

**Interfaces:**
- Consumes: `useOnboardingStatusQuery`, `useUpdateOnboardingProfileMutation` (Plan 2b), `SettingsTabValues.WORKSPACE_PROFILE`, `useLocalize`.
- Produces: a tab component that lists the profile as editable fields. Owners see the **company** section (fields: industry, recruits_for, target_roles, seniority, markets, hiring_volume, tooling, candidate_icp, employer_value_prop) AND the **personal** section (desk, role, seniority_focus, geographies, workflow, copilot_goals); members see only the personal section. Save calls `useUpdateOnboardingProfileMutation` with `{ scope, profile }` per section. Render loading + error + empty states.

- [ ] **Step 1: Add the enum value** — in `packages/data-provider/src/config.ts` `SettingsTabValues`, add `WORKSPACE_PROFILE = 'workspace_profile',`. Run `npm run build:data-provider`.

- [ ] **Step 2: Add localization keys** to `client/src/locales/en/translation.json`:

```json
"com_onboarding_tab_label": "Workspace profile",
"com_onboarding_company_section": "Company",
"com_onboarding_personal_section": "Your desk",
"com_onboarding_save": "Save",
"com_onboarding_saved": "Saved",
"com_onboarding_empty": "No profile yet — chat with 360AI to set it up."
```

- [ ] **Step 3: Write the failing test** (mock hooks) — assert: member sees only the personal section; owner sees both; editing a field + clicking Save calls the mutation with `{ scope, profile }` containing the edited value. Render loading + empty states.

```tsx
import { render, screen, fireEvent } from 'test/layout-test-utils';
import WorkspaceProfile from '../WorkspaceProfile';

const mockMutate = jest.fn();
const mockUseStatus = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useOnboardingStatusQuery: () => mockUseStatus(),
  useUpdateOnboardingProfileMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

it('member sees only the personal section and can save', () => {
  mockUseStatus.mockReturnValue({ data: { onboarding: { is_owner: false, company: { completed: true, profile: {} }, personal: { completed: true, profile: { desk: 'AI startups' } }, tailored_prompts: [] } }, isLoading: false, isError: false });
  render(<WorkspaceProfile />);
  expect(screen.queryByText(/Company/)).not.toBeInTheDocument();
  const desk = screen.getByDisplayValue('AI startups');
  fireEvent.change(desk, { target: { value: 'AI scaleups' } });
  fireEvent.click(screen.getAllByText(/Save/)[0]);
  expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ scope: 'personal', profile: expect.objectContaining({ desk: 'AI scaleups' }) }));
});
```

- [ ] **Step 4: Run it, verify it fails.**

- [ ] **Step 5: Implement** `WorkspaceProfile.tsx`. Read `client/src/components/Nav/SettingsTabs/General/General.tsx` first to mirror the tab layout/wrapper classes. Build a small field-list editor per section from the known field keys (company keys / personal keys as constants), seeded from `onboarding.company.profile` / `onboarding.personal.profile`, with a Save button per section calling the mutation `{ scope, profile }`. Use `useLocalize` for all labels; keep fields as simple text inputs/textareas (arrays-of-strings fields edited as comma-separated text → split on save). Render the empty state when both profiles are null.

- [ ] **Step 6: Register the tab** — in `client/src/components/Nav/SettingsTabs/index.ts` export `WorkspaceProfile`; in `client/src/components/Nav/Settings.tsx` add a `settingsTabs` entry `{ value: SettingsTabValues.WORKSPACE_PROFILE, icon: <…/>, label: 'com_onboarding_tab_label' }` and a matching `<Tabs.Content value={SettingsTabValues.WORKSPACE_PROFILE} tabIndex={-1}><WorkspaceProfile /></Tabs.Content>`. Read Settings.tsx first to match the exact array + content-block style and pick an existing icon.

- [ ] **Step 7: Run tests, verify pass.**

- [ ] **Step 8: Commit**

```bash
git add packages/data-provider/src/config.ts client/src/components/Nav/SettingsTabs/WorkspaceProfile/ client/src/components/Nav/SettingsTabs/index.ts client/src/components/Nav/Settings.tsx client/src/locales/en/translation.json
git commit -m "feat(onboarding): Workspace profile settings tab"
```

---

## Self-Review

**Spec coverage (Plan 3 slice):**
- Reusable numbered-card UI (the `01…06` reference) → Task 1 ✓
- Landing soft-gate nudge while incomplete (owner vs member wording) → Task 2 ✓
- Tailored numbered prompt cards replacing generic starters, send-on-click → Task 2 ✓
- Editable Workspace-profile Settings tab (owner: company+personal; member: personal) → Task 3 ✓

**Placeholder scan:** Steps that edit `ChatView.tsx`, `Settings.tsx`, `SettingsTabs/index.ts`, and the localization file include "read first to confirm exact insertion / export style" — confirmations against real code, not TBDs. Pure component code is complete.

**Type/name consistency:** `NumberedCardItem`/`NumberedCardListProps` defined in Task 1 and consumed in Tasks 2-3; `useOnboardingStatusQuery`/`useUpdateOnboardingProfileMutation` and the `onboarding` payload shape match Plan 2b's `TOnboardingStatusResponse`; the incomplete rule mirrors Plan 2a's `selectInterviewScope`; `SettingsTabValues.WORKSPACE_PROFILE` defined once and reused.

## Feature complete
With Plans 1, 2a, 2b, 3 the onboarding feature is end-to-end: provider storage + claims + MCP tools → chat claims plumbing + conversational interview → live status/profile read-write → numbered-card UI, soft-gate, and editable profile tab.
