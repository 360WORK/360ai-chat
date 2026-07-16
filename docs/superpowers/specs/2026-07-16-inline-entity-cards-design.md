# Inline Entity Cards + Grounding Rule (Approach C)

**Date:** 2026-07-16
**Repo:** `/Users/eth0/Herd/chat.360ai` only (no Laravel changes)
**Status:** Approved by Eluert ("go with c").

## Problem

Result cards render only from MCP tool results (`ToolCall.tsx` → `AI360/tools.ts`). In research/BD flows the model synthesizes companies, talents, and decision-makers from `web_search` into prose/tables — verified in the "Cybersecurity Hiring in Europe" export (19 web_search calls, zero `search_companies`/`search_talents` calls) — so high-value entities render as plain text. Two gaps: (1) no rendering path for entities without a tool result; (2) no choreography telling the model to ground presented entities in internal tools.

## Design

### Phase 1 — Inline entity cards (renderer + prompt)

**Contract:** the model emits fenced code blocks in its markdown whose language tag is `360ai-card`, body = one JSON object:

```
{ "kind": "company" | "talent", ...fields }
```

- `company` fields (all optional except `name`): `name`, `location`, `industry`, `size`, `signal` (short free text — funding/hiring/news hook), `url`, `linkedin_url`, `summary`.
- `talent` fields (all optional except `name`): `name`, `title`, `current_company`, `location`, `linkedin_url`, `summary`, `signal`.
- One card per block. Multiple blocks may appear in sequence (renders as a list/grid consistent with existing `ResultList`).

**Renderer:** in the chat markdown pipeline (the `code` component override in the Markdown renderer), intercept blocks with language `360ai-card`:
- Parse JSON with the same defensive style as `AI360/parse.ts` (`isRecord` guards; no `any`).
- `kind: company` → existing `CompanyCard`; `kind: talent` → existing `TalentCard` (normalize fields to their prop types; reuse existing types — no duplicates).
- Malformed/incomplete JSON (including mid-stream while the block is still streaming) → render nothing (empty span), NOT the raw code block; once the fence closes and parses, render the card. If the fence closes and JSON is still invalid, render nothing (silent degrade — never show raw JSON to end users).
- URLs go through the existing safe-href handling used by the cards (no new XSS surface).

**Prompt rules (Phase 1 part):** in the specs whose remit includes research/BD — `360ai`, `prospector`, `researcher` (verify exact set against librechat.yaml; `headhunter` only if it presents companies) — add a compact rule: when presenting specific companies or people as targets, shortlists, or key decision-makers, emit a `360ai-card` block per entity (with the fields you actually know — never invent values) alongside your analysis; keep tables for comparative overviews, cards for the entities you recommend acting on.

### Phase 2 — Grounding rule (prompt-only)

Add to the same specs: **ground-first**. Before presenting named companies/people as recommendations: try internal tools first — `search_companies` (companies) / `search_talents` or `search_candidates` (people), batched sensibly and capped (look up at most the entities you will actually recommend, e.g. top 5–10, one search each or combined filters — not every name mentioned). If found internally → rely on the tool result (real linked data; card renders automatically; do not duplicate it with an inline card). If not found internally → emit the inline `360ai-card` from web-researched facts. Never block the answer on lookups — if a lookup fails or times out, fall back to inline cards.

Dedupe rule: an entity gets ONE rich presentation — tool-result card OR inline card, never both.

## Non-goals

- No Laravel/MCP changes; no new tools.
- No card actions/buttons for inline (web-only) entities beyond links (no stage/enrich actions — those need internal ids).
- No retroactive re-rendering of old conversations.

## Testing

- Jest for the renderer interception: valid company card, valid talent card, malformed JSON (renders nothing), streaming-partial block (renders nothing until closed), non-`360ai-card` languages untouched (regular code blocks still render).
- Parser/normalizer unit tests in the AI360 test suite style.
- Prompt edits verified via the established yaml parse + content assertions.

## Risks

- Model emits slightly-off JSON → silent degrade (acceptable; prompt shows an exact example to minimize).
- Streaming flicker → mitigated by render-nothing-until-parseable.
- Prompt bloat → keep the rule + one example tight (≤15 lines per spec).
