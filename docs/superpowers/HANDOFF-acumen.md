# Handoff prompt — continue the "AI Acumen" feature

Paste everything below into a fresh chat working in `/Users/eth0/Herd/chat.360ai`.

---

You are continuing work on **"AI Acumen"** — a runtime prompt-composition system for **360AI Chat** (this repo, `chat.360ai`, a LibreChat fork that is the chat UI for the 360AI recruiting platform). It assembles ONE system prompt per turn from layered records (precedence, later wins): `In-session brief › User context › Lens › Business profile › Use-case core › Core Foundations`. The engine lives in `packages/api/src/acumen/`.

## Read these first (durable context already on disk — do not start without them)
- **Memory** (auto-loaded via `~/.claude/projects/-Users-eth0-Herd-chat-360ai/memory/MEMORY.md`): `acumen-composer-engine.md` (full architecture + roadmap + blockers), `onboarding-feature.md`, `360ai-agent-suite.md`.
- **SDD ledger**: `.superpowers/sdd/progress.md` — complete task-by-task history of what's built, every commit SHA, and all carried minor findings.
- **Specs/plans**: `docs/superpowers/specs/2026-06-23-acumen-composer-engine-design.md` and `docs/superpowers/plans/2026-06-23-acumen-*.md`.

## What's already DONE and LIVE (do NOT rebuild)
- **#1 Composer engine** — `LayerStore`, 14-cell sparse lens grid, precedence merge, tighten-only hard-constraints, brief→use-case router, renderer, `composeSystemPrompt`, no-restating lint, 28 seeded layer records (1 Foundations + 7 cores + 6 profiles + 14 lenses).
- **#2 Activation via profile fetch** — `business_type` is now first-class on the Laravel company profile; the chat wrapper `api/server/controllers/agents/acumen.js` (`acumenContextPart`) fetches the onboarding profile at request time, normalizes the business type, and composes. Pure composer + async JS wrapper with a per-user TTL cache. Returns null (no change) for users without a saved `business_type`.
- **#3a Workspaces UI** — `GET /api/acumen/workspaces` + `useAcumenWorkspacesQuery` + `client/src/components/Acumen/AcumenWorkspaces.tsx` (landing cards per business type; clicking sends a kickoff message crafted to match the router so the right core+lens composes). Self-hides when empty.

All ~48 backend acumen tests + frontend workspaces tests pass.

## Two repos / two branches (commits stage EXPLICIT paths only — both branches carry unrelated WIP)
- This repo `chat.360ai` on branch **`feat/360ai-result-cards`**.
- Laravel provider (GitHub `360WORK/hire-suite`) at **`/Users/eth0/Herd/360ai`** on branch **`feature/360ai-chat-auth`**. Source of truth for identity + onboarding profiles, reached over MCP/OIDC. After editing Laravel OIDC/profile/tools run `php artisan optimize:clear`.

## What to build NEXT (unblocked — pick up here)
1. **#3b Mid-point confirmation component.** Most cores pause once before the expensive step ("confirm the frame / adjust"). Build a reusable confirm/adjust UI by cloning the onboarding pill mechanism: an agent-emitted marker (`<!--acumen-confirm:...-->` or a fenced block) + a client resolver + a dock. Precedent files: `client/src/components/Onboarding/{OnboardingPillDock,PillOptions,useCurrentOnboardingStep,onboardingSchema}.{tsx,ts}` and the marker instruction in `packages/api/src/onboarding/interview.ts`. You'll also add marker-emission guidance to the Foundations layer (`packages/api/src/acumen/layers/foundations.ts`).
2. **Enable Signal Tracking.** It is ~80% built in the Laravel app but DORMANT: tables `signals`/`signal_runs`/`signal_subscriptions`, the `Signal` model, `app/Console/Commands/SignalsTick.php`, `app/Jobs/Signals/RunSignalJob.php` exist, but `signals:tick` is **commented out** in `bootstrap/app.php` (~line 30). Enabling the cadence + wiring `action_config.tool_plan` execution + delivering digests to the chat feed is real but unblocked backend work.

## BLOCKED — needs a decision/data from the human (flag at the seam; do NOT fake)
- **3 missing MCP tools (#4 capability layer):** the cores assume *Company Identify&Enrich*, *Company Signals retrieval*, and *Live Jobs (market) Search* — these tools do NOT exist in `app/Mcp/Tools/` (only `search_companies`, `search_talents`, `enrich_contact`, recruiter-suite read tools do). You can scaffold them, but they need a **confirmed data source/provider** (live job postings, company funding/headcount/leadership signals). Ask before building empty shells.
- **Outbound (Prospecting) is prod-blocked:** `send_outreach` is gated on the `outreach_credits` slug which is **unprovisioned** (no migration/seeder/Stripe-map). Unblocking is a **billing/pricing decision** + a provisioning path. Same for `enrich_talent_credits`.
- **Workforce Planning is hard-blocked:** no HRIS/headcount/attrition data exists anywhere in the platform (Knit is recruiting-ATS only).

## How to work (conventions that have been followed)
- Use the superpowers flow: **brainstorming → writing-plans → subagent-driven-development**. Write a spec/plan under `docs/superpowers/`, then execute task-by-task with a fresh implementer subagent per task and a reviewer after each; keep the `.superpowers/sdd/progress.md` ledger updated as you go.
- **Per task: TDD** (failing test → red → implement → green → commit). **Commit explicit paths only.** End every commit message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Scope-guard every subagent** explicitly: "do exactly this one task; do not run the full repo suite; do not finish/merge/rebase/push the branch or invoke any branch-completion flow; end after the single commit." (Earlier implementers drifted into branch-finishing prompts without this.)
- **All new backend logic is TypeScript in `packages/api/src/`** (no `any`, avoid `unknown`/`Record<string,unknown>`); `/api` stays thin JS wrappers; shared FE/BE types + query hooks go in `packages/data-provider`; frontend strings via `useLocalize()` (English keys only, in `client/src/locales/en/translation.json`).
- **Tests:** `cd packages/api && npx jest acumen` · frontend `cd client && npx jest <pattern>` (use `render`/`screen` from `test/layout-test-utils`, import `fireEvent` from `@testing-library/react`; mock `~/hooks/Messages/useSubmitMessage` narrowly) · Laravel `php artisan test --filter=<test>`.
- **No automated test covers live prompt behavior** — the human verifies by logging into `https://chat.360ai.test`, completing company onboarding (so `business_type` is saved), and inspecting Mongo `messages`/`conversations`. Backend reloads via nodemon: `touch api/server/index.js`. The composer only "lights up" once a `business_type` is saved.

## Open minor follow-ups recorded in the ledger (triage, not urgent)
`AcumenWorkspaces` isn't gated on `!gateActive` (could show during partial onboarding); a dead `jest.resetModules()` in its null test; the acumen wrapper's `catch` swallows errors with no logging (add `logger.warn` for prod observability); an import-order nit in the workspaces query hook; the `executive-search×signal-tracking` lens openingCopy is paraphrased not verbatim.

Start by reading the memory + ledger, confirm the current branch/state, then pick #3b or Signal Tracking and run it through the spec→plan→subagent-driven flow. Flag the blocked items to the human rather than guessing.
