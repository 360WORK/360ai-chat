# Signals Management UI in chat.360ai — Plan

Goal: let a user create / list / run-now / delete their Signals from inside
chat.360ai (a React page), not agent.360ai. Date: 2026-06-23.
Spec ref: builds on `docs/superpowers/specs/2026-06-23-signals-chat-surface-design.md`.

## Constraint (established earlier)
chat.360ai ↔ Laravel = MCP only (internal REST API is session-cookie only).
So management ops must be NEW MCP tools on the provider, proxied through
chat.360ai `/api` services (reuse `callSignalTool` in
`api/server/services/SignalsDelivery.js`).

## Laravel repo (`feature/360ai-chat-auth`) — new MCP tools
Mirror `GetSignalRuns` / `GetOnboarding` (AgentContext, IsReadOnly where true).
Reuse `StoreSignalRequest` rules + `CronEvaluator`.
- **M1 `create_signal`** (schema args: name, description?, type, trigger_config{cadence_cron,timezone?}, action_config{agent_key,prompt_template,tool_plan[]}, delivery_channels[]). Validates like StoreSignalRequest (incl. cron isValid), creates Signal (client_id from currentClient, user_id, is_active, next_run_at via CronEvaluator::nextRun, created_via='chat'). Returns the signal. **Not read-only.**
- **M2 `run_signal_now`** (schema arg: signal_id). Authorize ownership; dispatch `RunSignalJob` (triggered_by='manual'); return `{signal_run_id}`. (Synchronous vs queued: mirror SignalsController::run intent — manual runs sync for feedback; but MCP over chat — dispatch + return queued id is safer. Decide in impl.)
- **M3 `delete_signal`** (schema arg: signal_id). Authorize; soft-delete; return `{deleted:true}`.
- Register all on RecruitingServer. Pest tests (create happy + cron-invalid + wrong-client; run-now ownership; delete ownership).

## chat.360ai repo (`feat/360ai-result-cards`)
**data-provider:** `TSignal` (id,name,description,type,isActive,nextRunAt,lastRunAt,deliveryChannels), `TSignalCreateInput`, endpoints (`/api/signals`, `/api/signals/:id/run`, `/api/signals/:id`), keys, dataService methods (getSignals/createSignal/runSignalNow/deleteSignal), hooks (`useSignalsQuery`, `useCreateSignal`, `useRunSignalNow`, `useDeleteSignal`).
**/api (thin JS, reuse callSignalTool):** `routes/signals.js` extend — `GET /` (list via get_signal_runs signals[]), `POST /` (create via create_signal), `POST /:id/run` (run_signal_now), `DELETE /:id` (delete_signal). requireJwtAuth; try/catch safe.
**client page:** `client/src/components/Signals/SignalsManager.tsx` — list (cards: name/type/cadence/next run + Run now / Delete), create form (name, type, cron, prompt template, tool plan chooser, delivery channels). Localized. Mounted at route `/signals` + a left-nav entry.
**Route + nav:** add `/signals` lazy route in `Routes/index.tsx`; add nav item.

## Tasks (TDD, explicit-path commits, co-author trailer)
1. Laravel M1 create_signal (+test) → commit
2. Laravel M2 run_signal_now (+test) → commit
3. Laravel M3 delete_signal (+test) → commit
4. chat data-provider types/endpoints/hooks → commit
5. chat /api signals routes → commit
6. chat SignalsManager page + route + nav → commit

## Non-goals (defer)
- Editing an existing signal (create + delete + run-now covers the common loop; update is additive later).
- Rich cron builder UI (plain cron input + a few presets; validate server-side).
- Per-run history view in chat (the Signals conversation already shows digests).
