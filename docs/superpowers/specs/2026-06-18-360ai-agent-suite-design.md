# 360AI Agent Suite — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorm) → ready for implementation planning
**Repos:** `chat.360ai` (LibreChat fork) + `hire-suite` (`/Users/eth0/Herd/360ai`, Laravel)

---

## 1. Purpose & vision

Build the 360AI recruiter agent suite inside the chat product — the named agents already
marketed at `360ai-4aa05f.webflow.io`:

| Agent | Job |
|---|---|
| **AI Headhunter** | Source talent globally, enrich verified contacts, send personalized outreach |
| **AI Shortlister** | Screen/score/rank CVs against a job spec (bias-aware) |
| **AI Prospector** | Client BD / GTM — talent, skill & market mapping, signal tracking |
| **AI Reviver** | Refresh, dedupe & enrich ATS/CRM data; surface net-new talent |
| **AI Researcher** | Company & market deep research |
| **360AI Agents** | Umbrella / end-to-end automation |

**Key finding that makes this feasible:** the heavy backend already exists in `hire-suite`.
The MCP server (`app/Mcp/Servers/RecruitingServer.php`) already defines **11 tools** (only 5
active); the data-vendor and action layer is integrated as services — **Affinda** (CV parsing),
**ContactOut / PeopleDataLabs / ProxyCurl / RapidApi** (sourcing + verified contacts),
**Crustdata** (company/job intel), **Unipile** (multi-channel outreach), **Knit** (ATS),
**Signals/** (signal tracking), **Apply/** (CV scoring, `ApplyEvaluationScore`, `ai_evaluation`).

So this program is **composition, not from-scratch construction**: expose existing Laravel
capabilities as MCP tools, wire them + result-cards into chat, and author each agent's persona.

---

## 2. Architecture decision — Option A (chosen)

**Each agent is an admin-configured LibreChat Agent record + a `librechat.yaml` model spec.**
Users pick the agent from the model/agent picker. Rejected alternatives: a single umbrella
agent that routes via prompt modes (B — bloated tool list hurts tool selection, no per-agent
metering), and nested sub-agents (C — immature in this fork, heaviest to build).

Consequences:
- **Orchestration = the native LibreChat agent loop** (system prompt + curated tool subset +
  iterative tool-calling). No custom JS orchestration engine.
- Each agent keeps a **tight tool list** → better tool selection.
- **Per-agent metering for free** via the existing `AgentToolInvocation` log + feature credits.
- Honors the fork's existing model: `agents: { use: true, create: false }` — admin-seeded,
  users don't build their own.

---

## 3. Program decomposition

Each sub-project gets its own spec → plan → build cycle. **Build order: 0 → 1, then fan out 2–5.**
Sub-project 1 (Headhunter) is the end-to-end reference because it touches every layer
(read tools, a write tool, native orchestration, new cards).

| # | Sub-project | New MCP tools | Repos |
|---|---|---|---|
| 0 | **Agent Foundation** (shared) | activate 6 existing tools | chat + Laravel |
| 1 | **AI Headhunter** | `enrich_contact` (read), `send_outreach` (write) | both |
| 2 | **AI Shortlister** | `score_resume`, `parse_cv`, `bulk_evaluate` | both |
| 3 | **AI Prospector** | `map_market`, `track_signals` | both |
| 4 | **AI Reviver** | `audit_records`, `enrich_talent`, `dedupe` | both |
| 5 | **AI Researcher** | reuses search + web | mostly chat |

This spec details **Sub-project 0 + Sub-project 1**. Sub-projects 2–5 are scoped at the
roster level here and get their own specs later.

---

## 4. Sub-project 0 — Agent Foundation

### 4.1 Activate existing MCP tools (Laravel)
Uncomment in `RecruitingServer::$tools`: `SearchCandidates`, `GetCandidate`, `GetJob`,
`PipelineStages`, `StageCandidates`, `GetUsage`. They follow the existing
`Tool` + `schema()` + `handle()` pattern and are already `#[IsReadOnly]`.

### 4.2 Write-tool safety pattern (Laravel + chat)
Today all tools are `#[IsReadOnly]`. Write tools (outreach, ATS push) follow a
**preview → confirm** contract:
- Called **without** `confirm: true` → returns `{ status: "preview", … }` containing the
  drafted action (message body, recipient, channel, credit cost). **Nothing leaves the platform.**
- The agent surfaces the preview as a confirm-card; the tool is only re-called with
  `confirm: true` after an explicit user click.
- Write tools check `ClientFeatureCredit` before acting and are metered like reads.

This is a foundation-level invariant: **no outbound side effect without an explicit human click.**

### 4.3 Card-renderer registry (chat)
Refactor the `tools.ts` name→kind map and the `index.tsx` if/else chain into a single
`registry: Record<toolName, { kind; render }>` so adding a new result type = one entry.
`AI360ToolResult` becomes closed-for-modification / open-for-extension. New cards reuse the
existing shared atoms (`Pill`, `Avatar`, `SkillChips`, `CopyButton`, `ExpandableText`, `LinkButton`).

### 4.4 Spec + agent wiring (chat)
- Extend `librechat.yaml` model specs from the single enforced spec to a **list of 6**, each
  pinned to a seeded Agent record (system prompt + tool subset).
- Add a seeder/migration for the 6 admin Agent records.
- Localize all 6 agent names + descriptions in `client/src/locales/en/translation.json`
  (English keys only; `com_ui_` / `com_agents_` prefixes).

### 4.5 Foundation acceptance
- All 11 MCP tools reachable by an admin agent.
- A throwaway write tool exercised through preview → confirm → effect in a test.
- Registry renders existing card kinds unchanged (no regression in current AI360 tests).
- 6 specs appear in the picker; selecting one loads the right tool subset.

---

## 5. Sub-project 1 — AI Headhunter (reference template)

**Flow:** source globally → present shortlist → on pick, enrich verified contacts → draft
tailored outreach → preview-card → on confirm, send → report.

### 5.1 Tools
- **Read (activate existing):** `search_talents` (`pool: "global"` = Crustdata/PDL), `get_candidate`.
- **New read — `enrich_contact`:** wraps `App\Services\ContactOut\ContactOutService`; input a
  candidate id/profile, returns verified email/phone/socials + confidence. `#[IsReadOnly]`, metered.
- **New write — `send_outreach`:** wraps `App\Services\Unipile\Resources\MessageResource`;
  channel ∈ {email, linkedin, whatsapp}, recipient, body. Implements the §4.2 preview/confirm
  contract; checks credits; not idempotent.

### 5.2 Native orchestration
The agent loop is driven by the Headhunter system prompt: prefer `search_talents` with the
user's verbatim request in `query`; refine filters when results are thin; never call
`send_outreach` with `confirm: true` until the user has clicked **Send** on the preview card.

### 5.3 New cards (chat)
- `ContactCard` — verified contacts + confidence badges.
- `OutreachPreviewCard` — editable draft, recipient, channel selector, **Send** button,
  credit-cost line. Drives the confirm step.
- Talent results reuse the existing `TalentCard`.

### 5.4 Cross-repo work summary
- **Laravel:** 2 new tool classes (`EnrichContact`, `SendOutreach`) + register in
  `RecruitingServer`; activate 2 commented tools.
- **Chat:** 2 new cards + 2 registry entries; Headhunter agent record + model spec; locale keys.

### 5.5 Headhunter acceptance
- Natural-language sourcing returns talent cards from the global pool.
- Enrich on a picked candidate returns verified contacts.
- Drafting produces an `OutreachPreviewCard`; **no send occurs** until confirm.
- Confirm sends via Unipile and reports success; the action is metered.

---

## 6. Testing

Per `CLAUDE.md`: real logic over mocks. **Laravel** — exercise tool `handle()` + schema with
real services; mock only the external vendor HTTP boundary (ContactOut, Unipile). Assert the
preview/confirm gate (no side effect without `confirm: true`) and credit checks.
**Chat** — `__tests__` beside each new card (loading/success/error) + registry dispatch tests;
keep existing AI360 tests green.

---

## 7. Out of scope (this spec)

Detailed design of Sub-projects 2–5 (Shortlister, Prospector, Reviver, Researcher) — each gets
its own spec. New outbound channels beyond what Unipile already supports. Any change to the
OIDC/auth layer.
