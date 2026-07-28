# 360AI Desk Snapshot + On-Demand Briefing (Wedge B0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the recruiter an on-demand "what should I work on today?" briefing — the agent calls a new `desk_snapshot` MCP tool that returns the workspace's active roles with pipeline health, then composes a prioritized action list.

**Architecture:** New `DeskService::snapshot()` in the Laravel app aggregates the client's active jobs + each job's pipeline (reusing the `JobService`/`hiringProcess.stages` pattern) and derives health flags. A new read-only `DeskSnapshot` MCP tool exposes it. A prompt "play" on the default 360AI agent turns "what should I work on / plan my day" into a `desk_snapshot` call + a ranked briefing. This is the reusable brain that the later scheduled 9am push (B1) and the autonomous desk (A) will both consume.

**Tech Stack:** PHP/Laravel + `laravel/mcp` + Pest (backend, repo `hire-suite` at `/Users/eth0/Herd/360ai`); `librechat.yaml` model-spec prompt (chat, repo `chat.360ai`).

## Global Constraints

- New PHP files: `<?php` then `declare(strict_types=1);`. (matches every existing tool/service)
- MCP tools live in `app/Mcp/Tools/`, namespace `App\Mcp\Tools`, registered in `app/Mcp/Servers/RecruitingServer.php`. Read tools annotated `#[IsReadOnly]`/`#[IsIdempotent]`.
- Every tool `handle()` guards with `AgentContext::fromRequest($request)` in try/catch returning `Response::error($e->getMessage())`.
- Agent services live in `app/Services/Agent/`, namespace `App\Services\Agent`, take `AgentContext $context` as first arg and scope ALL queries to `$context->client` (never cross-workspace). No `any`-style untyped sprawl; type returns with `@return array{...}` docblocks like `JobService`.
- Backend tests: Pest under `tests/Feature/Mcp/` (tools) and `tests/Feature/` or `tests/Unit/` (services); run from the Laravel root: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest <path>`. Use `mongodb-memory-server`-equivalent: this repo uses a real DB via factories (`Client::factory()`, `User::factory()`, `Job::factory()`); mirror existing tool tests.
- Backend commits land on branch `feature/360ai-chat-auth`; chat commit on `feat/360ai-result-cards`. `git add` only the files each task names — both trees have unrelated WIP; never `git add -A`.
- Health thresholds are named constants on `DeskService`: `SHORTLIST_MIN = 3`, `STALE_DAYS = 14`.
- 3 pre-existing `WhoAmIToolTest` failures are known/unrelated — ignore them.

---

## File Structure

**Create:**
- `app/Services/Agent/DeskService.php` — aggregates the client's active roles + pipeline health (+ stalled counts in Task 3).
- `app/Mcp/Tools/DeskSnapshot.php` — read-only MCP tool wrapping `DeskService::snapshot`.
- `tests/Feature/Agent/DeskServiceTest.php` — service-level tests.
- `tests/Feature/Mcp/Tools/DeskSnapshotTest.php` — tool-level test.

**Modify:**
- `app/Mcp/Servers/RecruitingServer.php` — register `DeskSnapshot::class`.
- `librechat.yaml` (chat repo) — add the "plan my day" briefing play to the default `360ai` agent prompt.

**Reference (read, don't change):**
- `app/Services/Agent/JobService.php` — the aggregation pattern (`$context->client->jobs()`, `hiringProcess.stages.stage`, `withCount('candidates')`).
- `app/Mcp/Tools/ListJobs.php` — the simplest tool shape to copy.
- `app/Models/ApplyApplicationStageHistory.php` — for Task 3 stalled detection.

---

## Task 1: `DeskService::snapshot` — roles + pipeline health

**Files:**
- Create: `app/Services/Agent/DeskService.php`
- Test: `tests/Feature/Agent/DeskServiceTest.php`

**Interfaces:**
- Consumes: `AgentContext` (has `->client`), `App\Models\Job`, `App\Enums\Jobs\Status`.
- Produces: `DeskService::snapshot(AgentContext $context, int $roleLimit = 25): array` returning
  `{ generated_at: string, active_roles: int, roles_needing_shortlist: int, roles: array<int, array{id:int,title:string,status:string,location:string|null,age_days:int,applications_count:int,total_in_pipeline:int,pipeline:array<int,array{name:string,order:int,candidates_count:int}>,flags:array<int,string>}> }`. Constants `DeskService::SHORTLIST_MIN` (3), `DeskService::STALE_DAYS` (14).

- [ ] **Step 1: Confirm the active-status enum case.** Read `app/Enums/Jobs/Status.php` and confirm the case used for live roles is `Status::Active` (the live `list_jobs status:"active"` call proves the value is `'active'`). Record the exact case name; use it in Step 3. (One quick read — not a guess.)

- [ ] **Step 2: Write the failing test**

Create `tests/Feature/Agent/DeskServiceTest.php`:

```php
<?php

declare(strict_types=1);

use App\Enums\Jobs\Status;
use App\Mcp\AgentContext;
use App\Models\Client;
use App\Models\Job;
use App\Models\User;
use App\Services\Agent\DeskService;

function deskContext(): AgentContext
{
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    return new AgentContext($user, $client);
}

test('snapshot returns active roles with pipeline health and a needs_shortlist flag', function () {
    $context = deskContext();

    // A role with an empty pipeline -> needs_shortlist
    Job::factory()->create([
        'client_id' => $context->client->id,
        'title' => 'Senior Rust Engineer',
        'status' => Status::Active,
    ]);

    $result = (new DeskService())->snapshot($context);

    expect($result['active_roles'])->toBe(1)
        ->and($result['roles_needing_shortlist'])->toBe(1)
        ->and($result['roles'][0]['title'])->toBe('Senior Rust Engineer')
        ->and($result['roles'][0]['total_in_pipeline'])->toBe(0)
        ->and($result['roles'][0]['flags'])->toContain('needs_shortlist')
        ->and($result['roles'][0])->toHaveKeys(['id', 'age_days', 'pipeline', 'applications_count']);
});

test('snapshot only includes the authenticated workspace and only active roles', function () {
    $context = deskContext();
    $other = Client::factory()->create();

    Job::factory()->create(['client_id' => $context->client->id, 'status' => Status::Active]);
    Job::factory()->create(['client_id' => $other->id, 'status' => Status::Active]);          // other workspace
    Job::factory()->create(['client_id' => $context->client->id, 'status' => Status::Draft]); // not active

    $result = (new DeskService())->snapshot($context);

    expect($result['active_roles'])->toBe(1);
});
```

> If `Status::Draft` is not a real case, use any non-active case the enum defines (from Step 1's read). If `Job::factory()` requires extra non-null fields, add them — mirror an existing test that creates a `Job`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Agent/DeskServiceTest.php`
Expected: FAIL — `Class "App\Services\Agent\DeskService" not found`.

- [ ] **Step 4: Implement the service**

Create `app/Services/Agent/DeskService.php`:

```php
<?php

declare(strict_types=1);

namespace App\Services\Agent;

use App\Enums\Jobs\Status;
use App\Mcp\AgentContext;
use App\Models\Job;

class DeskService
{
    public const SHORTLIST_MIN = 3;

    public const STALE_DAYS = 14;

    /**
     * @return array{
     *   generated_at: string,
     *   active_roles: int,
     *   roles_needing_shortlist: int,
     *   roles: array<int, array{
     *     id: int, title: string, status: string, location: string|null,
     *     age_days: int, applications_count: int, total_in_pipeline: int,
     *     pipeline: array<int, array{name: string, order: int, candidates_count: int}>,
     *     flags: array<int, string>
     *   }>
     * }
     */
    public function snapshot(AgentContext $context, int $roleLimit = 25): array
    {
        $jobs = $context->client->jobs()
            ->where('status', Status::Active)
            ->withCount('applications')
            ->with(['hiringProcess.stages.stage', 'hiringProcess.stages' => function ($query) {
                $query->orderBy('order')->withCount('candidates');
            }])
            ->latest()
            ->limit(min($roleLimit, 25))
            ->get();

        $roles = $jobs->map(function (Job $job): array {
            $pipeline = $job->hiringProcess
                ? $job->hiringProcess->stages->map(fn ($hps) => [
                    'name' => $hps->stage->name,
                    'order' => $hps->order,
                    'candidates_count' => $hps->candidates_count,
                ])->all()
                : [];

            $totalInPipeline = array_sum(array_column($pipeline, 'candidates_count'));

            $flags = [];
            if ($totalInPipeline < self::SHORTLIST_MIN) {
                $flags[] = 'needs_shortlist';
            }

            return [
                'id' => $job->id,
                'title' => $job->title,
                'status' => $job->status->value,
                'location' => $job->location_display,
                'age_days' => (int) $job->created_at->diffInDays(now()),
                'applications_count' => $job->applications_count,
                'total_in_pipeline' => $totalInPipeline,
                'pipeline' => $pipeline,
                'flags' => $flags,
            ];
        })->all();

        return [
            'generated_at' => now()->toIso8601String(),
            'active_roles' => count($roles),
            'roles_needing_shortlist' => count(array_filter(
                $roles,
                fn (array $r) => in_array('needs_shortlist', $r['flags'], true),
            )),
            'roles' => $roles,
        ];
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Agent/DeskServiceTest.php`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Services/Agent/DeskService.php tests/Feature/Agent/DeskServiceTest.php
git commit -m "feat(agent): DeskService.snapshot — active roles + pipeline health"
```

---

## Task 2: `desk_snapshot` MCP tool + registration

**Files:**
- Create: `app/Mcp/Tools/DeskSnapshot.php`
- Modify: `app/Mcp/Servers/RecruitingServer.php`
- Test: `tests/Feature/Mcp/Tools/DeskSnapshotTest.php`

**Interfaces:**
- Consumes: `DeskService::snapshot(AgentContext, int): array` (Task 1).
- Produces: MCP tool `name = 'desk_snapshot'`, no required input (optional `role_limit` int), returns the snapshot JSON. Registered in `RecruitingServer::$tools`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Mcp/Tools/DeskSnapshotTest.php` (mirror `EnrichContactTest.php`'s server-harness style — read it for the exact `::actingAs(...)->tool(...)` API):

```php
<?php

declare(strict_types=1);

use App\Enums\Jobs\Status;
use App\Mcp\Tools\DeskSnapshot;
use App\Models\Client;
use App\Models\Job;
use App\Models\User;
use Laravel\Mcp\Server;

class DeskSnapshotTestServer extends Server
{
    protected string $name = 'desk-snapshot-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [DeskSnapshot::class];
}

test('desk_snapshot returns the workspace active roles', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);
    Job::factory()->create(['client_id' => $client->id, 'title' => 'Senior Rust Engineer', 'status' => Status::Active]);

    $response = DeskSnapshotTestServer::actingAs($user)->tool(DeskSnapshot::class, []);

    $response->assertOk();
    expect($response)->toolContains('Senior Rust Engineer');
})->skip('adapt assertion to the exact server-harness API used in EnrichContactTest.php');
```

> Remove the `->skip(...)` and adapt the invocation + assertion to whatever `EnrichContactTest.php`/`SearchTalentsTest.php` actually use (server harness vs `handle()` call). The test must run and assert the role title appears in the response.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/DeskSnapshotTest.php`
Expected: FAIL — `Class "App\Mcp\Tools\DeskSnapshot" not found`.

- [ ] **Step 3: Write the tool**

Create `app/Mcp/Tools/DeskSnapshot.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\Agent\DeskService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
#[IsIdempotent]
class DeskSnapshot extends Tool
{
    protected string $name = 'desk_snapshot';

    protected string $description = <<<'TXT'
Snapshot of the recruiter's desk RIGHT NOW: their active roles in this
workspace, each with pipeline health — how many candidates are in the
pipeline, the per-stage breakdown, the role's age in days, and a `flags`
list (e.g. "needs_shortlist" when a role has fewer than a few candidates
in its pipeline). Use this to answer "what should I work on today?" /
"plan my day": rank the roles by urgency (needs_shortlist, oldest,
client-active) and tell the recruiter the highest-leverage next action
for each. Read-only — proposes actions, changes nothing.
TXT;

    public function handle(Request $request, DeskService $service): Response
    {
        try {
            $context = AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $roleLimit = (int) ($request->get('role_limit') ?: 25);

        return Response::json($service->snapshot($context, $roleLimit));
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'role_limit' => $schema->integer()
                ->description('Max active roles to include (1-25, default 25). 0 for default.'),
        ];
    }
}
```

- [ ] **Step 4: Register in RecruitingServer**

In `app/Mcp/Servers/RecruitingServer.php`, add `use App\Mcp\Tools\DeskSnapshot;` with the other tool imports (alphabetical) and add `DeskSnapshot::class,` to the `$tools` array.

- [ ] **Step 5: Run the tool test + the server test**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/DeskSnapshotTest.php tests/Feature/Mcp/RecruitingServerTest.php`
Expected: PASS. (If `RecruitingServerTest` asserts a tool count, bump it.)

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Tools/DeskSnapshot.php app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/Tools/DeskSnapshotTest.php tests/Feature/Mcp/RecruitingServerTest.php
git commit -m "feat(mcp): add desk_snapshot tool (active roles + pipeline health)"
```

---

## Task 3: Stalled-candidate enrichment

Adds time-in-stage "stalled" detection so the briefing can say "2 candidates stalled in screening." Independent of Tasks 1–2: it enriches each role's snapshot with a `stalled_count` and a `stalling` flag.

**Files:**
- Modify: `app/Services/Agent/DeskService.php`, `tests/Feature/Agent/DeskServiceTest.php`

**Interfaces:**
- Consumes: `App\Models\ApplyApplicationStageHistory` (latest stage move per application).
- Produces: each role gains `stalled_count: int`; `flags` gains `'stalling'` when `stalled_count > 0`; top-level gains `total_stalled: int`.

- [ ] **Step 1: Pin the stalled query.** Read `app/Models/ApplyApplicationStageHistory.php` fully (the `$fillable` at line 19 and `$casts` at line 32) to learn the timestamp column name for when a candidate entered its current stage (e.g. `moved_at` / `changed_at` / `created_at`) and how it links to a job (via `application()` → `ApplyApplication` → its `job`/`apply_job`). Also confirm how to find an application's CURRENT stage (latest history row by that timestamp). Record the exact column + relationship path. A "stalled" candidate = its latest stage-history row is older than `DeskService::STALE_DAYS` days, scoped to the client's active jobs. If the current stage is tracked more directly on `ApplyApplication` (e.g. a `current_stage_id` + an `updated_at`), prefer that simpler source and note it.

- [ ] **Step 2: Write the failing test**

Add to `tests/Feature/Agent/DeskServiceTest.php` (adapt fixture construction to the relationships found in Step 1):

```php
test('snapshot flags roles with candidates stalled beyond STALE_DAYS', function () {
    $context = deskContext();
    $job = Job::factory()->create(['client_id' => $context->client->id, 'status' => Status::Active]);

    // Arrange: one application whose latest stage move is older than STALE_DAYS.
    // (Build via the factories/relationships identified in Step 1, with the
    //  stage-entered timestamp set to now()->subDays(DeskService::STALE_DAYS + 1).)

    $result = (new DeskService())->snapshot($context);
    $role = collect($result['roles'])->firstWhere('id', $job->id);

    expect($role['stalled_count'])->toBeGreaterThanOrEqual(1)
        ->and($role['flags'])->toContain('stalling')
        ->and($result['total_stalled'])->toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Agent/DeskServiceTest.php --filter='stalled'`
Expected: FAIL (`stalled_count` key missing).

- [ ] **Step 4: Implement stalled counting**

In `DeskService::snapshot`, after building `$pipeline`/`$totalInPipeline` for each job, compute `$stalledCount` for that job using the Step-1 query (count applications on this job whose current-stage-entered timestamp is `< now()->subDays(self::STALE_DAYS)`). Add `'stalled_count' => $stalledCount` to the role array, push `'stalling'` to `$flags` when `$stalledCount > 0`, and add `'total_stalled' => array_sum(array_column($roles, 'stalled_count'))` to the top-level return. Keep all queries scoped to `$context->client`. Update the `@return` docblock to include the new keys. To avoid N+1, prefer a single grouped query (counts per job) computed before the map; if that complicates the diff, a per-job count is acceptable for ≤25 roles — note which you chose.

- [ ] **Step 5: Run to verify it passes (and prior tests stay green)**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Agent/DeskServiceTest.php`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Services/Agent/DeskService.php tests/Feature/Agent/DeskServiceTest.php
git commit -m "feat(agent): desk_snapshot flags stalled candidates per role"
```

---

## Task 4: The "plan my day" briefing play (chat agent prompt)

Wires the new tool into recruiter behavior: "what should I work on today / plan my day" → `desk_snapshot` → a ranked briefing with one-click next actions. Prompt behavior is not unit-testable, so this task is verified live (drive the running app, inspect Mongo) the way the rest of this session's agent behavior was.

**Files:**
- Modify: `librechat.yaml` (chat repo `/Users/eth0/Herd/chat.360ai`) — the default `360ai` model-spec `promptPrefix`.

**Interfaces:**
- Consumes: the `desk_snapshot` MCP tool (Tasks 1–3), available to the agent once registered + the MCP connection refreshes.

- [ ] **Step 1: Add the briefing play to the default agent prompt**

In `librechat.yaml`, inside the `360ai` spec's `promptPrefix`, add a new numbered behavior right after the "ANCHOR TO A LIVE ROLE" block (keep the existing 10-space block-scalar indentation):

```
          1b. PLAN-MY-DAY / DESK BRIEFING. When the recruiter asks what to
              work on, to plan their day, for a desk update, or "what needs
              my attention", call `desk_snapshot` FIRST, then give a short,
              ranked briefing — do NOT just dump the raw data. Lead with the
              one or two highest-leverage actions. Rank roles by urgency:
              roles flagged `needs_shortlist` (especially older ones) and
              roles with stalled candidates come first. For each, say the
              concrete next step you can take now and offer to do it, e.g.
              "Your **Senior Rust Engineer** role (18 days old) has nobody
              in the pipeline — want me to source a shortlist now?" or
              "**2 candidates are stalled** in screening on the GPU role —
              want me to chase them?". End by doing the top action or asking
              one specific question — never a passive menu.
```

- [ ] **Step 2: Validate YAML and reload the chat backend**

Run:
```bash
cd /Users/eth0/Herd/chat.360ai
node -e "require('js-yaml').load(require('fs').readFileSync('librechat.yaml','utf8'));console.log('yaml ok')"
touch api/server/index.js   # nodemon reloads librechat.yaml on restart
```
Expected: prints `yaml ok`; the backend (port 3080) restarts within ~5s (new PID). The restart also refreshes the MCP tool list so `desk_snapshot` is available.

- [ ] **Step 3: Verify live (the surface is the agent)**

Prerequisite: Tasks 1–3 are deployed on the running `hire-suite` so `desk_snapshot` actually returns data. In a logged-in chat on the default 360AI agent, send: *"what should I work on today?"*. Then inspect the latest conversation in Mongo:
```bash
docker exec librechat-mongo mongosh "mongodb://localhost:27017/LibreChat" --quiet --eval '
const c = db.conversations.find({}).sort({updatedAt:-1}).limit(1).toArray()[0];
const m = db.messages.find({conversationId:c.conversationId, isCreatedByUser:false}).sort({createdAt:-1}).limit(1).toArray()[0];
const tools = (m.content||[]).filter(p=>p.type==="tool_call").map(p=>p.tool_call.name);
print("spec="+c.spec+" tools="+JSON.stringify(tools));
print((m.content||[]).filter(p=>p.type==="text").map(p=>p.text).join("").slice(0,400));
'
```
Expected: `tools` includes `desk_snapshot_mcp_360ai`, and the text is a ranked briefing (named role + a concrete offered action), not a raw data dump.

- [ ] **Step 4: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(360ai): plan-my-day desk briefing play (desk_snapshot)"
```

---

## Done criteria

- `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Agent tests/Feature/Mcp/Tools/DeskSnapshotTest.php tests/Feature/Mcp/RecruitingServerTest.php` is green.
- `desk_snapshot` is registered and returns the workspace's active roles with `total_in_pipeline`, `pipeline`, `flags` (incl. `needs_shortlist`, `stalling`), `stalled_count`, and a top-level summary.
- Asking the default agent "what should I work on today?" produces a ranked briefing driven by a real `desk_snapshot` call.

## Out of scope (later wedges — own specs)

- **Re-engagement triggers** (candidate became `open_to_work` since last week): needs prior-state storage / change-detection. Big enough for its own spec.
- **Market/BD signals in the briefing**: the `Signals/` subsystem is configured monitors with scheduled `SignalRun`s; surfacing them needs its own integration.
- **B1 — scheduled 9am push**: a Laravel scheduled job that calls `DeskService::snapshot` (reused) and delivers via email/notification + a chat link.
- **A — overnight autonomous desk**: send-sequences, inbound reply handling, calendar booking, background runs, autonomy guardrails.
- **A `DeskBriefingCard`** in the chat for richer rendering (the agent composes text for B0).
