# 360AI Agent Surface Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the 360AI recruiter agents in the chat UI — render the new `enrich_contact` and `send_outreach` MCP results as cards, refactor the card dispatcher into an extensible registry, and define the 6 named agents as `modelSpecs` entries.

**Architecture:** All work is in `chat.360ai` (the LibreChat fork). The agents are NOT seeded Mongo records — the fork delivers agents as `modelSpecs.list` entries in `librechat.yaml`, each an ephemeral agent with a `preset` (endpoint/model/web_search/promptPrefix) and `mcpServers: ['360ai']`. MCP tools cannot be subset per spec (the server is activated whole), so per-agent focus is expressed in each agent's `promptPrefix`. The frontend renders MCP tool JSON via a tool-name→card registry in `client/src/components/Chat/Messages/Content/AI360/`.

**Tech Stack:** TypeScript/React, Jest + Testing Library, Tailwind. The AI360 module already has shared atoms (`Bits.tsx`), a tolerant parser (`parse.ts`), typed results (`types.ts`), a dispatcher (`index.tsx`), and a tool-name map (`tools.ts`).

## Global Constraints

- All user-facing strings use `useLocalize()`; add English keys only to `client/src/locales/en/translation.json` with the `com_ui_360_` prefix (matches existing AI360 keys).
- New result kinds are added to the `Parsed360Result` union in `types.ts` and parsed in `parse.ts` with the existing tolerant style (`isRecord`, return `null` on shape mismatch — never throw).
- Cards reuse the shared atoms from `Bits.tsx` (`Pill`, `LinkButton`, `CopyButton`, `Avatar`, `SkillChips`, `ExpandableText`); do not reinvent them.
- Tests live in `client/src/components/Chat/Messages/Content/AI360/__tests__/`, mirror the existing card tests, and cover the parse-null (error/garbage) path plus a render path.
- Run frontend tests from the client workspace: `cd /Users/eth0/Herd/chat.360ai/client && npx jest <pattern>`.
- The `send_outreach` preview card is PRESENTATIONAL only — it displays the drafted message and the explicit confirmation the user must give; it does NOT auto-call the tool (interactive auto-send is an out-of-scope follow-up noted at the end).
- MCP result shapes (verified from Plan 1): `enrich_contact` → ContactOut JSON (tolerant: emails/phones/socials arrays). `send_outreach` preview → `{ status: 'preview', channel, recipient, subject, body, note }`; sent → `{ status: 'sent', channel, recipient, provider_response }`.

---

## File Structure

**Modify:**
- `AI360/tools.ts` — extend the tool-name map; add `enrich_contact`, `send_outreach`.
- `AI360/types.ts` — add `Contact`, `OutreachPreview` interfaces + two `Parsed360Result` union members.
- `AI360/parse.ts` — add `parseContact`, `parseOutreach`; wire into `parse360Output`.
- `AI360/index.tsx` — replace the if/else chain with a `kind`→render registry.
- `client/src/locales/en/translation.json` — new `com_ui_360_*` keys + 6 agent labels.
- `librechat.yaml` — add 5 new `modelSpecs.list` entries (the 6th is the existing `360ai` umbrella).

**Create:**
- `AI360/cards/ContactCard.tsx`
- `AI360/cards/OutreachPreviewCard.tsx`
- `AI360/__tests__/ContactCard.test.tsx`
- `AI360/__tests__/OutreachPreviewCard.test.tsx`
- `AI360/__tests__/registry.test.tsx` (dispatcher coverage)

All AI360 paths are under `client/src/components/Chat/Messages/Content/`.

---

## Task 1: Refactor the dispatcher into a registry

**Files:**
- Modify: `client/src/components/Chat/Messages/Content/AI360/index.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/registry.test.tsx`

**Interfaces:**
- Produces: `AI360ToolResult` renders by looking up `result.kind` in a `Record<Parsed360Result['kind'], (r, localize) => JSX.Element>` registry. Existing kinds (`companies`, `talents`, `jobs`, `job`) render byte-identically to today.

- [ ] **Step 1: Write the failing test**

Create `__tests__/registry.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import AI360ToolResult from '../index';
import type { Parsed360Result } from '../types';

jest.mock('~/hooks', () => ({ useLocalize: () => (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }));

test('registry renders every declared kind without falling through', () => {
  const samples: Parsed360Result[] = [
    { kind: 'companies', companies: [], count: 0 },
    { kind: 'talents', talents: [], count: 0 },
    { kind: 'jobs', jobs: [], count: 0, variant: 'search' },
    { kind: 'job', job: { id: 1, title: 'Eng', pipeline: [] } },
  ];
  for (const r of samples) {
    const { unmount } = render(<AI360ToolResult result={r} />);
    expect(document.body.textContent).not.toBe('');
    unmount();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest registry.test`
Expected: FAIL (or PASS only after Step 3 — if it already passes against the if/else, proceed; the registry refactor must keep it passing).

- [ ] **Step 3: Refactor `index.tsx` to a registry**

Replace the if/else body of `AI360ToolResult` with a lookup keyed by `result.kind`. Each entry is a function returning the same JSX the current branch returns. Keep all `localize` keys, `columns`, `getKey`, and `renderItem` calls identical to the current code. Example skeleton (preserve existing per-kind JSX verbatim):

```tsx
const RENDERERS: Record<Parsed360Result['kind'], (result: Parsed360Result, localize: ReturnType<typeof useLocalize>) => JSX.Element> = {
  companies: (r, localize) => /* existing companies JSX */,
  talents: (r, localize) => /* existing talents JSX */,
  jobs: (r, localize) => /* existing jobs JSX */,
  job: (r) => <JobDetailCard job={(r as Extract<Parsed360Result, { kind: 'job' }>).job} />,
};

export default function AI360ToolResult({ result }: { result: Parsed360Result }) {
  const localize = useLocalize();
  return RENDERERS[result.kind](result, localize);
}
```

Use `Extract<Parsed360Result, { kind: 'companies' }>` casts inside each renderer to narrow the union (the registry value type is the broad union).

- [ ] **Step 4: Run the new test AND the full existing AI360 suite**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest AI360`
Expected: PASS — `registry.test`, `index.test`, `CompanyCard`, `TalentCard`, `JobCard`, `ResultList` all green (no behavior change).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/index.tsx client/src/components/Chat/Messages/Content/AI360/__tests__/registry.test.tsx
git commit -m "refactor(360ai): dispatcher to kind->renderer registry"
```

---

## Task 2: `enrich_contact` → ContactCard

**Files:**
- Modify: `AI360/tools.ts`, `AI360/types.ts`, `AI360/parse.ts`, `AI360/index.tsx`
- Create: `AI360/cards/ContactCard.tsx`, `AI360/__tests__/ContactCard.test.tsx`

**Interfaces:**
- Consumes: tolerant ContactOut JSON.
- Produces: `Contact` interface; `Parsed360Result` gains `{ kind: 'contact'; contact: Contact }`; `tools.ts` maps `enrich_contact: 'contact'`; registry renders `<ContactCard contact={...} />`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/ContactCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import ContactCard from '../cards/ContactCard';

jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));

test('renders verified emails and phones', () => {
  render(<ContactCard contact={{ full_name: 'Jane Doe', work_emails: ['jane@acme.com'], phones: ['+15551234567'], linkedin_url: 'https://linkedin.com/in/jane-doe' }} />);
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
  expect(screen.getByText('+15551234567')).toBeInTheDocument();
});

test('renders gracefully with no contact channels', () => {
  render(<ContactCard contact={{ full_name: 'No Contacts' }} />);
  expect(screen.getByText('No Contacts')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest ContactCard`
Expected: FAIL — cannot find `../cards/ContactCard`.

- [ ] **Step 3: Add the `Contact` type**

In `AI360/types.ts`, add (tolerant — every field optional, arrays for multi-valued contacts):

```ts
export interface Contact {
  full_name?: string | null;
  headline?: string | null;
  work_emails?: string[];
  personal_emails?: string[];
  phones?: string[];
  linkedin_url?: string | null;
  twitter_url?: string | null;
  github_url?: string | null;
  confidence?: string | number | null;
}
```

Add to the `Parsed360Result` union: `| { kind: 'contact'; contact: Contact }`.

- [ ] **Step 4: Add the parser**

In `AI360/parse.ts`, add `parseContact` and wire it. ContactOut shapes vary; be tolerant — accept the object as-is when it looks like a person record:

```ts
function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string');
  return out.length ? out : undefined;
}

function parseContact(data: unknown): Parsed360Result | null {
  if (!isRecord(data)) return null;
  const contact: Contact = {
    full_name: typeof data.full_name === 'string' ? data.full_name : (typeof data.name === 'string' ? data.name : undefined),
    headline: typeof data.headline === 'string' ? data.headline : undefined,
    work_emails: asStringArray(data.work_emails),
    personal_emails: asStringArray(data.personal_emails),
    phones: asStringArray(data.phones),
    linkedin_url: typeof data.linkedin_url === 'string' ? data.linkedin_url : undefined,
    twitter_url: typeof data.twitter_url === 'string' ? data.twitter_url : undefined,
    github_url: typeof data.github_url === 'string' ? data.github_url : undefined,
    confidence: (typeof data.confidence === 'string' || typeof data.confidence === 'number') ? data.confidence : undefined,
  };
  return { kind: 'contact', contact };
}
```

In `parse360Output`'s `switch`, add: `case 'enrich_contact': return parseContact(data);`

- [ ] **Step 5: Register the tool name**

In `AI360/tools.ts`, add to `AI360_TOOLS`: `enrich_contact: 'contact',`.

- [ ] **Step 6: Build the card**

Create `AI360/cards/ContactCard.tsx` using `Bits` atoms. Render `full_name` (heading), `headline` (sub), then each email/phone as a row with a `CopyButton`, and `linkedin_url`/`twitter_url`/`github_url` as `LinkButton`s. Localize section labels via `useLocalize()` (`com_ui_360_contact_emails`, `com_ui_360_contact_phones`). Mirror the structure/styling of `cards/TalentCard.tsx`.

- [ ] **Step 7: Add the registry entry**

In `AI360/index.tsx` `RENDERERS`, add: `contact: (r) => <ContactCard contact={(r as Extract<Parsed360Result, { kind: 'contact' }>).contact} />,` and import `ContactCard`.

- [ ] **Step 8: Add locale keys**

In `client/src/locales/en/translation.json` add `"com_ui_360_contact_emails": "Emails"`, `"com_ui_360_contact_phones": "Phone"`, `"com_ui_360_contact_socials": "Profiles"` (and any label the card uses).

- [ ] **Step 9: Run tests**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest ContactCard AI360`
Expected: PASS (ContactCard tests + whole AI360 suite green).

- [ ] **Step 10: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/ client/src/locales/en/translation.json
git commit -m "feat(360ai): render enrich_contact results as ContactCard"
```

---

## Task 3: `send_outreach` → OutreachPreviewCard

**Files:**
- Modify: `AI360/tools.ts`, `AI360/types.ts`, `AI360/parse.ts`, `AI360/index.tsx`, `client/src/locales/en/translation.json`
- Create: `AI360/cards/OutreachPreviewCard.tsx`, `AI360/__tests__/OutreachPreviewCard.test.tsx`

**Interfaces:**
- Consumes: `{ status: 'preview'|'sent', channel, recipient, subject?, body, ... }`.
- Produces: `OutreachPreview` interface; union gains `{ kind: 'outreach'; outreach: OutreachPreview }`; `tools.ts` maps `send_outreach: 'outreach'`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/OutreachPreviewCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import OutreachPreviewCard from '../cards/OutreachPreviewCard';

jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));

test('preview shows draft and an awaiting-confirmation affordance, not a sent state', () => {
  render(<OutreachPreviewCard outreach={{ status: 'preview', channel: 'email', recipient: 'jane@acme.com', subject: 'Opportunity', body: 'Hi Jane.' }} />);
  expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
  expect(screen.getByText('Hi Jane.')).toBeInTheDocument();
  expect(screen.getByText('com_ui_360_outreach_awaiting')).toBeInTheDocument();
});

test('sent state shows a confirmation', () => {
  render(<OutreachPreviewCard outreach={{ status: 'sent', channel: 'email', recipient: 'jane@acme.com', body: 'Hi Jane.' }} />);
  expect(screen.getByText('com_ui_360_outreach_sent')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest OutreachPreviewCard`
Expected: FAIL — cannot find `../cards/OutreachPreviewCard`.

- [ ] **Step 3: Add the type**

In `AI360/types.ts`:

```ts
export interface OutreachPreview {
  status: 'preview' | 'sent';
  channel?: string | null;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
}
```

Add to union: `| { kind: 'outreach'; outreach: OutreachPreview }`.

- [ ] **Step 4: Add the parser**

In `AI360/parse.ts`:

```ts
function parseOutreach(data: unknown): Parsed360Result | null {
  if (!isRecord(data)) return null;
  const status = data.status === 'sent' ? 'sent' : data.status === 'preview' ? 'preview' : null;
  if (status === null) return null;
  return {
    kind: 'outreach',
    outreach: {
      status,
      channel: typeof data.channel === 'string' ? data.channel : undefined,
      recipient: typeof data.recipient === 'string' ? data.recipient : undefined,
      subject: typeof data.subject === 'string' ? data.subject : undefined,
      body: typeof data.body === 'string' ? data.body : undefined,
    },
  };
}
```

In `parse360Output`'s `switch`: `case 'send_outreach': return parseOutreach(data);`

Note: `parse360Output` returns `null` when the JSON has an `error` key (existing `hasError` guard) — a credit/validation error from `send_outreach` therefore falls back to the default text rendering, which is correct.

- [ ] **Step 5: Register the tool name**

In `AI360/tools.ts`: `send_outreach: 'outreach',`.

- [ ] **Step 6: Build the card**

Create `AI360/cards/OutreachPreviewCard.tsx`. For `status: 'preview'`: render a "draft" card — channel `Pill`, recipient row, subject (if present), body in an `ExpandableText`, and a localized **awaiting-confirmation** line (`com_ui_360_outreach_awaiting`) instructing the user to approve before it sends. Do NOT render a send button that calls the tool (out of scope — see follow-up). For `status: 'sent'`: render a success state with a check icon and `com_ui_360_outreach_sent`. Use `Bits` atoms and Tailwind matching the other cards.

- [ ] **Step 7: Register the renderer**

In `index.tsx` `RENDERERS`: `outreach: (r) => <OutreachPreviewCard outreach={(r as Extract<Parsed360Result, { kind: 'outreach' }>).outreach} />,` + import.

- [ ] **Step 8: Locale keys**

Add to `en/translation.json`: `"com_ui_360_outreach_awaiting": "Review this draft, then tell 360AI to send it."`, `"com_ui_360_outreach_sent": "Message sent."`, `"com_ui_360_outreach_to": "To"`, `"com_ui_360_outreach_subject": "Subject"`.

- [ ] **Step 9: Run tests**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest OutreachPreviewCard AI360`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/ client/src/locales/en/translation.json
git commit -m "feat(360ai): render send_outreach preview/sent as OutreachPreviewCard"
```

---

## Task 4: Define the 6 agents as model specs

**Files:**
- Modify: `librechat.yaml` (`modelSpecs.list`)
- Modify: `client/src/locales/en/translation.json` (agent labels, if referenced in UI copy)

**Interfaces:**
- Produces: `modelSpecs.list` containing 6 entries: the existing `360ai` (umbrella, keep `default: true`) plus `headhunter`, `shortlister`, `prospector`, `reviver`, `researcher`. Each: `name`, `label`, `mcpServers: ['360ai']`, `preset: { endpoint: 'anthropic', model: <same as the 360ai spec>, web_search: true, promptPrefix: <persona> }`.

- [ ] **Step 1: Confirm spec-switching is user-visible**

Read the `interface:` block and `modelSpecs:` block in `librechat.yaml`. Confirm `modelSpecs.enforce: true` with multiple `list` entries presents a spec picker to users (enforce restricts to specs in the list; it does not collapse the list to one). If `interface.modelSpecs.addedEndpoints` or a similar visibility flag is required to show the picker, note it. Record findings; do not change `enforce`/`prioritize`.

- [ ] **Step 2: Add the 5 new spec entries**

Append to `modelSpecs.list` (after the existing `360ai` entry). Copy the existing entry's `preset.endpoint`, `preset.model`, and `web_search: true` verbatim into each; give each its own `name`, `label`, and `promptPrefix`. Each `promptPrefix` MUST keep the existing 360AI identity rules (refer to itself as "360AI", never mention the underlying model/Anthropic) and then specialize. Use these personas (tools to *prefer* — all 13 are available, the prompt steers usage):

- `headhunter` / label `AI Headhunter`: "Specialise in candidate sourcing and placement. Prefer `search_talents` (pool: global), `get_candidate`, `enrich_contact`, and `send_outreach`. When sourcing, present a shortlist; on the user's pick, enrich verified contacts, then draft a personalised outreach message and call `send_outreach` to PREVIEW it — never send until the user approves the preview, then re-call with confirm:true."
- `shortlister` / label `AI Shortlister`: "Specialise in screening and ranking candidates against a job spec. Prefer `search_candidates`, `get_candidate`, `pipeline_stages`, `stage_candidates`. Produce evidence-based, bias-aware fit assessments; rank against the role's requirements only."
- `prospector` / label `AI Prospector`: "Specialise in client business development. Prefer `search_companies`, `search_jobs`, `list_jobs`, and web search for hiring signals/funding/news. Build target-account lists and qualify prospective clients."
- `reviver` / label `AI Reviver`: "Specialise in reactivating and enriching the client's existing data. Prefer `search_candidates` (pool: internal), `get_candidate`, `enrich_contact`. Surface stale-but-promising candidates and refresh their details."
- `researcher` / label `AI Researcher`: "Specialise in company and market research. Prefer `search_companies`, `get_job`, and web search. Profile companies and map markets; cite sources."

- [ ] **Step 3: Validate the YAML**

Run: `cd /Users/eth0/Herd/chat.360ai && node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('librechat.yaml','utf8'));console.log('yaml ok')"`
Expected: prints `yaml ok` (no parse error). If `js-yaml` is not resolvable from root, run from `client/`: `cd client && node -e "..."`.

- [ ] **Step 4: Manual boot verification**

Start the backend (or rely on config-load tests if present) and confirm the spec list loads without error and shows 6 specs. Record the command used and the result in the task report. (No automated test for YAML content — this is a config change; the validation in Step 3 plus boot is the gate.)

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml client/src/locales/en/translation.json
git commit -m "feat(360ai): define 6 recruiter agents as model specs"
```

---

## Done criteria

- `cd client && npx jest AI360` green; `enrich_contact` and `send_outreach` results render as cards; existing card behavior unchanged.
- `librechat.yaml` parses and exposes 6 selectable agents, each with its persona and the 360ai tools.

## Out of scope (follow-ups)

- **Interactive "Send" button** on `OutreachPreviewCard` that auto-submits a confirmation (requires hooking the chat-submit pipeline — recon needed). Today the user confirms by replying in chat.
- Per-agent hard tool allowlists (not expressible via model specs; would need a different agent mechanism).
- Provisioning the `outreach_credits` feature slug on the Laravel side (tracked in Plan 1).
- Localising agent labels beyond English (handled by the external translation pipeline).
