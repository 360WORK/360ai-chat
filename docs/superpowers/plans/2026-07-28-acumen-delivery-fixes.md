# Acumen Delivery Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Acumen composed prompt visibly change AI behavior by giving it explicit precedence over the static persona, making the use-case router actually fire on natural briefs and workspace-card kickoffs, and shipping a rebuilt, tested backend.

**Architecture:** Four surgical changes: (1) the rendered Acumen prompt opens with an authoritative "Live Instruction" override header; (2) the 13k-char `360ai` promptPrefix in `librechat.yaml` is trimmed and gains a deference clause so it yields to the Live Instruction on workflow conflicts; (3) `router.ts` keyword regexes widen so real briefs and every workspace-card kickoff string route to a use-case core+lens; (4) profile-fetch timeout bumps 1500→2500 ms. Then rebuild `packages/api`/`packages/data-provider` and run all acumen suites.

**Tech Stack:** TypeScript (`packages/api`), Jest, plain JS (`api/`), YAML config.

## Global Constraints

- Branch: `feat/360ai-result-cards` (chat repo). No Laravel changes needed.
- All new backend code TypeScript in `packages/api`; keep `/api` JS edits minimal.
- Never use `any`; no inline narration comments; import order per CLAUDE.md.
- Run packages/api tests from `packages/api/`: `npx jest src/acumen`. Run api tests from `api/`: `npx jest server/controllers/agents/__tests__/acumen.spec.js`.
- Node 24.16.0 (`nvm use`; `unset npm_config_prefix` first if set).
- Do NOT modify the other 5 model specs (headhunter, shortlister, prospector, reviver, researcher).
- Golden snapshot updates (`packages/api/src/acumen/__snapshots__/`) are expected ONLY in Task 1 — review the diff, don't blind-update elsewhere.

---

### Task 1: Override header in rendered Acumen prompt

**Files:**
- Modify: `packages/api/src/acumen/render.ts`
- Test: `packages/api/src/acumen/render.spec.ts`, `packages/api/src/acumen/golden.spec.ts` (snapshots)

**Interfaces:**
- Produces: rendered prompt whose first lines are exactly:
  `# Live Instruction (Acumen)` then the sentence
  `This section defines your working method for this session. Where it conflicts with any general workflow guidance elsewhere in your instructions, THIS section wins — except hard constraints and safety rules, which always apply and only tighten.`
- The existing sections (Core Foundations first, off-limits LAST) follow unchanged below the header.

- [ ] **Step 1: Write the failing test** — in `render.spec.ts` add:

```ts
it('opens with the Live Instruction override header', () => {
  const prompt = renderPrompt(minimalRenderInput());
  expect(prompt.startsWith('# Live Instruction (Acumen)')).toBe(true);
  expect(prompt).toContain('THIS section wins');
});
```

Reuse whatever minimal fixture builder the spec already uses for `renderPrompt` (read the spec first; adapt the fixture name accordingly).

- [ ] **Step 2: Run to verify it fails** — `cd packages/api && npx jest src/acumen/render.spec.ts` → FAIL.
- [ ] **Step 3: Implement** — in `render.ts`, prepend the two header lines (header + override sentence, then a blank line) to the assembled output at the top of the render function. Keep off-limits rendered last.
- [ ] **Step 4: Run render + golden suites** — `npx jest src/acumen/render.spec.ts src/acumen/golden.spec.ts`. Golden snapshots will fail; inspect that the ONLY diff is the new header, then update: `npx jest src/acumen/golden.spec.ts -u`. Re-run full acumen suite: `npx jest src/acumen` → all pass.
- [ ] **Step 5: Commit** — `git add packages/api/src/acumen && git commit -m "feat(acumen): open composed prompt with Live Instruction override header"`.

### Task 2: Widen router + guarantee kickoff routing

**Files:**
- Modify: `packages/api/src/acumen/router.ts` (KEYWORDS regexes), possibly `packages/api/src/acumen/workspaces.ts` (kickoff strings)
- Test: `packages/api/src/acumen/router.spec.ts`, `packages/api/src/acumen/workspaces.spec.ts`

**Interfaces:**
- Consumes: `selectUseCase(brief, businessType)` and `workspacesFor(businessType)` from `grid.ts`; `workspacesMetaFor` from `workspaces.ts` (returns `{useCaseId, label, kickoff}` entries).
- Produces: unchanged signatures; only regex/kickoff content changes.

- [ ] **Step 1: Write the failing tests.** In `workspaces.spec.ts` add a routing-guarantee test:

```ts
import { BUSINESS_TYPES } from './types'; // read types.ts for the actual exported list/guard name; iterate all 6 business types

it.each(BUSINESS_TYPES)('every %s kickoff routes to its own use case', (bt) => {
  for (const ws of workspacesMetaFor(bt)) {
    expect(selectUseCase(ws.kickoff, bt)?.useCaseId).toBe(ws.useCaseId);
  }
});
```

In `router.spec.ts` add natural-phrasing cases (each asserted with a businessType whose grid allows that use case — check `grid.ts`):

```ts
const CASES: Array<[string, UseCaseId]> = [
  ['find me senior fintech candidates in London', 'talent-mapping'],
  ['build a talent pool of data engineers', 'talent-mapping'],
  ['source a shortlist for my Rust role', 'talent-mapping'],
  ['which companies should we pitch this quarter', 'prospecting'],
  ['build a target account list in med-tech', 'prospecting'],
  ['give me a market overview of AI hiring in Berlin', 'market-mapping'],
  ['who are the key players in cyber security recruitment', 'market-mapping'],
  ['what skills does our engineering org lack', 'skill-mapping'],
  ['plan next year headcount for the platform team', 'workforce-planning'],
  ['send me a weekly digest of fintech funding rounds', 'signal-tracking'],
  ['keep an eye on Acme leadership moves', 'signal-tracking'],
];
```

- [ ] **Step 2: Run to verify failures** — `npx jest src/acumen/router.spec.ts src/acumen/workspaces.spec.ts` → new cases FAIL (some may already pass; that's fine).
- [ ] **Step 3: Widen KEYWORDS minimally until green.** Guidance (adapt while keeping existing alternations and the ORDER precedence list intact):
  - `talent-mapping`: add `talent pool`, `source (?:a |me )?(?:a )?(?:shortlist|list|candidates?)`, `find (?:me )?.*(?:candidates?|engineers?|developers?|talent)`
  - `prospecting`: add `target (?:account|client|company) list|target accounts?`, `companies .*pitch|pitch .*companies`, `new (?:clients?|business)`
  - `market-mapping`: add `market (?:overview|intel(?:ligence)?|scan)`, `key players`, `competitor landscape`
  - `skill-mapping`: add `skills? (?:gap|audit|shortage|lack)`, `what skills`
  - `workforce-planning`: add `headcount plan(?:ning)?|plan .*headcount`, `org (?:design|structure)`, `capacity plan`
  - `signal-tracking`: add `digest`, `keep an eye`, `weekly|every (?:week|monday|morning)` combined with a noun clause — keep it anchored (e.g. `\b(?:weekly|daily) (?:digest|briefing|summary)\b|\bkeep an eye\b`) so ordinary sentences don't false-positive.
  Keep `recruitment-research` unchanged. Prefer precision: run the FULL router spec after each addition to catch cross-matches (ORDER means signal-tracking wins ties — make sure new talent phrases don't accidentally hit `track|watch|monitor`).
  If any workspace kickoff still fails the guarantee test, reword that kickoff in `workspaces.ts` to contain its core keyword (kickoffs are product copy — keep them natural, e.g. "Map the talent for a key role…").
- [ ] **Step 4: Run full acumen suite** — `npx jest src/acumen` → all pass.
- [ ] **Step 5: Commit** — `git add packages/api/src/acumen && git commit -m "feat(acumen): widen use-case router and guarantee workspace kickoff routing"`.

### Task 3: Bump profile-fetch timeout

**Files:**
- Modify: `api/server/controllers/agents/acumen.js` (`CONTEXT_TIMEOUT_MS = 1500` → `2500`)
- Test: `api/server/controllers/agents/__tests__/acumen.spec.js`

- [ ] **Step 1:** Check the timeout spec (`describe('acumenContextPart timeout')`) — if it hardcodes 1500, update it to use the new value/fake timers accordingly (read it first; it likely advances fake timers).
- [ ] **Step 2:** Change the constant to `2500`.
- [ ] **Step 3:** `cd api && npx jest server/controllers/agents/__tests__/acumen.spec.js` → all pass.
- [ ] **Step 4: Commit** — `git add api/server/controllers/agents && git commit -m "fix(acumen): allow 2.5s for cold profile resolution"`.

### Task 4: Slim the 360ai persona + deference clause

**Files:**
- Modify: `librechat.yaml` lines ~408–641 (the `360ai` spec's `promptPrefix` ONLY)

**Interfaces:**
- Produces: a promptPrefix ≤ ~8,500 chars that keeps identity, tool mechanics, card/grounding contracts, style — and defers workflow orchestration to the Acumen Live Instruction when present.

Make exactly these edits (keep everything else verbatim):

- [ ] **Step 1:** Replace the seven-bullet "Your role as a recruiter's assistant — help with the full desk:" block (lines ~424–441) with:

```text
          Your role: help with the full desk — business development and lead
          generation, candidate sourcing, company/market research, live roles
          and pipelines, outreach and messaging, screening and shortlisting,
          and the admin that moves a placement forward.
```

- [ ] **Step 2:** Insert a deference clause immediately after the line `behaviour:` (end of the "How you work" intro, ~line 460):

```text
          0. LIVE INSTRUCTION TAKES PRECEDENCE. If your context contains a
             "Live Instruction (Acumen)" section, it defines the session's
             working method (intake, confirmation points, use-case method).
             Follow it over points 1–4 below wherever they conflict; points
             1d, 2, 5, and 6 (tool mechanics, cards, grounding) always apply.
```

- [ ] **Step 3:** Compress section 1 (ANCHOR/INTAKE, lines ~462–490) to:

```text
          1. ANCHOR TO A LIVE ROLE, THEN RUN INTAKE — your default first
             move before any big search. Check whether a new sourcing request
             maps to one of the recruiter's open roles (`list_jobs`; on a
             match confirm it and pull `get_job` to seed the brief).
             Otherwise run a short, friendly intake: ask only the 2–4
             questions that most shape this request (who it's for, driver and
             context, location/remote and seniority, must-haves, database vs
             global pool) and offer sensible defaults so the recruiter can
             just reply "go". Use the identity tool to reference what you
             already know instead of asking it. Skip intake only when the
             details are already given, the recruiter says "just go", or a
             brief is already established.
```

- [ ] **Step 4:** Compress section 3 (PARTNER, lines ~582–599) to:

```text
          3. BE A PARTNER, NOT A VENDING MACHINE — chain through to the
             recruiter's END GOAL. Explain reasoning, surface trade-offs, and
             take the next obvious step yourself; when a request spans phases,
             carry it all the way through rather than ending a phase with a
             "Would you like A or B?" menu. If paths genuinely diverge, pick
             the highest-value one, say so, do it, and invite a redirect. The
             one sanctioned pause besides point 4: a mid-point confirmation
             the Live Instruction asks for.
```

- [ ] **Step 5:** Leave sections 1b, 1c, 1d, 2 (incl. 2a–2e), 4, 5, 6, Identity, Tools & data, and Style untouched.
- [ ] **Step 6: Verify** — `node -e "const y=require('js-yaml'),f=require('fs');const d=y.load(f.readFileSync('librechat.yaml','utf8'));const s=d.modelSpecs.list.find(x=>x.name==='360ai');console.log('chars:',s.preset.promptPrefix.length);if(!/LIVE INSTRUCTION TAKES PRECEDENCE/.test(s.preset.promptPrefix))throw new Error('missing clause')"` → parses, chars ≤ 8500, clause present. Also confirm the other 5 specs unchanged: `git diff librechat.yaml | grep '^-.*name:'` shows nothing.
- [ ] **Step 7: Commit** — `git add librechat.yaml && git commit -m "feat(360ai): slim persona and defer session workflow to Acumen Live Instruction"`.

### Task 5: Rebuild, full verification, backend up

**Files:** none new.

- [ ] **Step 1:** `unset npm_config_prefix; nvm use` (Node 24.16.0), then from repo root: `npm run build:data-provider && cd packages/api && npm run build` (or root `npm run build` if per-package build script is absent — check `packages/api/package.json`).
- [ ] **Step 2:** Verify the built bundle has the new header: `grep -c 'Live Instruction (Acumen)' packages/api/dist/index.cjs` → ≥ 1.
- [ ] **Step 3:** Full test pass: `cd packages/api && npx jest src/acumen` AND `cd api && npx jest server/controllers/agents/__tests__/acumen.spec.js server/routes/__tests__/acumen.spec.js`.
- [ ] **Step 4:** Sanity-compose: `node -e "const a=require('./packages/api/dist/index.cjs');const o=a.composeSystemPrompt({businessType:'recruitment-agencies',brief:'find me senior fintech candidates in London',userContext:'x'});console.log(o.selectedUseCase, o.prompt.slice(0,120))"` → selectedUseCase is talent-mapping (not null) and prompt starts with the Live Instruction header.
- [ ] **Step 5:** Start the backend in the background (`npm run backend:dev`) and confirm port 3080 listens; report to the user that the frontend dev server on 3090 was already running.
- [ ] **Step 6: Commit** anything remaining (should be nothing) and report summary.
