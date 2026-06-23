# Signals → chat.360ai Surface — Implementation Plan

Spec: `docs/superpowers/specs/2026-06-23-signals-chat-surface-design.md`. Date: 2026-06-23.

Two repos. Commits stage EXPLICIT paths only (both branches carry unrelated WIP). Trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Conventions recap
- New chat-repo backend logic = TS in `packages/api/src/` (no `any`); `/api` stays thin JS.
- Shared DTOs/hooks in `packages/data-provider`. FE strings via `useLocalize()` (en keys only).
- Tests: `cd packages/api && npx jest signals` · `cd client && npx jest <pattern>` ·
  Laravel `php artisan test --filter=…`. After Laravel edits: `php artisan optimize:clear`.
- chat.360ai ↔ Laravel = MCP only (`api/server/services/Onboarding.js` `callOnboardingTool`,
  server name `360ai`, Bearer `{{LIBRECHAT_OPENID_ACCESS_TOKEN}}`). Mirror it verbatim.
- Marker/strip precedent: `client/src/components/Onboarding/onboardingSchema.ts` (`ONBOARDING_STEP_MARKER`, `stripOnboardingMarkers`).
- Endpoint precedent: `api/server/routes/acumen.js` (`requireJwtAuth`, try/catch → safe).
- Persist msg: `saveMessage` (`packages/data-schemas/src/methods/message.ts`, upsert on
  `messageId`+`user`, needs UUID `conversationId`). Persist convo: `saveConvo`.

---

## Laravel repo (`/Users/eth0/Herd/360ai`, branch `feature/360ai-chat-auth`, HEAD 9158b1ef)
NOTE: this repo is reachable via shell only (file tools locked to chat.360ai). Edits via
heredoc/sed; tests via `php artisan test`. Stage explicit paths.

### Task L1 — enable signals:tick cadence
- Uncomment the `signals:tick` schedule line at `bootstrap/app.php:30`.
- `php artisan optimize:clear`.
- Verify (dev, controlled): `php artisan signals:tick` → `queue:work --stop-when-empty`
  (timeout 120s) → confirm 4 due `signal_runs` transition to `succeeded`/`failed` with a
  `summary`; `signals.next_run_at` advanced. (OpenAI key is set; tools read-only.)
- Commit (explicit path `bootstrap/app.php`): `feat(signals): enable signals:tick schedule cadence`.
- NOTE for reviewer: enabling is inert without a running scheduler + worker in prod; document
  the run commands in the commit body.

### Task L2 — MCP tool `get_signal_runs`
- Create `app/Mcp/Tools/GetSignalRuns.php` mirroring `GetOnboarding.php`
  (`#[IsReadOnly] #[IsIdempotent]`, `name='get_signal_runs'`, empty schema,
  `AgentContext::fromRequest($request)` → user/client). Returns spec §6.1 shape:
  `{ signals:[…], runs:[…] }`. `runs` = latest 25 across the user's own signals + subscribed
  signals, created ≤30d ago, status ∈ succeeded/failed/no_change, summary for succeeded/failed,
  latest-first. Exclude other users' runs.
- Register on the recruiting MCP server (same place `get_onboarding`/`search_companies` are
  registered — verify the exact registration site before editing).
- Pest test (`tests/Feature/GetSignalRunsToolTest.php` or unit per existing convention):
  own runs returned; other-user runs excluded; subscriptions included; cap=25; 30d horizon;
  empty summary omitted cleanly.
- `php artisan optimize:clear`. `php artisan test --filter=GetSignalRuns`. Commit explicit paths.

---

## chat.360ai repo (branch `feat/360ai-result-cards`, HEAD 8d8ef4e9f)

### Task C1 — data-provider DTOs + sync hook
- `packages/data-provider`: `TSignalRun` (`id`, `signalId`, `signalName`, `status`,
  `summary?`, `createdAt`), `TSignalsSyncResponse` (`{ delivered: number }`), `SignalRunsQueryKey`.
- `useSignalsSync()` hook (react-query v4 positional) — calls `GET /api/signals/sync`;
  enabled only when authed; failures silent (retry off). (Hook wires into UI in C4.)
- Build + tsc clean. Jest for the query key + mapper if pure.
- Commit.

### Task C2 — `packages/api/src/signals/` delivery core (TDD, TS, no `any`)
Files: `packages/api/src/signals/{dto.ts,fetch.ts,delivery.ts,index.ts}` + `*.spec.ts`.
- `callSignalTool(user, toolName, args)` — clone of `callOnboardingTool` (server `360ai`).
- `getRecentSignalRuns(user): Promise<TSignalRun[]>` — calls `get_signal_runs`, maps snake→camel.
- `formatDigest(run): { text: string; messageId: string }` —
  `text = run.summary + "\n\n<!--signal-digest:"+run.id+"-->"`; `messageId` =
  deterministic uuid from a namespace (`'signal-digest'` + runId → uuid v5 stable).
- `resolveSignalsConversation(user): Promise<string>` — read `user.signalsConversationId`;
  if set + convo exists, return it; else create UUID, `saveConvo` (title 'Signals',
  endpoint/agent 360AI), persist id on user doc (`updateUser`), return it.
- `deliverNewSignalRuns(user): Promise<{ delivered: number }>` — fetch runs; filter out ids in
  `user.deliveredSignalRunIds`; for each: `saveMessage({user, messageId, conversationId,
  role:'assistant', sender:'Assistant', text, parentMessageId: <signals-root or previous>,
  isCreatedByUser:false, …})`; append delivered ids (cap 200, newest-first, dedup).
  swallow fetch errors → `{ delivered: 0 }`.
- Export via barrel + `packages/api` package export (mirror acumen exports).
- Jest: formatDigest marker + stable id; dedup skips already-delivered; one message per new
  run; conversation created once then reused; cap enforced; fetch error → {delivered:0}.
  Mock `callSignalTool`, `saveMessage`, `saveConvo`, `updateUser`, `getConvo`/user doc.
- `cd packages/api && npx jest signals` green; tsc clean. Commit.

### Task C3 — `GET /api/signals/sync` endpoint (thin JS)
- `api/server/routes/signals.js` mirroring `acumen.js`: `requireJwtAuth`;
  `router.get('/sync', …)` → `const { delivered } = await deliverNewSignalRuns(req.user)`;
  `res.json({ delivered })`; try/catch → `{ delivered: 0 }`.
- Mount in `api/server/index.js`: `routes.signals = require('./routes/signals')` +
  `app.use('/api/signals', routes.signals)`. (Edit the routes barrel `routes/index.js` if
  that's where `routes.acumen` is registered — verify.)
- `touch api/server/index.js` (nodemon reload). Jest/Integration: auth required; returns
  `{delivered}`; error-safe. Commit.

### Task C4 — client: strip marker + wire sync + invalidate
- Extend strip: add `SIGNAL_DIGEST_MARKER = /<!--\s*signal-digest:([a-z0-9_-]+)\s*-->/gi`
  to `onboardingSchema.ts` (or a sibling `signalsSchema.ts`) and include it in the strip used
  by `MessageContent.tsx`/`Parts/Text.tsx` (which already call `stripOnboardingMarkers`).
  MVP: strip only (no rich renderer).
- Wire `useSignalsSync()` somewhere app-wide + on focus (e.g. alongside onboarding starters in
  `ChatView` or a top-level effect); on success invalidate the active conversation's messages
  query + conversation list so the new Signals message appears.
- Localize any visible strings (header/title for the Signals conversation surface — none if
  MVP just injects into existing conversation list).
- Jest: marker stripped from rendered text. Commit.

---

## Acceptance (human verifies live)
1. Laravel: `signals:tick` + worker → `signal_runs` populated with summaries.
2. chat.360ai: after sync, a "Signals" conversation appears for an onboarded user with digest
   assistant messages; re-running sync does not duplicate (idempotent); marker not shown.

## Scope guards for subagents (paste verbatim into each dispatch)
"Do exactly this ONE task. Do not run the full repo test suite — only the test named for this
task. Do not finish/merge/rebase/push the branch or invoke any branch-completion flow. Stage
EXPLICIT paths only. End after the single commit with the co-author trailer."

## Deferred (not this plan)
Per-user push transport; propose_signal create-from-chat; rich card rendering; unread badge;
M2/M3 signal types; email/Slack channels.
