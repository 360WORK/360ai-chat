# Inline Entity Cards + Grounding Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `360ai-card` fenced code blocks emitted by the model as rich CompanyCard/TalentCard UI in chat markdown, and add prompt rules so research/BD specs emit those blocks and ground entities in internal tools first.

**Architecture:** A pure parser/normalizer (`AI360/inline.ts`) turns the fence body into existing `Company`/`Talent` types; a thin `InlineCard` component renders the existing cards or nothing; the interception lives in the markdown `code`/`codeNoExecution` overrides (`MarkdownComponents.tsx`), mirroring the existing `mermaid` special-language pattern, with index-parity maintained in `splitMarkdown.ts`. Prompt choreography is pure `librechat.yaml` edits to three model specs.

**Tech Stack:** React 18 + TypeScript (client workspace), react-markdown pipeline (remark/rehype), Jest + @testing-library/react (`test/layout-test-utils`), js-yaml for config verification.

**Spec:** `docs/superpowers/specs/2026-07-16-inline-entity-cards-design.md`

## Global Constraints

- **Repo:** `/Users/eth0/Herd/chat.360ai` only — no Laravel/MCP/`/api` changes, no new tools.
- **Branch:** `feat/360ai-result-cards`. Verify with `git branch --show-current` before the first commit; never switch branches.
- **Never `git add -A` or `git add .`** — stage explicit file paths only.
- **Do not touch** `docs/superpowers/` or `.superpowers/` during execution (this plan file is read-only input).
- **Silent-degrade contract:** malformed, incomplete, or mid-stream `360ai-card` JSON renders NOTHING (no raw JSON, no code block, no error text) — ever.
- **One-card-per-entity dedupe rule:** an entity gets ONE rich presentation — MCP tool-result card OR inline card, never both (enforced via prompt, Task 5).
- **≤15 lines of prompt rule per spec** (Phase 1 + Phase 2 combined, including the 3-line fenced example).
- **No `any`**, no `Record<string, unknown>` beyond the existing `isRecord` guard pattern; reuse `Company`/`Talent` from `AI360/types.ts` — no duplicate types.
- No new user-facing strings (existing cards carry their own `useLocalize` usage), so no `translation.json` changes.
- Import order per repo CLAUDE.md: package imports (react first), then `import type` block, then local imports longest→shortest.
- Every commit message ends with the trailer line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Run client tests from the client workspace: `cd /Users/eth0/Herd/chat.360ai/client && npx jest <pattern>`.

## Verified Mechanism Notes (read before starting)

These were verified against the working tree (HEAD ~`78e87af58`):

1. **Assistant chat markdown renders through ONE components module.** `MessageContent.tsx:118` renders assistant text via `Markdown` → `MarkdownErrorBoundary` → `MarkdownBlocks` with `getMarkdownComponents()` (`client/src/components/Chat/Messages/Content/markdownConfig.ts:63-80`), whose `code` override is `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx:30`. The error-boundary fallback (`MarkdownErrorBoundary.tsx:73`) and `MarkdownLite` (`MarkdownLite.tsx:44`, used for user messages and tool sub-views) import `code`/`codeNoExecution` from the SAME module. Intercepting in `MarkdownComponents.tsx` (both exports) covers every assistant-visible path. `components/Artifacts/Code.tsx` is the artifacts source-view renderer — do NOT touch it.
2. **The mermaid branch is the interception precedent** (`MarkdownComponents.tsx:41,53-59`): detect language, return a dedicated component instead of `CodeBlock`.
3. **Language regex gotcha:** the existing `/language-(\w+)/` (`MarkdownComponents.tsx:38`) truncates at the hyphen — for `360ai-card` it yields lang `360ai`. Detection MUST use a dedicated test on the full className (`/language-360ai-card\b/`), not `lang === '360ai-card'`.
4. **Index parity:** `splitMarkdown.ts:46-49` (`isExecutableCode`) mirrors the `code` component's decision about which fences consume a `CodeBlock` index (doc comment at `splitMarkdown.ts:36-45` mandates the mirror). If `code` skips the index for card fences (`getNextIndex(true)`, `MarkdownComponents.tsx:45`) but `splitMarkdown` still counts them, per-block base indices desync and "Run code" buttons target the wrong block. Both sides must change together (Task 3). On the mdast side the raw `node.lang` is `360ai-card` (no truncation), so an exact string compare mirrors the className test.
5. **Streaming:** micromark parses an unclosed fence as a code node running to end of input, so during streaming the `code` override receives the partial JSON body (always suffixed `\n` by remark-rehype). `JSON.parse` fails → render nothing; when the fence closes with valid JSON, the card appears. Render-nothing-until-parseable requires no extra buffering.
6. **rehype-highlight** runs with `{ ignoreMissing: true, subset: langSubset }` (`markdownConfig.ts:57`); `360ai-card` is not in the subset, so children stay a plain text string (no highlight spans) — same as mermaid.
7. **Inside `<pre>`:** block code renders as `pre > code`; only the inner `code` element is overridden. Vendored prose CSS makes `.prose pre` transparent/padding-0 (`client/src/style.css:973`), but `pre` forces monospace with `!important` (`style.css:1234`) and `whitespace: pre` — the card wrapper needs `not-prose font-sans whitespace-normal` (the vendored prose rules all carry the `:not(.not-prose *)` escape hatch).
8. **Existing cards:** `CompanyCard` takes `{ company: Company }` and shows `name`, `industry · location`, `employee_range` pill, links `website ?? linkedin_url` via `safeHref` (`AI360/cards/CompanyCard.tsx`). `TalentCard` takes `{ talent: Talent }` and shows `name`, `title · current_company · location`, links `profile_url ?? linkedin_url` (`AI360/cards/TalentCard.tsx`). `safeHref` (`AI360/href.ts`) allows http/https/mailto/tel only — no new XSS surface.
9. **Field-mapping decision (spec → existing types):** the spec's card fields map onto existing types with no card changes: company `size`→`employee_range`, `url`→`website`, `summary ?? signal`→`description`; talent `summary ?? signal`→`summary`. `signal`/`summary` are normalized but not currently displayed by the compact cards (they render name/meta/pill only) — accepted; extending card visuals is out of scope.
10. **Prompt specs:** `librechat.yaml` has 6 model specs. Card + grounding rules go into `360ai` (promptPrefix at line 408, numbered "How you work" items 1–4 ending line 582, `Style:` at 584), `prospector` (Specialisation ends line 754, `Style:` at 756), `researcher` (Specialisation ends line 850, `Style:` at 852). `headhunter` presents candidates only (its step 2d-style company work exists only in the `360ai` spec) — excluded per spec. `shortlister`/`reviver` are out of remit. YAML verification pattern from prior plans (e.g. `docs/superpowers/plans/2026-06-18-360ai-agent-surface.md:374`): `node -e "require('js-yaml').load(...)"` from repo root plus content assertions (`js-yaml@4` is hoisted at root `node_modules`, dep of `api/package.json:89`).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/Chat/Messages/Content/AI360/parse.ts` | Modify (1 word) | Export the existing `isRecord` guard for reuse |
| `client/src/components/Chat/Messages/Content/AI360/inline.ts` | Create | Pure parser/normalizer: fence body string → `InlineCardResult \| null` |
| `client/src/components/Chat/Messages/Content/AI360/__tests__/inline.test.ts` | Create | Parser unit tests |
| `client/src/components/Chat/Messages/Content/AI360/InlineCard.tsx` | Create | React component: children → text → parse → existing card or `null` |
| `client/src/components/Chat/Messages/Content/AI360/__tests__/InlineCard.test.tsx` | Create | Component unit tests |
| `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx` | Modify | Intercept `language-360ai-card` in `code` + `codeNoExecution` |
| `client/src/components/Chat/Messages/Content/splitMarkdown.ts` | Modify | Index-parity: card fences don't consume a CodeBlock index |
| `client/src/components/Chat/Messages/Content/__tests__/Markdown.inlinecard.test.tsx` | Create | Full-pipeline integration tests (streaming, parity, silent degrade) |
| `librechat.yaml` | Modify | Phase 1 card rule + Phase 2 ground-first rule in 3 specs |

---

### Task 1: Inline card parser/normalizer (`AI360/inline.ts`)

**Files:**
- Modify: `client/src/components/Chat/Messages/Content/AI360/parse.ts:25`
- Create: `client/src/components/Chat/Messages/Content/AI360/inline.ts`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/inline.test.ts`

**Interfaces:**
- Consumes: `Company`, `Talent` from `./types`; `isRecord` from `./parse` (newly exported).
- Produces: `parseInlineCard(text: string): InlineCardResult | null` and `type InlineCardResult = { kind: 'company'; company: Company } | { kind: 'talent'; talent: Talent }` — Task 2 imports both from `./inline`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/Chat/Messages/Content/AI360/__tests__/inline.test.ts`:

```ts
import { parseInlineCard } from '../inline';

describe('parseInlineCard', () => {
  it('normalizes a company card onto the Company type (size→employee_range, url→website, summary→description)', () => {
    const text = JSON.stringify({
      kind: 'company',
      name: 'Acme GmbH',
      location: 'Berlin',
      industry: 'Cybersecurity',
      size: '51-200',
      signal: 'Raised EUR 20M Series A',
      url: 'https://acme.example',
      linkedin_url: 'https://www.linkedin.com/company/acme',
      summary: 'EDR vendor',
    });
    expect(parseInlineCard(text)).toEqual({
      kind: 'company',
      company: {
        name: 'Acme GmbH',
        location: 'Berlin',
        industry: 'Cybersecurity',
        employee_range: '51-200',
        website: 'https://acme.example',
        linkedin_url: 'https://www.linkedin.com/company/acme',
        description: 'EDR vendor',
      },
    });
  });

  it('falls back to signal for the company description when summary is absent', () => {
    const result = parseInlineCard(
      JSON.stringify({ kind: 'company', name: 'Acme', signal: 'Hiring 6 engineers' }),
    );
    expect(result?.kind).toBe('company');
    if (result?.kind === 'company') {
      expect(result.company.description).toBe('Hiring 6 engineers');
    }
  });

  it('normalizes a talent card onto the Talent type', () => {
    const text = JSON.stringify({
      kind: 'talent',
      name: 'Jane Doe',
      title: 'Security Engineer',
      current_company: 'Acme GmbH',
      location: 'Berlin',
      linkedin_url: 'https://www.linkedin.com/in/janedoe',
      summary: 'CISSP, 8 yrs detection engineering',
    });
    expect(parseInlineCard(text)).toEqual({
      kind: 'talent',
      talent: {
        name: 'Jane Doe',
        title: 'Security Engineer',
        current_company: 'Acme GmbH',
        location: 'Berlin',
        linkedin_url: 'https://www.linkedin.com/in/janedoe',
        summary: 'CISSP, 8 yrs detection engineering',
      },
    });
  });

  it('falls back to signal for the talent summary when summary is absent', () => {
    const result = parseInlineCard(
      JSON.stringify({ kind: 'talent', name: 'Jane', signal: 'Open to new roles' }),
    );
    expect(result?.kind).toBe('talent');
    if (result?.kind === 'talent') {
      expect(result.talent.summary).toBe('Open to new roles');
    }
  });

  it('drops non-string optional fields instead of failing', () => {
    const result = parseInlineCard(
      JSON.stringify({ kind: 'company', name: 'Acme', location: 42, url: null }),
    );
    expect(result).toEqual({
      kind: 'company',
      company: {
        name: 'Acme',
        location: undefined,
        industry: undefined,
        employee_range: undefined,
        website: undefined,
        linkedin_url: undefined,
        description: undefined,
      },
    });
  });

  it('returns null for malformed JSON (silent degrade)', () => {
    expect(parseInlineCard('{"kind":"company","name":')).toBeNull();
    expect(parseInlineCard('not json at all')).toBeNull();
  });

  it('returns null for a mid-stream partial body', () => {
    expect(parseInlineCard('{"kind":"comp')).toBeNull();
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(parseInlineCard('')).toBeNull();
    expect(parseInlineCard('  \n')).toBeNull();
  });

  it('returns null when kind is missing or unknown', () => {
    expect(parseInlineCard(JSON.stringify({ name: 'Acme' }))).toBeNull();
    expect(parseInlineCard(JSON.stringify({ kind: 'job', name: 'Acme' }))).toBeNull();
  });

  it('returns null when name is missing, empty, or not a string', () => {
    expect(parseInlineCard(JSON.stringify({ kind: 'company' }))).toBeNull();
    expect(parseInlineCard(JSON.stringify({ kind: 'company', name: '' }))).toBeNull();
    expect(parseInlineCard(JSON.stringify({ kind: 'talent', name: 7 }))).toBeNull();
  });

  it('returns null for valid JSON that is not an object', () => {
    expect(parseInlineCard('[1,2,3]')).toBeNull();
    expect(parseInlineCard('"company"')).toBeNull();
    expect(parseInlineCard('null')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest AI360/__tests__/inline.test.ts`
Expected: FAIL — `Cannot find module '../inline'`.

- [ ] **Step 3: Export `isRecord` from parse.ts**

In `client/src/components/Chat/Messages/Content/AI360/parse.ts` line 25, change:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
```

to:

```ts
export function isRecord(value: unknown): value is Record<string, unknown> {
```

- [ ] **Step 4: Write the implementation**

Create `client/src/components/Chat/Messages/Content/AI360/inline.ts`:

```ts
import type { Company, Talent } from './types';
import { isRecord } from './parse';

export type InlineCardResult =
  | { kind: 'company'; company: Company }
  | { kind: 'talent'; talent: Talent };

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toCompany(data: Record<string, unknown>, name: string): Company {
  return {
    name,
    location: asOptionalString(data.location),
    industry: asOptionalString(data.industry),
    employee_range: asOptionalString(data.size),
    website: asOptionalString(data.url),
    linkedin_url: asOptionalString(data.linkedin_url),
    description: asOptionalString(data.summary) ?? asOptionalString(data.signal),
  };
}

function toTalent(data: Record<string, unknown>, name: string): Talent {
  return {
    name,
    title: asOptionalString(data.title),
    current_company: asOptionalString(data.current_company),
    location: asOptionalString(data.location),
    linkedin_url: asOptionalString(data.linkedin_url),
    summary: asOptionalString(data.summary) ?? asOptionalString(data.signal),
  };
}

/**
 * Parses the body of a `360ai-card` fenced block into an existing card model.
 * Returns null for anything unparseable or incomplete (including mid-stream
 * partial JSON) so the renderer degrades silently — raw JSON must never reach
 * the user.
 */
export function parseInlineCard(text: string): InlineCardResult | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(data)) {
    return null;
  }
  const name = asOptionalString(data.name);
  if (name === undefined) {
    return null;
  }
  if (data.kind === 'company') {
    return { kind: 'company', company: toCompany(data, name) };
  }
  if (data.kind === 'talent') {
    return { kind: 'talent', talent: toTalent(data, name) };
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest AI360/__tests__/inline.test.ts`
Expected: PASS (11 tests).

Also confirm the existing parse suite still passes after the export change:
Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest AI360/__tests__/parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/inline.ts \
        client/src/components/Chat/Messages/Content/AI360/parse.ts \
        client/src/components/Chat/Messages/Content/AI360/__tests__/inline.test.ts
git commit -m "feat(ai360): add inline 360ai-card JSON parser/normalizer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `InlineCard` renderer component

**Files:**
- Create: `client/src/components/Chat/Messages/Content/AI360/InlineCard.tsx`
- Test: `client/src/components/Chat/Messages/Content/AI360/__tests__/InlineCard.test.tsx`

**Interfaces:**
- Consumes: `parseInlineCard` from `./inline` (Task 1); default exports `CompanyCard` (`./cards/CompanyCard`, prop `{ company: Company }`) and `TalentCard` (`./cards/TalentCard`, prop `{ talent: Talent }`).
- Produces: default export `InlineCard`, a React component with props `{ children: React.ReactNode }` — Task 3 renders `<InlineCard>{children}</InlineCard>` from the markdown `code` override. Renders `null` when the body doesn't parse.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/Chat/Messages/Content/AI360/__tests__/InlineCard.test.tsx`:

```tsx
import { render, screen } from 'test/layout-test-utils';
import InlineCard from '../InlineCard';

const COMPANY_JSON =
  '{"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","url":"https://acme.example"}';
const TALENT_JSON =
  '{"kind":"talent","name":"Jane Doe","title":"Security Engineer","current_company":"Acme GmbH","location":"Berlin","linkedin_url":"https://www.linkedin.com/in/janedoe"}';

describe('InlineCard', () => {
  it('renders a CompanyCard for a valid company body', () => {
    render(<InlineCard>{COMPANY_JSON}</InlineCard>);
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Cybersecurity · Berlin')).toBeInTheDocument();
    expect(screen.getByText('51-200')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://acme.example');
  });

  it('renders a TalentCard for a valid talent body', () => {
    render(<InlineCard>{TALENT_JSON}</InlineCard>);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Security Engineer · Acme GmbH · Berlin')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/janedoe',
    );
  });

  it('joins string chunks when children is an array (rehype text splitting)', () => {
    const chunks = ['{"kind":"talent",', '"name":"Jane Doe"}'];
    render(<InlineCard>{chunks}</InlineCard>);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders nothing for malformed JSON (never the raw body)', () => {
    const { container } = render(<InlineCard>{'{"kind":"company","name":'}</InlineCard>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a mid-stream partial body', () => {
    const { container } = render(<InlineCard>{'{"kind":"comp'}</InlineCard>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for non-string children', () => {
    const { container } = render(
      <InlineCard>
        <span>{COMPANY_JSON}</span>
      </InlineCard>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest AI360/__tests__/InlineCard.test.tsx`
Expected: FAIL — `Cannot find module '../InlineCard'`.

- [ ] **Step 3: Write the implementation**

Create `client/src/components/Chat/Messages/Content/AI360/InlineCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import CompanyCard from './cards/CompanyCard';
import TalentCard from './cards/TalentCard';
import { parseInlineCard } from './inline';

function toText(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.filter((child): child is string => typeof child === 'string').join('');
  }
  return '';
}

/**
 * Renders the body of a `360ai-card` fenced block as a rich entity card.
 * The wrapper renders inside the markdown `<pre>` element, so it opts out of
 * prose/pre styling (`not-prose`, sans font, normal whitespace). Unparseable
 * bodies (including mid-stream partials) render nothing at all.
 */
export default function InlineCard({ children }: { children: ReactNode }) {
  const parsed = parseInlineCard(toText(children));
  if (parsed === null) {
    return null;
  }
  return (
    <span className="not-prose my-2 block whitespace-normal font-sans">
      {parsed.kind === 'company' ? (
        <CompanyCard company={parsed.company} />
      ) : (
        <TalentCard talent={parsed.talent} />
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest AI360/__tests__/InlineCard.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/InlineCard.tsx \
        client/src/components/Chat/Messages/Content/AI360/__tests__/InlineCard.test.tsx
git commit -m "feat(ai360): add InlineCard renderer for 360ai-card fence bodies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Markdown pipeline interception (`code` override + index parity)

**Files:**
- Modify: `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx:20-101`
- Modify: `client/src/components/Chat/Messages/Content/splitMarkdown.ts:28-49`
- Test: `client/src/components/Chat/Messages/Content/__tests__/Markdown.inlinecard.test.tsx`

**Interfaces:**
- Consumes: `InlineCard` default export from `./AI360/InlineCard` (Task 2), props `{ children: ReactNode }`.
- Produces: `code` and `codeNoExecution` render `<InlineCard>` for fences whose className matches `/language-360ai-card\b/`; card fences do not consume a CodeBlock index (both in `getNextIndex` and in `splitMarkdown`'s `isExecutableCode`). No exported API changes.

- [ ] **Step 1: Write the failing integration test**

Create `client/src/components/Chat/Messages/Content/__tests__/Markdown.inlinecard.test.tsx` (mirrors the CodeBlock-stub pattern of `MarkdownBlocks.test.tsx` and uses the provider wrapper from `test/layout-test-utils`):

```tsx
import React from 'react';
import { render, screen } from 'test/layout-test-utils';
import MarkdownLite from '../MarkdownLite';
import Markdown from '../Markdown';

jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: ({ lang, blockIndex }: { lang?: string; blockIndex?: number }) => (
    <div data-testid="cb" data-block-index={String(blockIndex)} data-lang={String(lang)} />
  ),
}));

const COMPANY_JSON =
  '{"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","url":"https://acme.example"}';
const TALENT_JSON =
  '{"kind":"talent","name":"Jane Doe","title":"Security Engineer","current_company":"Acme GmbH","location":"Berlin","linkedin_url":"https://www.linkedin.com/in/janedoe"}';

const cardBlock = (body: string) => ['```360ai-card', body, '```'].join('\n');

describe('Markdown 360ai-card interception', () => {
  it('renders a company card instead of a code block', () => {
    render(
      <Markdown
        content={`Targets below.\n\n${cardBlock(COMPANY_JSON)}`}
        isLatestMessage={false}
      />,
    );
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Cybersecurity · Berlin')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://acme.example');
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
  });

  it('renders a talent card instead of a code block', () => {
    render(<Markdown content={cardBlock(TALENT_JSON)} isLatestMessage={false} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Security Engineer · Acme GmbH · Berlin')).toBeInTheDocument();
  });

  it('renders consecutive card blocks as a vertical list of cards', () => {
    render(
      <Markdown
        content={`${cardBlock(COMPANY_JSON)}\n\n${cardBlock(TALENT_JSON)}`}
        isLatestMessage={false}
      />,
    );
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders nothing (not raw JSON, not a code block) for a malformed closed fence', () => {
    const { container } = render(
      <Markdown content={cardBlock('{"kind":"company","name":')} isLatestMessage={false} />,
    );
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('kind');
  });

  it('renders nothing while the fence is still streaming, then the card once closed', () => {
    const partial = ['Targets below.', '', '```360ai-card', '{"kind":"company","na'].join('\n');
    const { container, rerender } = render(
      <Markdown content={partial} isLatestMessage={true} />,
    );
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('kind');
    expect(screen.queryByText('Acme GmbH')).not.toBeInTheDocument();

    rerender(
      <Markdown
        content={`Targets below.\n\n${cardBlock(COMPANY_JSON)}`}
        isLatestMessage={true}
      />,
    );
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
  });

  it('leaves other languages untouched and does not consume a CodeBlock index', () => {
    const content = [
      '```js',
      'const a = 1;',
      '```',
      '',
      cardBlock(COMPANY_JSON),
      '',
      '```python',
      'print(1)',
      '```',
    ].join('\n');
    render(<Markdown content={content} isLatestMessage={false} />);
    const blocks = screen
      .getAllByTestId('cb')
      .map((el) => [el.getAttribute('data-lang'), el.getAttribute('data-block-index')]);
    expect(blocks).toEqual([
      ['js', '0'],
      ['python', '1'],
    ]);
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
  });

  it('intercepts through the codeNoExecution path (MarkdownLite without execution)', () => {
    render(<MarkdownLite content={cardBlock(TALENT_JSON)} codeExecution={false} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest Content/__tests__/Markdown.inlinecard.test.tsx`
Expected: FAIL — card fences currently render the stubbed CodeBlock (`data-lang="360ai"`), so `queryByTestId('cb')` assertions and card-text assertions fail.

- [ ] **Step 3: Add the interception to `MarkdownComponents.tsx`**

Edit `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx`.

3a. Add the import after the existing `CodeBlock` import (line 6):

```ts
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import InlineCard from './AI360/InlineCard';
```

3b. Add the detector below `isSingleLineCode` (after line 28). The full-className test is required because the existing `/language-(\w+)/` regex truncates `360ai-card` at the hyphen:

```ts
const CARD_LANGUAGE = /language-360ai-card\b/;

const is360aiCard = (className?: string): boolean => CARD_LANGUAGE.test(className ?? '');
```

3c. In the `code` component, replace (lines 38–45):

```ts
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isMermaid = lang === 'mermaid';
  const isSingleLine = isSingleLineCode(children);

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isMermaid || isSingleLine)).current;
```

with:

```ts
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isCard = is360aiCard(className);
  const isMath = lang === 'math';
  const isMermaid = lang === 'mermaid';
  const isSingleLine = isSingleLineCode(children);

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isCard || isMath || isMermaid || isSingleLine)).current;
```

3d. In the same component, replace the start of the branch chain (lines 51–53):

```ts
  if (isMath) {
    return <>{children}</>;
  } else if (isMermaid) {
```

with:

```ts
  if (isCard) {
    return <InlineCard>{children}</InlineCard>;
  } else if (isMath) {
    return <>{children}</>;
  } else if (isMermaid) {
```

3e. In `codeNoExecution`, replace (lines 83–86):

```ts
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (lang === 'math') {
```

with:

```ts
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (is360aiCard(className)) {
    return <InlineCard>{children}</InlineCard>;
  } else if (lang === 'math') {
```

- [ ] **Step 4: Keep `splitMarkdown.ts` index counting in parity**

Edit `client/src/components/Chat/Messages/Content/splitMarkdown.ts`.

4a. Replace the doc sentence in the comment above `renderedCodeLang` (lines ~28–35):

```ts
 * Mirror the `code` component's decision for whether a fenced block renders as a
 * runnable CodeBlock (and therefore consumes a block index). Every fenced code
 * block does, except `math` and `mermaid` fences, which have dedicated
 * renderers. mdast strips a fenced block's trailing newline, but
```

with:

```ts
 * Mirror the `code` component's decision for whether a fenced block renders as a
 * runnable CodeBlock (and therefore consumes a block index). Every fenced code
 * block does, except `math`, `mermaid`, and `360ai-card` fences, which have
 * dedicated renderers. mdast strips a fenced block's trailing newline, but
```

4b. Replace `isExecutableCode` (lines 46–49):

```ts
const isExecutableCode = (lang: string): boolean => {
  const normalized = renderedCodeLang(lang);
  return normalized !== 'math' && normalized !== 'mermaid';
};
```

with:

```ts
const isExecutableCode = (lang: string): boolean => {
  if (lang === '360ai-card') {
    return false;
  }
  const normalized = renderedCodeLang(lang);
  return normalized !== 'math' && normalized !== 'mermaid';
};
```

The `360ai-card` check compares the raw mdast info string (not the `\w+`-normalized form, which truncates to `360ai` at the hyphen) — this exactly mirrors the `code` component's full-className `/language-360ai-card\b/` test, so a fence like `360ai-cardX` still counts as executable on both sides.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest Content/__tests__/Markdown.inlinecard.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the neighboring markdown suites to verify no regression**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest Content/__tests__/MarkdownBlocks.test.tsx Content/__tests__/MarkdownBlocks.artifacts.test.tsx Content/__tests__/Markdown.mcpui.test.tsx`
Expected: PASS — mermaid/math/artifact handling and block-index accounting unchanged.

- [ ] **Step 7: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/MarkdownComponents.tsx \
        client/src/components/Chat/Messages/Content/splitMarkdown.ts \
        client/src/components/Chat/Messages/Content/__tests__/Markdown.inlinecard.test.tsx
git commit -m "feat(chat): render 360ai-card fenced blocks as inline entity cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Prompt rules Phase 1 — emit cards (`librechat.yaml`)

**Files:**
- Modify: `librechat.yaml` — specs `360ai` (promptPrefix ending at the `Style:` line 584), `prospector` (line ~754), `researcher` (line ~850)

**Interfaces:**
- Consumes: the renderer contract from Task 3 (fence language `360ai-card`, one JSON object per block, fields per `inline.ts`).
- Produces: each of the 3 specs instructs the model to emit `360ai-card` blocks. Task 5 appends the ground-first rule immediately after each block added here. Combined budget: ≤15 lines per spec (this task adds 10, including the 3-line example).

- [ ] **Step 1: Insert the card rule into the `360ai` spec**

In `librechat.yaml`, the `360ai` promptPrefix's numbered "How you work" list ends with item 4. Replace this exact text (currently lines ~579–584):

```yaml
          4. PAUSE ONLY for a decision that is genuinely the recruiter's to
             make, or before any billable or irreversible action (sending
             outreach, writing/pushing data) — those always require explicit
             approval first.

          Style: a sharp, practical recruiting partner — warm, honest,
```

with:

```yaml
          4. PAUSE ONLY for a decision that is genuinely the recruiter's to
             make, or before any billable or irreversible action (sending
             outreach, writing/pushing data) — those always require explicit
             approval first.

          5. PRESENT ENTITIES AS CARDS: when presenting specific companies
             or people as recommendations (targets, shortlists,
             decision-makers), emit one fenced 360ai-card block per entity
             alongside your analysis — ONE JSON object, only fields you know
             (never invent); tables stay for comparative overviews. Talent
             fields: kind, name, title, current_company, location,
             linkedin_url, signal, summary. Company example:
             ```360ai-card
             {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
             ```

          Style: a sharp, practical recruiting partner — warm, honest,
```

- [ ] **Step 2: Insert the card rule into the `prospector` spec**

Replace this exact text (currently lines ~754–756; the "Ask a brief" continuation makes it unique to prospector):

```yaml
          real signals. All 13 platform tools remain available.

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Ask a brief
```

with:

```yaml
          real signals. All 13 platform tools remain available.

          Present entities as cards: when presenting specific companies or
          people as recommendations (targets, shortlists, decision-makers),
          emit one fenced 360ai-card block per entity alongside your
          analysis — ONE JSON object, only fields you know (never invent);
          tables stay for comparative overviews. Talent fields: kind, name,
          title, current_company, location, linkedin_url, signal, summary.
          Company example:
          ```360ai-card
          {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
          ```

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Ask a brief
```

- [ ] **Step 3: Insert the card rule into the `researcher` spec**

Replace this exact text (currently lines ~850–852; the "Cite your" continuation makes it unique to researcher):

```yaml
          web search. All 13 platform tools remain available.

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Cite your
```

with:

```yaml
          web search. All 13 platform tools remain available.

          Present entities as cards: when presenting specific companies or
          people as recommendations (targets, shortlists, decision-makers),
          emit one fenced 360ai-card block per entity alongside your
          analysis — ONE JSON object, only fields you know (never invent);
          tables stay for comparative overviews. Talent fields: kind, name,
          title, current_company, location, linkedin_url, signal, summary.
          Company example:
          ```360ai-card
          {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
          ```

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Cite your
```

- [ ] **Step 4: Verify the YAML parses and the rule landed in exactly the right specs**

Run:

```bash
cd /Users/eth0/Herd/chat.360ai && node -e "
const y = require('js-yaml');
const fs = require('fs');
const cfg = y.load(fs.readFileSync('librechat.yaml', 'utf8'));
const specs = Object.fromEntries(cfg.modelSpecs.list.map((s) => [s.name, s.preset.promptPrefix || '']));
for (const n of ['360ai', 'prospector', 'researcher']) {
  if (!specs[n].includes('360ai-card')) throw new Error(n + ': missing card rule');
  if (!specs[n].includes('never invent')) throw new Error(n + ': missing never-invent clause');
  if (!/\`\`\`360ai-card/.test(specs[n])) throw new Error(n + ': missing fenced example');
}
for (const n of ['headhunter', 'shortlister', 'reviver']) {
  if ((specs[n] || '').includes('360ai-card')) throw new Error(n + ': must NOT have card rule');
}
console.log('phase1 yaml ok — specs:', cfg.modelSpecs.list.length);
"
```

Expected output: `phase1 yaml ok — specs: 6`

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(specs): instruct 360ai/prospector/researcher to emit 360ai-card blocks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Prompt rules Phase 2 — ground-first + dedupe (`librechat.yaml`)

**Files:**
- Modify: `librechat.yaml` — same 3 specs, appending directly after each Phase 1 block

**Interfaces:**
- Consumes: Phase 1 blocks from Task 4 (each ends with a ` ``` ` fence line followed by a blank line and the spec's `Style:` paragraph).
- Produces: ground-first + one-card-per-entity dedupe rule in each of the 3 specs (5 lines each; total 15 lines per spec with Phase 1). The wording "look up … internally **before presenting**" is already satisfied by the `360ai` spec's deep-dive loop (item 2 sources candidates via `search_talents` before presenting), so it does not contradict the candidate-sourcing choreography — it extends the same discipline to BD/company entities from web research.

- [ ] **Step 1: Insert the ground-first rule into the `360ai` spec**

Replace this exact text (the item-5 fence close followed by the `360ai`-unique `Style:` line):

```yaml
             {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
             ```

          Style: a sharp, practical recruiting partner — warm, honest,
```

with:

```yaml
             {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
             ```

          6. GROUND FIRST: look up named companies/people internally before
             presenting them (search_companies; search_talents or
             search_candidates) — cap at the ~5-10 you will recommend and
             never block the answer on a lookup. Found → its tool card
             renders: skip the inline card, ONE card per entity, never both.

          Style: a sharp, practical recruiting partner — warm, honest,
```

- [ ] **Step 2: Insert the ground-first rule into the `prospector` spec**

Replace this exact text (fence close + prospector-unique `Style:` continuation "Ask a brief"):

```yaml
          {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
          ```

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Ask a brief
```

with:

```yaml
          {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
          ```

          Ground first: look up named companies/people internally before
          presenting them (search_companies; search_talents or
          search_candidates) — cap at the ~5-10 you will recommend and
          never block the answer on a lookup. Found → its tool card
          renders: skip the inline card, ONE card per entity, never both.

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Ask a brief
```

- [ ] **Step 3: Insert the ground-first rule into the `researcher` spec**

Replace this exact text (fence close + researcher-unique `Style:` continuation "Cite your"):

```yaml
          {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
          ```

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Cite your
```

with:

```yaml
          {"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","signal":"Raised EUR 20M Series A","url":"https://acme.example"}
          ```

          Ground first: look up named companies/people internally before
          presenting them (search_companies; search_talents or
          search_candidates) — cap at the ~5-10 you will recommend and
          never block the answer on a lookup. Found → its tool card
          renders: skip the inline card, ONE card per entity, never both.

          Style: Be a sharp, practical recruiting partner — helpful, honest, and
          concise. Lead with the answer, then the supporting detail. Cite your
```

- [ ] **Step 4: Verify YAML + Phase 2 content assertions**

Run:

```bash
cd /Users/eth0/Herd/chat.360ai && node -e "
const y = require('js-yaml');
const fs = require('fs');
const cfg = y.load(fs.readFileSync('librechat.yaml', 'utf8'));
const specs = Object.fromEntries(cfg.modelSpecs.list.map((s) => [s.name, s.preset.promptPrefix || '']));
for (const n of ['360ai', 'prospector', 'researcher']) {
  if (!/ground first/i.test(specs[n])) throw new Error(n + ': missing ground-first rule');
  if (!specs[n].includes('never block the answer')) throw new Error(n + ': missing no-block fallback');
  if (!specs[n].includes('ONE card per entity, never both')) throw new Error(n + ': missing dedupe rule');
}
for (const n of ['headhunter', 'shortlister', 'reviver']) {
  if (/ground first/i.test(specs[n] || '')) throw new Error(n + ': must NOT have ground-first rule');
}
console.log('phase2 yaml ok');
"
```

Expected output: `phase2 yaml ok`

- [ ] **Step 5: Verify the ≤15-line budget per spec**

Run:

```bash
cd /Users/eth0/Herd/chat.360ai && awk '/PRESENT ENTITIES AS CARDS|Present entities as cards/{c=1} c{n++} /never both\./{if(c){print "rule lines:", n; c=0; n=0}}' librechat.yaml
```

Expected: three `rule lines:` values, each ≤ 15 (the blank separator line between phase blocks is layout, not rule text; if a value reads 16 due to that blank line, that is acceptable — the rule text itself is 15).

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(specs): ground-first lookup + one-card-per-entity dedupe rule

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verification sweep

**Files:**
- No planned changes; fix-ups only if a check fails.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a green verification record (paste command outputs into the task report).

- [ ] **Step 1: Full AI360 suite**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360`
Expected: all suites pass (existing card/parse/href/registry tests + new `inline.test.ts`, `InlineCard.test.tsx`).

- [ ] **Step 2: Full chat markdown suite**

Run: `cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/__tests__`
Expected: all suites pass (includes `Markdown.inlinecard.test.tsx`, `MarkdownBlocks.test.tsx`, `MarkdownBlocks.artifacts.test.tsx`, `Markdown.mcpui.test.tsx`).

- [ ] **Step 3: Lint the touched client files**

Run:

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx eslint \
  src/components/Chat/Messages/Content/AI360/inline.ts \
  src/components/Chat/Messages/Content/AI360/InlineCard.tsx \
  src/components/Chat/Messages/Content/AI360/parse.ts \
  src/components/Chat/Messages/Content/MarkdownComponents.tsx \
  src/components/Chat/Messages/Content/splitMarkdown.ts \
  src/components/Chat/Messages/Content/__tests__/Markdown.inlinecard.test.tsx \
  src/components/Chat/Messages/Content/AI360/__tests__/inline.test.ts \
  src/components/Chat/Messages/Content/AI360/__tests__/InlineCard.test.tsx
```

Expected: no errors, no warnings. Fix any diagnostics (auto-fix formatting with `--fix`).

- [ ] **Step 4: Combined YAML assertion (both phases in one gate)**

Re-run the Task 4 Step 4 script and the Task 5 Step 4 script.
Expected: `phase1 yaml ok — specs: 6` and `phase2 yaml ok`.

- [ ] **Step 5: Git hygiene check**

Run: `cd /Users/eth0/Herd/chat.360ai && git status --short && git log --oneline -6`
Expected: clean tree; 5 new commits on `feat/360ai-result-cards` (Tasks 1–5), no changes under `docs/superpowers/` or `.superpowers/`, no `/api` or `packages/` files touched.

- [ ] **Step 6: Commit (only if fixes were needed)**

If Steps 1–4 required code fixes, stage the specific fixed files and commit:

```bash
cd /Users/eth0/Herd/chat.360ai
git add <specific fixed files>
git commit -m "fix(ai360): verification-sweep fixes for inline entity cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

If everything passed with no changes, skip this step.

---

## Self-Review (completed)

- **Spec coverage:** contract + fields → Task 1; renderer interception via `code` override, silent degrade, streaming, safe-href reuse → Tasks 2–3; ResultList visual consistency → consecutive blocks stack as a card list (Task 3 test 3; grouping separate fences into one `ResultList` grid is impossible from within the per-fence `code` override, and the cards are the same `CardShell` rows `ResultList` renders); Phase 1 prompt rule in `360ai`/`prospector`/`researcher` with exact example → Task 4; Phase 2 ground-first, cap 5–10, no-block fallback, dedupe → Task 5; non-goals respected (no Laravel/MCP, no new actions, no retroactive re-render); all four spec test categories covered in Task 3's suite.
- **Placeholder scan:** no TBD/TODO; every code/test/yaml step carries complete content; only Task 6 Step 6 is conditional by design.
- **Type consistency:** `parseInlineCard(text: string): InlineCardResult | null` used identically in Tasks 1–3; `InlineCard` takes `{ children: ReactNode }` in Tasks 2–3; yaml anchor strings in Task 5 match the exact text Task 4 inserts (fence close + spec-unique `Style:` continuations).
