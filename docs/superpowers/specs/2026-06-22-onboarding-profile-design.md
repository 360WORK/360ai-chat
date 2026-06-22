# Conversational Onboarding + Editable Profile — 360AI Chat

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan
**Repo:** `chat.360ai` (LibreChat fork) + parent app `360ai` (Laravel, `360WORK/hire-suite`)

## Summary

Add a per-user / per-company-owner onboarding to 360AI Chat. A first-time user is
interviewed *conversationally* by the agent; the agent extracts a **structured profile**
and saves it. The profile is durable in the Laravel app (source of truth) and distilled
into chat Memories so the agent has it inline every turn. After onboarding, the empty-chat
landing shows **tailored, numbered prompt cards** derived from the profile. The structured
profile is editable any time from a **Settings tab**.

Onboarding runs once per scope; re-editing happens on the structured config, never by
re-running the interview.

## Scopes

Two profile scopes, both feed the agent for a given user:

- **Company profile** — filled **once by the company owner**, shared workspace-wide.
  Comprehensive: industry, what the company recruits for / desks, target roles & seniority,
  markets & locations, hiring volume, tooling/ATS, candidate ICP, employer value prop.
- **Personal profile** — filled by **every user** (owners included). Personal: their
  desk/specialty, role, seniority focus, geographies, daily workflow, what they want the
  copilot to do for them.

Owner = `Client.user_id == User.id` (existing 360AI ownership model). Members fill only the
personal profile; the company profile is inherited from the owner's answers.

## Storage model (hybrid: Laravel source of truth + chat Memories cache)

### Parent app — `/Users/eth0/Herd/360ai`

1. **Company profile** — JSON column `onboarding_profile` on `clients`. Company-onboarding
   completion is derived from this column being non-empty. NOTE: the existing
   `clients.onboarding_completed` boolean belongs to a **different** (360AI product) flow and
   must NOT be read or written by the chat onboarding feature.
2. **Personal profile** — new lightweight table `client_user_onboarding`:
   `id`, `user_id`, `client_id`, `profile` (JSON), `completed_at` (nullable),
   `tailored_prompts` (JSON, nullable — cached starter prompts), timestamps. Unique on
   `(user_id, client_id)`.
3. **OIDC claims** — `app/Support/Oidc/OidcClaims.php` adds:
   - `role` / `is_owner` (boolean)
   - `client_id`, `client_name`
   - `company_onboarded` (boolean), `personal_onboarded` (boolean)

   so chat knows status + role at login with no extra round-trip. After editing claims:
   `php artisan optimize:clear`.
4. **MCP tools** — `app/Mcp/Servers/RecruitingServer.php`:
   - `get_onboarding` — read-only; returns the structured profile(s) + completion status +
     cached tailored prompts for the current user's scope (company fields only if owner).
   - `save_onboarding_profile` — write; accepts structured fields + scope; writes to the
     correct record (`clients.onboarding_profile` for company, `client_user_onboarding` for
     personal), flips the relevant completion flag, optionally stores `tailored_prompts`.
     Scope/authorization derived from the authenticated user's role. Idempotent (re-save =
     edit).

### Chat app — `chat.360ai`

- On successful onboarding the agent calls `save_onboarding_profile`; chat then **distills**
  the profile into the existing per-user **Memories** store (`api/server/routes/memories.js`,
  `useMemoriesQuery`) as one or a few compact memory entries, so the agent reads it inline.
- Re-editing the profile (Settings) re-saves to Laravel, regenerates tailored prompts, and
  re-syncs the distilled Memories entries.

## Onboarding flow (conversational, soft gate)

1. **Login** → OIDC claims give `is_owner`, `client_*`, `company_onboarded`,
   `personal_onboarded`.
2. **Incomplete** (for the user's scope) → the empty-chat **Landing** (`client/src/components/
   Chat/Landing.tsx`) shows a prominent "Finish setup" entry point; the agent opens with the
   interview. Wording differs for owner (company setup) vs member (personal setup). The user
   **can skip**; a persistent nudge stays on the landing until done.
3. **Interview** → the agent's system prompt is augmented with the right **interview script**
   (company script for owners who haven't done the company profile; personal script
   otherwise). The agent conducts the interview in natural language and may surface choices as
   numbered cards.
4. **Extraction + save** → when the agent has enough, it calls `save_onboarding_profile` with
   the structured fields. On success: Laravel flips the flag, chat distills to Memories and
   caches a set of tailored starter prompts.
5. **Done** → nudge disappears; landing switches to tailored cards.

If a user is an owner and *neither* profile is done, the company interview runs first, then
the personal interview.

## Numbered-card component (reused)

One reusable component matching the reference `01 … 06` style (left-aligned index, hairline
row separators, hover state). Two uses:

- **Onboarding progress** — numbered checklist of interview topics that tick off as the agent
  covers them (visible progress beside/above the chat during the interview).
- **Tailored starters** — after onboarding, replaces the generic `ConversationStarters`
  (`client/src/components/Chat/Input/ConversationStarters.tsx`) on the landing with
  personalized, numbered prompt cards generated from the profile. **Click → sends the prompt
  immediately.**

Tailored prompts are generated at save time (by the agent, from the profile), cached in
`client_user_onboarding.tailored_prompts` / Memories, and regenerated when the profile is
edited.

## Settings tab — "Workspace profile"

- New tab registered in `client/src/components/Nav/Settings.tsx` + `SettingsTabs/index.ts`.
- Structured, editable view of the profile: **company fields** (owners only) + **personal
  fields** (everyone). Reads via `get_onboarding`, writes via `save_onboarding_profile`.
- Saving from Settings regenerates tailored cards and re-syncs distilled Memories.
- This is the "config somewhere" — the durable, editable representation of what the interview
  produced.

## Component boundaries

- **`OnboardingProfile` (Laravel)** — model/service owning read+write of company and personal
  profiles, completion flags, and tailored-prompt cache. Used by both MCP tools and claims.
- **`get_onboarding` / `save_onboarding_profile` (MCP)** — thin tool wrappers over the
  service; the only interface chat uses to read/write profiles.
- **Onboarding detection (chat)** — small util reading claims/`whoami` → `{ isOwner,
  companyOnboarded, personalOnboarded }`; drives the soft gate.
- **Interview script provider (chat)** — returns the system-prompt augmentation for the active
  scope.
- **Profile→Memories distiller (chat)** — pure function: structured profile → compact memory
  entries; called on save.
- **`NumberedCardList` (chat, React)** — presentational; props for items, index style, and
  click behavior (progress checklist vs. send-on-click).
- **`WorkspaceProfile` settings tab (chat, React)** — structured editor over `get_onboarding`
  / `save_onboarding_profile`.

## Error handling

- `save_onboarding_profile` fails → agent reports it couldn't save, does not flip the flag,
  retries on next attempt; nudge persists.
- Claims missing new fields (stale provider) → chat treats onboarding as incomplete and falls
  back to a `get_onboarding` MCP call; never hard-crashes the landing.
- Memories sync failure is non-fatal: Laravel save is the source of truth; distillation
  retried on next save/edit.
- Member with no company profile yet (owner hasn't onboarded) → personal onboarding still
  works; agent notes company context is limited.

## Testing

- **Laravel**: profile service unit tests (owner vs member scope, idempotent save, flag
  flips); MCP tool tests using real SDK exports; claim assembly includes new fields.
- **Chat backend**: distiller pure-function tests; Memories sync writes expected entries.
- **Chat frontend**: `NumberedCardList` (progress vs send-on-click); Landing soft-gate states
  (owner/member, complete/incomplete/skipped); Settings tab read/edit/save; cover loading,
  success, error states.

## Out of scope (YAGNI)

- No new analytics/telemetry on onboarding.
- No multi-language interview scripts beyond English keys (other locales automated externally).
- No admin UI to author interview scripts — scripts are code constants for now.
- No re-onboarding scheduling/reminders beyond the persistent landing nudge.

## Open implementation choices (resolve in plan)

- Exact distilled-Memories key/value shape and char budget.
- Whether tailored prompts are generated by the agent inline at save time vs a dedicated
  generation call.
- Personal-profile storage on a dedicated table (chosen) vs a JSON column on membership —
  dedicated table chosen for clarity.
