# Crustdata Deep-Dive: Search Fidelity, Live Sourcing & Autonomous Analysis

**Date:** 2026-07-16
**Repos:** `/Users/eth0/Herd/360ai` (Laravel platform — sub-projects 1 & 2), `/Users/eth0/Herd/chat.360ai` (this repo — sub-project 3)
**Status:** Approved by Eluert ("deliver all of them"). No per-user credit checks on Crustdata (see decision below).

## Problem

The 360AI Chat assistant feels shallow: it "tries a few things and then stays with that." Investigation found three root causes:

1. **The SearchTerm → Crustdata mapping is materially lossy.** ~15 of ~40 searchable fields are silently dropped, two search modes are effectively broken, operators are over-strict, and results are hard-capped at 200.
2. **MCP `search_talents` never reaches Crustdata live.** It reads the pre-seeded Elasticsearch index only; live sourcing happens exclusively through the web talent-finder's `/talent-finder/query/update` endpoint. Chat sessions only see what previous talent-finder sessions happened to seed.
3. **The chat agent loop can't go deep.** No `recursion_limit` override (framework default caps tool calls), no per-candidate analysis choreography in the prompt, no batch profile fetch, no guidance on when to verify companies online.

## Decision: cost model

**No per-user credit checks on Crustdata sourcing.** 360AI integrates with Crustdata at the platform level; users pay 360AI for data access. The only guard on seeding is the existing 30-min filter-hash dedupe cache (avoids duplicate fetches for identical searches). Contact credits continue to gate `enrich_contact` only.

---

## Sub-project 1 — Fix SearchTerm → Crustdata mapping (Laravel)

Key files: `app/TalentLookup/Crustdata/CrustdataLookup.php`, `app/TalentLookup/SearchTerm.php`, `app/Services/Crustdata/CrustdataPersonSearcher.php`, `app/Services/Crustdata/Mappers/CrustdataPersonMapper.php`, `app/Services/Crustdata/Resources/PersonResource.php`. Crustdata API reference: `crustdata.md` (persondb/search §2491–3060). Operator semantics: `(.)` = fuzzy/contains, `[.]` = exact token, `=` = exact, `in`/`not_in` = set membership.

Fixes, ranked by impact:

1. **Boolean/free-text search sends nothing.** `boolean_query`, `query`, and `required_keywords` produce no Crustdata condition — `SearchTerm::hasAppliedFilters()` returns true (`SearchTerm.php:579`) but `buildFilters()` yields `[]` → empty result. Map them to `headline`/`summary` fuzzy `(.)` conditions (`required_keywords` as AND terms; boolean/query decomposed into OR/AND groups as supported).
2. **`roles`/`subroles` dropped.** Role-only searches send no title filter at all; `applySubroles()` expands roles → subroles that go nowhere. Map to a `current_employers.title (.)` OR-group (or `function_category` where it fits).
3. **Keyword excludes are a no-op.** `keyword_exclude_all/any` → `headline not_in <keyword>` compares full-headline equality against a keyword (`CrustdataLookup.php:468-474`). Rewrite with real negative-contains semantics.
4. **`soft_skills` dropped.** Fold into the `skills (.)` OR-group (`CrustdataLookup.php:508`).
5. **Over-strict geo operators.** `region` uses `[.]` exact-token (`:388`) — switch to `(.)` fuzzy; `countries`/`continents` use `=` (`:409`, `:426`) — switch to `(.)` per Crustdata docs recommendation (`crustdata.md:151`).
6. **Raise result caps.** `max_total` default 200 (`CrustdataLookup.php:39`), page limit 100 (`CrustdataPersonSearcher.php:32`) → ~2 pages max. Make `max_total` configurable and raise the default (e.g. 500 sync path; the queued `BackfillCrustdataTalents` already does 1000).
7. **Remaining dropped fields** where Crustdata supports an equivalent: `education_levels`, `industry_groups`, `must_have_phone`, `must_have_skills`, `must_have_industry`. Document as unsupported any that have no Crustdata filter (`interests`, `networks`, `excluded_networks`).
8. **Response-side:** stop hardcoding `phone_numbers` to `[]` in `CrustdataPersonMapper` (`:103`) if the payload has them; fix the `open_to_work` column/value mismatch (`linkedin_open_to_cards`='opento-work' filter vs mapper reading `open_to_cards` for `CAREER_INTEREST`, `CrustdataLookup.php:580` vs Mapper:122).

**Testing:** unit tests asserting the exact filter payload built from representative SearchTerms (boolean-only, roles-only, keyword-exclude, geo, full kitchen-sink). Follow the repo's existing test conventions; note the local test-suite caveat from the Laravel 13 upgrade.

## Sub-project 2 — Live Crustdata sourcing from MCP (Laravel, trigger + poll)

Today `TalentSearchService::search()` (`app/Services/Agent/TalentSearchService.php:28`) creates the query via `QueryManager::create()` (which queues only PDL/LinkedIn — `config('suite.talent_lookup.live')`, `suite.php:14`) then reads ES. `CrustdataSeeder::seed()` is invoked only by `TalentFinderQueryController.php:20-23`.

Design — mirror the web flow's eventual model, stay inside the 60s MCP client timeout:

- In `TalentSearchService::search()`, when the query is fresh (`was_just_created`) and pool is global: **queue** Crustdata seeding (a job wrapping `CrustdataSeeder::seed($term)` — same pattern as `SeedTalentPoolForJob`), then return current ES results immediately with `fresh_results_pending: true` and the query id.
- The 30-min filter-hash cache inside the seeder remains the dedupe guard; when the cache is warm, skip queueing and return `fresh_results_pending: false`.
- Re-polling: the assistant re-calls `search_talents` with the same term seconds later; seeded results now appear from ES. Include a hint field in the tool response (e.g. `poll_after_seconds`) and document the behavior in the tool description/server instructions so the model knows to re-poll.
- **No per-user credit check** (platform-level integration; see decision above).

**Testing:** service-level tests that a fresh global search dispatches the seeding job and flags `fresh_results_pending`; warm-cache searches don't.

## Sub-project 3 — Autonomous deep-dive experience (chat.360ai, option A)

The dream session: *"find me senior Laravel devs for job X"* → the assistant searches (re-polling for fresh Crustdata results), pulls the full profile of each top candidate, verifies current companies (internal `search_companies` + native web_search), and returns ranked result cards with per-candidate fit reasoning — autonomously in one turn.

1. **Raise the agent loop ceiling.** Set `recursion_limit` on the model specs in `librechat.yaml` (specs at `:385-407`) high enough for search → ~10× `get_candidate` → company checks → synthesis (target ≥ 50; verify the exact mechanism via `resolveRecursionLimit`, `api/server/controllers/agents/client.js:1128`).
2. **Prompt choreography** in the `promptPrefix` (`librechat.yaml:408-555`): prescribe the deep-dive loop explicitly — (a) search with rich filters; (b) if `fresh_results_pending`, continue other work then re-poll; (c) for each shortlisted candidate call `get_candidate`, analyze full history against the job; (d) verify each current company via `search_companies` and web_search when signals are thin or stale (funding, layoffs, hiring); (e) deliver a ranked shortlist with per-candidate fit rationale and evidence. Keep autonomy rule: pause only for billable/irreversible actions (`enrich_contact`, `send_outreach`).
3. **Batch profile fetch (Laravel helper for this sub-project):** add a `get_candidates` MCP tool (ids[], max ~10) returning full profiles in one call, so deep-dives don't burn 10 recursion steps on round-trips. Contacts stripped, same as `get_candidate`.
4. **Result cards:** reuse the existing `feat/360ai-result-cards` components (`client/src/components/Chat/Messages/Content/AI360/`); map `get_candidates` to the existing TalentCard rendering in `AI360/tools.ts`.

**Testing:** jest for the tools.ts mapping additions; source-level verification of yaml spec changes (browser QA is unreliable per known limitation — validate prompts by direct API smoke test against the backend where feasible).

## Delivery order & dependencies

1 → 2 → 3. Sub-project 1 is pure bug-fixing and benefits web talent-finder immediately. Sub-project 2 depends on 1 only in the sense that fixed mapping makes seeded data match intent. Sub-project 3's re-poll choreography depends on 2's `fresh_results_pending` contract; its other pieces (recursion limit, deep-dive loop, batch tool) are independent.

## Out of scope

- Crustdata's own MCP server (we use their REST API; no MCP-to-MCP client exists or is needed here).
- Outreach/signals changes; contact-credit billing changes.
- PDL/LinkedIn source improvements (separate async path, untouched).
