# Company Grounding (resolve_companies) + Conversation-Derail Fix

**Date:** 2026-07-16
**Repos:** `/Users/eth0/Herd/360ai` (Laravel — part B backend) + `/Users/eth0/Herd/chat.360ai` (parts A and B chat-side)
**Status:** Approved by Eluert ("tackle everything").

## Problems (both evidenced in the "European Cybersecurity Team Expansion Search" export)

**A — Mid-conversation derail.** User replied "1" to the assistant's own numbered "Recommended Next Steps"; the model called `get_onboarding` + `desk_snapshot`, decided it was "a fresh session opening", and launched the plan-my-day desk-health greeting, abandoning the BD thread. Root causes: (1) the plan-my-day/desk-snapshot routine is not scoped to conversation start; (2) no rule maps terse replies ("1", "yes", "go") to the assistant's own most recent offer.

**B — Inline cards are display-only dead ends.** Web-researched companies render as cards (shipped) but have no path into our data. `search_companies` reads internal data only. The Laravel app already has company import/enrichment machinery (`UnifiedCompanySearchService`, `CrustdataCompanyImporter`, `EnrichCompanyBy{Domain,UniversalName}` jobs). Close the loop: name + linkedin/domain → internal match → else Crustdata import → internal entity.

## Part A — Prompt derail fix (chat.360ai, librechat.yaml only)

1. **Scope plan-my-day:** the desk_snapshot greeting/intake routine (360ai spec section 1b; verify which other specs carry it) runs ONLY on the first assistant turn of a conversation, or when the user explicitly asks about their desk/pipeline/day. Mid-conversation it is forbidden.
2. **Terse-reply mapping rule:** when the user replies with a bare number, letter, or short affirmation ("1", "option 2", "yes", "go", "do it"), map it to the assistant's own most recent numbered list/offer/question and continue that thread. Never re-anchor, never re-run intake, never call desk_snapshot in response to a terse reply.
3. Keep each addition tight (≤6 lines per spec). Apply to every spec that carries the plan-my-day routine and/or offers numbered next steps (verify against librechat.yaml; at minimum `360ai`; likely all six for the terse-reply rule — verify and decide by remit).

## Part B — resolve_companies trigger + poll

### Laravel: new MCP tool `resolve_companies`

- **Input:** `companies: [{name: string (required), linkedin_url?: string, domain?: string}]`, max 10 per call; batch, like `get_candidates`.
- **Matching (internal first):** per entry, match internally in order: linkedin universal name (from linkedin_url) → domain → name (exact-ish). Use existing company lookup services — the plan must verify the real seams (`UnifiedCompanySearchService` etc.) and pick the cheapest correct one.
- **Output envelope:** `{count, companies: [...], not_found: [...], import_pending: bool, poll_after_seconds?: 8}` where `companies` entries reuse the same payload shape `search_companies` returns (cards already render it), plus `matched_by: 'linkedin'|'domain'|'name'`.
- **Unmatched entries with a linkedin_url or domain:** queue a Crustdata company import (existing importer/enrichment jobs — plan verifies the seam; queue `background-search` conventions from SP2), set `import_pending: true` + `poll_after_seconds: 8`. Re-poll contract identical to `search_talents` (documented in tool description + server instructions, stop after 2-3 re-polls). Name-only entries that don't match internally go to `not_found` without import (too ambiguous to import blind) — the model keeps its inline card for those.
- **Dedupe guard:** per-entry cache marker (hash of linkedin/domain), mirroring SP2's `:queued` pattern; skip re-queuing while in flight or recently imported. **NO per-user credit checks** (platform-level Crustdata integration — standing decision).
- Registered on `RecruitingServer`; `#[IsReadOnly]` semantics reviewed honestly (it queues imports — mirror however `search_talents` handles the same question post-SP2).

### chat.360ai

- Map `resolve_companies` → the existing companies card rendering in `AI360/tools.ts`/`parse.ts` (same kind `search_companies` uses; envelope parsing mirrors `get_candidates` batch handling: `companies`/`not_found`/`count`; defensive shapes per house style).
- **Prompt (ground-first upgrade):** in the 3 card-emitting specs, the ground-first rule now says: for named companies you will recommend, call `resolve_companies` ONCE with the batch of name+linkedin/domain pairs (from your web research); matched → internal card renders (do not emit inline card); `import_pending` → re-poll per the standard contract, and while pending you may show the inline card, replacing it on the next poll if the company lands; `not_found` name-only → inline card stays. One rich presentation per entity remains the law.
- `search_companies` stays the tool for filter-based discovery; `resolve_companies` is for grounding named entities.

## Delivery order

A first (tiny, unblocks live conversations), then B (Laravel branch `feat/mcp-resolve-companies` off `feature/360ai-chat-auth`; chat work continues on `feat/360ai-result-cards` after A's commit).

## Testing

- A: yaml parse + content assertions (established pattern); read-whole-prompt contradiction check (the deep-dive and card rules must survive).
- B Laravel: Pest, isolated files; tests for matching precedence, batch cap, import queueing + dedupe marker, envelope shape, config-disabled gate.
- B chat: jest for the tools.ts/parse.ts mapping; yaml checks for the prompt upgrade.

## Out of scope

- Auto-replacing an already-rendered inline card in an *earlier* message (cards upgrade on the next tool result, not retroactively).
- People-resolution (`resolve_talents`) — future; talents already have the search_talents trigger+poll path.
- Per-user credit checks (excluded by standing decision).
