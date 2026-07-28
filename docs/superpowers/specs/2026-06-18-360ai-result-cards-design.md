# 360AI MCP Result Cards — Design

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Scope:** Render 360AI MCP tool results as rich, interactive UI cards in the chat.360ai (LibreChat fork) frontend, instead of plain JSON/text.

---

## Problem

The 360AI platform exposes recruiting data over MCP. Today its tool results render via LibreChat's generic `OutputRenderer` — a JSON/code block. We want the high-value result types (companies, talents/candidates, jobs) to render as native, themed, interactive cards inside the chat conversation.

## Goals

- Rich card rendering for: `search_companies`, `search_talents`, `search_candidates`, `search_jobs`, `list_jobs`, `get_job`.
- Interactive: external links, in-app actions (expand/collapse, copy), view-in-platform.
- Collapsed-by-default lists: show a count summary + top 3 cards, "show all N" expands.
- Never break chat: any parse/shape failure falls back to today's `OutputRenderer`.
- Minimal upstream-LibreChat footprint: a single guarded branch in the existing pipeline; all new logic isolated in a 360AI module.

## Non-goals

- No changes to the Laravel MCP server. It keeps emitting plain JSON (still read by the LLM for reasoning).
- `whoami` is left as-is (small profile payload, no card).
- No MCP-UI / iframe path (Approach B was rejected in favor of native React cards).

---

## Architecture

### Approach (chosen: A — client-side custom renderers)

Detect 360AI MCP tools by name in the existing render pipeline, parse the JSON `output`, render dedicated React card components using LibreChat's own Tailwind/theme tokens. Rejected alternative: server-side MCP-UI `UIResource` blocks (heavier iframe rendering, complicates the JSON the model sees, more provider-side work).

### Integration point

Current flow for an MCP tool result:

```
Part.tsx (part.type === ContentTypes.TOOL_CALL)
  -> ToolCall.tsx
    -> ToolCallInfo.tsx
      -> OutputRenderer (JSON dumped as code block)
```

We add a **detection + dispatch layer** that intercepts only 360AI tools and swaps in cards, leaving every other tool untouched. The wiring change is a single guarded branch in `ToolCallInfo.tsx` (or `ToolCall.tsx`): before calling `OutputRenderer`, if `is360Tool(name)` and the output parses to a known result shape, render the 360AI component; otherwise fall through to existing behavior.

### Tool-name detection

360AI tools arrive namespaced with `Constants.mcp_delimiter` (e.g. `search_companies<delim><server>`). Match on the bare tool name after splitting on the delimiter, and gate on the 360AI server name so we never collide with another MCP server that shares a tool name.

### New module (this fork)

`client/src/components/Chat/Messages/Content/AI360/`

- `index.ts` — exports + `is360Tool(name)` / `render360Result(...)` dispatcher.
- `registry.ts` — maps tool name → { parser, card/list component }. One entry per supported tool.
- `parse.ts` — safe JSON parse of `toolCall.output`, normalized into typed result objects. Returns `null` on malformed JSON, error-shaped output, or shape mismatch → triggers fallback.
- `ResultList.tsx` — shared "top 3 + show all N" collapse/expand shell for multi-item tools.
- `cards/CompanyCard.tsx`, `cards/TalentCard.tsx`, `cards/JobCard.tsx`, `cards/JobDetail.tsx`.
- `types.ts` — TS interfaces mirroring the MCP JSON shapes (Company, Talent, Job, JobDetail). Reuse/extend existing data-provider types where applicable; never duplicate.

---

## Data shapes (from the 360AI MCP)

**search_companies** → `{ count, companies: [{ id, name, linkedin_url, linkedin_universal_name, website, industry, employee_range, location, description }] }`

**search_talents** → `{ pool ("global"|"internal"), count, applied_filters[], talent_finder_url, talents: [{ id, name, avatar, title, current_company, location, linkedin_url, open_to_work, years_experience, skills[], profile_url }] }`

**search_candidates** → `[{ id, name, title, location, current_company, summary }]` (array, no envelope; leaner talent shape)

**search_jobs** → `{ count, jobs: [{ id, title, company_name, company_domain, posting_url, location, workplace_type ("remote"|"hybrid"|"on_site"), posted_at, openings, description }] }`

**list_jobs** → `[{ id, title, status, location, created_at, applications_count }]` (array)

**get_job** → `{ id, title, status, description, location, department, employment_type, seniority_level, remote_type, salary_range, created_at, applications_count, pipeline: [{ name, order, candidates_count }] }`

All fields nullable/optional except where noted; cards must handle missing values gracefully.

---

## Card designs

All cards use LibreChat Tailwind tokens (`text-text-primary`, `border-border-medium`, `bg-surface-secondary`, etc.) for automatic light/dark theming, with subtle 360AI accent on actions. All link buttons render only when the URL exists. All interactive elements are keyboard-focusable with `aria-label`s; external links use `target="_blank" rel="noopener"`.

### CompanyCard (`search_companies`)
- Header: **name** (bold) + `employee_range` pill; `industry` muted subtitle.
- Body: `location` (pin icon); `description` clamped 2 lines, expandable.
- Actions: **Website** ↗, **LinkedIn** ↗, **Copy** (name + website).

### TalentCard (`search_talents` / `search_candidates` — one card, optional fields)
- Header: `avatar` (initials fallback), **name**, `open_to_work` green badge when true.
- Subtitle: `title` @ `current_company`; `location` + `years_experience` ("8 yrs").
- Skills: first ~5 `skills` as chips, "+N" reveals rest on expand.
- `summary` (candidates only): clamped 2 lines, expandable.
- Actions: **View profile** ↗ (`profile_url` → 360ai.test), **LinkedIn** ↗, **Copy**.

### JobCard (`search_jobs` + `list_jobs` — shared card, differing field set)
- `search_jobs`: **title**, `company_name`, `location` + `workplace_type` pill, `posted_at` (relative), `openings`, `description` (clamped). Action: **View posting** ↗ (`posting_url`).
- `list_jobs` (internal): **title**, `status` pill, `location`, `applications_count`, `created_at`. Action: **Open in 360AI** (constructed job URL).

### JobDetail (`get_job` — single richer card, no list shell)
- Title + `status`; meta grid (department, employment_type, seniority_level, remote_type, salary_range, location).
- `description` expandable.
- **pipeline** as a horizontal stage strip with `candidates_count` per stage (ordered by `order`).
- `applications_count` total.

---

## List behavior, states

### ResultList shell (multi-item tools)
- Header row: entity icon + count summary (e.g. "12 companies"). For talents, also surface `pool` and a **Talent Finder ↗** link from `talent_finder_url` when present.
- Renders **top 3 cards**, then **"Show all N"** expands the rest inline; collapses back to "Show less".
- `get_job` skips the shell (single detail card).
- Empty result (`count: 0` / empty array) → tidy "No results" line, not an empty shell.

### Streaming / loading
Tool calls stream; `output` arrives at the end. While `progress < 1` / no output, keep LibreChat's existing in-progress indicator — do not render cards from partial JSON. Cards render once output is complete and parses.

### Error / fallback (never break chat)
`parse.ts` returns `null` on malformed JSON, error-shaped output, or shape mismatch → fall through to existing `OutputRenderer`. A thin React error boundary around the 360AI subtree provides the same guarantee. Worst case equals today's behavior.

### Localization
All literal strings go through `useLocalize()` with new `com_ui_360_*` keys added to `client/src/locales/en/translation.json` only (English keys; other languages handled externally).

---

## Testing (Jest + RTL, `__tests__` alongside components)

- `parse.test.ts` — real MCP sample payloads (one per tool) → correct typed objects; malformed/error/empty → `null`.
- Card tests — each card renders its fields, hides missing-URL buttons, expand/collapse toggles, copy fires.
- `ResultList.test.tsx` — top-3 cap, "show all" reveals rest, empty state, count summary.
- Dispatch test — `is360Tool` matches namespaced names + correct server, ignores other MCP tools (fallback path).

---

## Risks

- **JSON shape drift:** cards depend on the MCP contract. Mitigated by tolerant parsing + fallback to `OutputRenderer` on mismatch.
- **Server-name gating:** must correctly identify the 360AI MCP server to avoid colliding with other servers' tool names.
- **Upstream merge friction:** kept to a single guarded branch in the existing pipeline; all else isolated under `AI360/`.
