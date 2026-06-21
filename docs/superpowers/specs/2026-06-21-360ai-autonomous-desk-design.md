# Design: 360AI — The Autonomous Recruiting Desk

Generated via office-hours on 2026-06-21
Branch: feat/360ai-result-cards
Status: DRAFT
Mode: Startup (intrapreneurship — real product, real users)

## The thesis (the wow)

360AI is **not a chat tool a recruiter opens. It's an autonomous junior recruiter that works the desk while they sleep.** The recruiter stops *doing* sourcing/screening/outreach/chasing and starts *managing AI desks*. One recruiter bills like five.

The wow is an outcome, not a feature: *"I gave it the role Friday, woke up Monday to twelve replies and three calls booked."* Recruiters tell their friends about getting their evenings back and hitting target anyway. They don't tell their friends about a better search box.

**One build, three buyers wowed:**
- **Recruiter (champion, daily user):** "I bill 3x with less grind."
- **Agency owner (buyer):** same feature, "my desk bills 3x on the same payroll."
- **Candidate (reputation):** "someone reached out fast, relevant, human."

## Primary user
The **individual recruiter** is the champion (decided). The owner's business case and the candidate experience ride on the same capability.

## North star vs first wedge

**North star — Wedge A: the overnight desk.** End of day: *"Source the Acme GPU role, reach out to the top 10, chase non-replies."* Overnight: sources, deep-screens, sends multi-channel outreach within approval rules, handles replies, follows up, books interested candidates into the calendar. Morning briefing: *"Contacted 40, 12 replied, 5 keen, 3 booked Tuesday."* Biggest build (send-sequences, inbound reply handling, calendar, a background-run layer the chat lacks, and earned trust to let it act).

**First wedge — Wedge B: the 9am desk briefing.** Every morning, unprompted: *"Acme role has no shortlist and the client chased — here's a fresh top 10. A candidate you messaged 3 months ago just went open-to-work and fits your live Stripe role. Two candidates stalled in your pipeline — want me to chase?"* It knows the desk better than the recruiter does at 9am.

**Why B first (recommendation, approved):** fastest path to a daily "whoa," compounds the conversational delivery agent we already built, and it *earns the trust* that makes A safe — you believe the agent's judgment on briefings before you let it send outreach while you sleep. A is the 10-star; B is the on-ramp.

## What Wedge B computes (the desk intelligence)
1. **Roles needing attention** — live jobs (`list_jobs`/`get_job`) with no/thin shortlist or stalled pipeline stages.
2. **Re-engagement triggers** — candidates who became `open_to_work` and match a live role (needs change-detection over time).
3. **Stalled pipeline** — candidates stuck in a stage too long (`ApplyApplicationStageHistory` exists).
4. **Market/BD signals** — companies with funding/hiring signals matching the recruiter's niche (`Signals/` exists).
5. Each item ships with a **one-click next action** ("Build the shortlist", "Draft outreach", "Chase these 2").

## The hard part
LibreChat is request-driven: the user types, the agent answers. A "9am briefing" needs something to **trigger the agent without the user typing**. That proactive layer is the genuinely new piece. It splits the wedge cleanly:

- **B0 — on-demand briefing (ships now, no new infra):** a "What should I work on today?" capability. Recruiter asks; the agent pulls live jobs + pipelines (+ signals) and returns a prioritized action list with one-click next steps. Proves the intelligence is good.
- **B1 — scheduled proactive briefing (the real wow):** a Laravel scheduled job (the platform already runs `SignalRun` on a schedule) computes the briefing at 9am and **pushes** it (email/notification + a link back into chat). Reuses B0's logic. This is where 360AI stops being a tool you open and becomes a copilot that comes to you.

## Approaches Considered (for the first build, B0)

### Approach A: Prompt-only "play" (minimal)
A `desk-briefing` behavior in the agent: on "what should I work on today", chain `list_jobs` → `get_job` per role → flag thin/stalled → present prioritized actions.
- Effort: S (CC: ~30 min) · Risk: Low · Completeness: 6/10
- Reuses: everything we built. No backend.
- Cons: many sequential tool calls (slow); detection limited to what `get_job` exposes; no re-engagement or signals yet.

### Approach B: A "desk snapshot" MCP tool (ideal foundation) — RECOMMENDED
One new read tool (`desk_snapshot`) + a Laravel service that aggregates, in a single call: open roles + each role's pipeline health (shortlist count, stalled candidates) + flagged re-engagement candidates + relevant signals. The agent calls one tool, gets whole-desk state, composes the briefing.
- Effort: M (CC: ~1-2 sessions) · Risk: Low-Med · Completeness: 9/10
- Reuses: `JobService`, pipeline data, `Signals/`. **Same logic feeds B1's scheduled job** — build once, use for on-demand and proactive.
- Cons: one new MCP tool + aggregation service.

### Approach C: Static daily email (lateral, straight to proactive)
Skip the agent for the briefing: a Laravel scheduled job computes it and emails it daily, "reply to act" or links into chat.
- Effort: M · Risk: Med · Completeness: 7/10
- Pros: fastest path to "it comes to me."
- Cons: static report, loses the conversational depth; duplicates logic the agent should own.

## Recommended Approach
**Approach B (the `desk_snapshot` tool), shipped first as on-demand (B0), then wired into a scheduled push (B1).** Best architecture, reused across on-demand and proactive, and it sets up the north star (A's overnight desk consumes the same snapshot to decide what to act on).

## Open questions
- **Re-engagement change-detection:** detecting "became open-to-work since last week" needs storing prior talent state or a signal. Scope for B's later iteration; B0 can start with roles + pipeline only.
- **Delivery channel for B1:** email (exists) vs push notification vs an injected chat message. Decide at B1.
- **Trust/guardrails for A:** what the agent may send autonomously vs what needs approval. Out of scope until B earns trust.

## The Assignment
Before building: **watch one recruiter work a Monday morning for 20 minutes without helping.** What's the first thing they open, what they decide to work first, and why. The briefing must match how a real recruiter triages their desk, not how we imagine they do. That observation shapes the `desk_snapshot` priorities.

## Next step
Exit office-hours → `writing-plans` for **Wedge B0: the `desk_snapshot` tool + on-demand briefing play.** B1 (scheduled push) and A (overnight desk) get their own specs later.
