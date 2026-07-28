# Autonomous Deep-Dive Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 360AI chat assistant run a full sourcing deep-dive autonomously in one turn — rich search, re-poll for live Crustdata results, batch full-profile pulls, company verification, ranked evidence-backed shortlist — with the agent-loop ceiling, prompt choreography, batch MCP tool, and result-card mapping to support it.

**Architecture:** Three independent legs. (1) chat.360ai config: an explicit `endpoints.agents.recursionLimit` in `librechat.yaml` (the only knob that reaches model-spec ephemeral agents) plus deep-dive choreography written into the model-spec `promptPrefix` blocks. (2) 360ai Laravel: a new `get_candidates` MCP tool (`ids[]`, max 10) that wraps the existing `CandidateService::get()` per id and aggregates, registered on `RecruitingServer`. (3) chat.360ai client: `get_candidates` output mapped into the existing `talents` card kind (TalentCard list) via `AI360/tools.ts` + `AI360/parse.ts`.

**Tech Stack:** LibreChat fork (Node 24.16.0, React/TS, Jest), Laravel 13 + `laravel/mcp` (Pest tests), YAML config.

## Global Constraints

- **Repos:** chat.360ai = `/Users/eth0/Herd/chat.360ai` (LibreChat fork); 360ai platform = `/Users/eth0/Herd/360ai` (Laravel).
- **Branches:** chat.360ai work continues on `feat/360ai-result-cards` (current branch, clean). Laravel work on a new branch `feat/mcp-batch-candidates`, cut from `feat/crustdata-live-mcp-sourcing` (created by sub-project 2). **If `feat/crustdata-live-mcp-sourcing` does not exist yet** (verified 2026-07-16: it doesn't; only `feature/crustdata-*` and current `feature/360ai-chat-auth` exist), cut from `feature/360ai-chat-auth` and rebase onto sub-project 2's branch before merge — `get_candidates` has no code dependency on sub-project 2.
- **Pinned `search_talents` re-poll contract (from sub-project 2):** the tool response WILL contain `fresh_results_pending: boolean`; when `true` it also contains `poll_after_seconds: number` and the query id. The assistant re-calls `search_talents` with the **same arguments** after `poll_after_seconds`. When `false`/absent: do not re-poll.
- **Pinned `get_candidates` contract (defined by this plan, both repos MUST match):**
  - Request: `{ "ids": string[] }` — 1 to 10 ids, strings, deduplicated by the tool.
  - Response: `{ "count": number, "candidates": CandidateProfile[], "not_found": string[] }` where `CandidateProfile` is exactly the shape `CandidateService::get()` returns today (`id, name, avatar, title, headline, summary, location, location_country, industry, current_company, job_start_date, has_email, has_phone, open_to_work, skills, languages, interests, profiles, experience, education, certifications, honors_awards, projects`).
  - Contacts stripped: only `has_email` / `has_phone` booleans, never raw emails/phones (inherited from `get()`).
- **Recursion-limit mechanism (verified in source):** `resolveRecursionLimit(agentsEConfig, agent)` in `/Users/eth0/Herd/chat.360ai/packages/api/src/agents/config.ts`, called from `api/server/controllers/agents/client.js:1128` and `api/server/controllers/agents/openai.js:767`. Cascade: `librechat.yaml` → `endpoints.agents.recursionLimit` (fallback `DEFAULT_RECURSION_LIMIT = 50` — **this fork's default is already 50**, upstream's was 25 and the yaml comments at `:834-837` are stale upstream text) → per-agent DB `recursion_limit` override (model-spec conversations run as **ephemeral agents with no `recursion_limit`**, so this never applies here) → capped by `endpoints.agents.maxRecursionLimit`. Therefore the ONLY effective knob for model-spec runs is `endpoints.agents.recursionLimit`. Target ≥ 50: we set **80** explicitly.
- **Known limitation:** headless browser QA of chat.360ai is unreliable (OIDC self-signed IdP, daemon doesn't persist). Verification is source-level + Jest + optional direct backend smoke test. Do not attempt browser QA.
- **Laravel test caveat:** the 360ai local test suite has known unrelated breakage since the Laravel 13 upgrade — run ONLY the specific test file, never the whole suite.
- Frontend: never use `any`; all user-facing text via `useLocalize()` (no new UI text is added here — we reuse the existing `talents` renderer).
- All commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Spec discrepancies found during source verification

1. The spec assumed "framework default caps tool calls" low — this fork already defaults to 50 (`config.ts`), with tests in `packages/api/src/agents/config.spec.ts`. We still make it explicit and raise to 80 for headroom (each tool call costs ~2 LangGraph steps; search + 2 re-polls + batch pull + ~10 company/web checks + intake ≈ 35–50 steps).
2. `get_candidate` (singular) is **not** mapped in `AI360/tools.ts` today (spec worded as if it were). Its raw JSON renders as a plain tool result. Out of scope to add it; only `get_candidates` (batch) is mapped.
3. `feat/crustdata-live-mcp-sourcing` does not exist yet in the Laravel repo (see Branches constraint).
4. The model-spec prompts claim "All 13 platform tools remain available" — the server now registers 22 tools. Stale copy, not fixed here (out of scope).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `/Users/eth0/Herd/360ai/app/Services/Agent/CandidateService.php` | Modify | Add `getMany()` aggregation over existing `get()` |
| `/Users/eth0/Herd/360ai/app/Mcp/Tools/GetCandidates.php` | Create | MCP tool: validate `ids[]` (1–10), call `getMany()` |
| `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php` | Modify | Register `GetCandidates`, mention batch tool in server instructions |
| `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetCandidatesToolTest.php` | Create | Pest tests for tool + aggregation + registration |
| `/Users/eth0/Herd/chat.360ai/librechat.yaml` | Modify | `endpoints.agents.recursionLimit: 80`; deep-dive promptPrefix edits ('360ai', 'headhunter', 'shortlister' specs) |
| `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/tools.ts` | Modify | Map `get_candidates` → `talents` kind |
| `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/types.ts` | Modify | Add `CandidateProfile` input type |
| `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/parse.ts` | Modify | Parse batch envelope → `Talent[]` (normalize `open_to_work`, linkedin url) |
| `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts` | Modify | Jest tests for the new mapping |

---

### Task 1: Laravel — `CandidateService::getMany()` + `GetCandidates` MCP tool (TDD)

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Services/Agent/CandidateService.php` (add method after `get()`, which ends near line ~190)
- Create: `/Users/eth0/Herd/360ai/app/Mcp/Tools/GetCandidates.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetCandidatesToolTest.php`

**Interfaces:**
- Consumes: `CandidateService::get(AgentContext $context, int|string $id): array` (existing; throws `App\Mcp\Exceptions\ResourceNotFoundException` for unknown ids), `AgentContext::fromRequest()`, `Laravel\Mcp\Response::json()/error()`.
- Produces: `CandidateService::getMany(AgentContext $context, array $ids): array{count: int, candidates: array<int, array<string, mixed>>, not_found: array<int, string>}` and MCP tool `get_candidates` with request schema `ids: string[]` (required). Task 2 registers the tool class `App\Mcp\Tools\GetCandidates`. Task 4's client parser consumes the response envelope verbatim.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/eth0/Herd/360ai
git checkout feat/crustdata-live-mcp-sourcing 2>/dev/null || git checkout feature/360ai-chat-auth
git checkout -b feat/mcp-batch-candidates
```

- [ ] **Step 2: Write the failing tests**

Create `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetCandidatesToolTest.php` (conventions mirror `tests/Feature/Mcp/GetCandidateToolTest.php`: Pest, minimal isolated test server, `$this->mock()` on the service boundary):

```php
<?php

declare(strict_types=1);

use App\Mcp\Exceptions\ResourceNotFoundException;
use App\Mcp\Tools\GetCandidates;
use App\Models\Client;
use App\Models\User;
use App\Services\Agent\CandidateService;
use Laravel\Mcp\Server;

/**
 * Minimal MCP server for isolated GetCandidates testing.
 * Avoids resolving other tools that may not exist yet.
 */
class GetCandidatesTestServer extends Server
{
    protected string $name = 'get-candidates-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [
        GetCandidates::class,
    ];
}

test('get_candidates returns full profiles for multiple ids in one call', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CandidateService::class, function ($mock) {
        $mock->shouldReceive('getMany')
            ->once()
            ->andReturn([
                'count' => 2,
                'candidates' => [
                    [
                        'id' => 'abc123',
                        'name' => 'Jane Doe',
                        'title' => 'Senior Laravel Engineer',
                        'current_company' => 'Acme Corp',
                        'has_email' => true,
                        'has_phone' => false,
                        'skills' => ['PHP', 'Laravel'],
                    ],
                    [
                        'id' => 'def456',
                        'name' => 'John Smith',
                        'title' => 'Backend Developer',
                        'current_company' => 'Tech GmbH',
                        'has_email' => false,
                        'has_phone' => true,
                        'skills' => ['Symfony'],
                    ],
                ],
                'not_found' => [],
            ]);
    });

    $response = GetCandidatesTestServer::actingAs($user)->tool(GetCandidates::class, [
        'ids' => ['abc123', 'def456'],
    ]);

    $response->assertOk();
    $response->assertSee('Jane Doe');
    $response->assertSee('John Smith');
    $response->assertSee('has_email');
    $response->assertSee('has_phone');
    $response->assertDontSee('"emails"');
    $response->assertDontSee('"phone_numbers"');
});

test('get_candidates aggregates found profiles and reports missing ids', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    // Partial mock: getMany() runs REAL aggregation logic; only the
    // Elasticsearch-backed get() boundary is mocked.
    $this->partialMock(CandidateService::class, function ($mock) {
        $mock->shouldReceive('get')
            ->twice()
            ->andReturnUsing(function ($context, string $id) {
                if ($id === 'missing') {
                    throw new ResourceNotFoundException('Candidate #missing not found.');
                }

                return [
                    'id' => $id,
                    'name' => 'Jane Doe',
                    'has_email' => true,
                    'has_phone' => false,
                ];
            });
    });

    $response = GetCandidatesTestServer::actingAs($user)->tool(GetCandidates::class, [
        'ids' => ['abc123', 'missing'],
    ]);

    $response->assertOk();
    $response->assertSee('Jane Doe');
    $response->assertSee('not_found');
    $response->assertSee('missing');
});

test('get_candidates rejects more than 10 ids without calling the service', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CandidateService::class, function ($mock) {
        $mock->shouldReceive('getMany')->never();
    });

    $response = GetCandidatesTestServer::actingAs($user)->tool(GetCandidates::class, [
        'ids' => ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
    ]);

    $response->assertHasErrors();
    $response->assertSee('at most 10');
});

test('get_candidates rejects an empty ids list', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CandidateService::class, function ($mock) {
        $mock->shouldReceive('getMany')->never();
    });

    $response = GetCandidatesTestServer::actingAs($user)->tool(GetCandidates::class, [
        'ids' => [],
    ]);

    $response->assertHasErrors();
    $response->assertSee('at least one');
});

test('get_candidates deduplicates repeated ids before fetching', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->partialMock(CandidateService::class, function ($mock) {
        $mock->shouldReceive('get')
            ->once()
            ->andReturn(['id' => 'abc123', 'name' => 'Jane Doe', 'has_email' => false, 'has_phone' => false]);
    });

    $response = GetCandidatesTestServer::actingAs($user)->tool(GetCandidates::class, [
        'ids' => ['abc123', 'abc123', 'abc123'],
    ]);

    $response->assertOk();
    $response->assertSee('Jane Doe');
});

test('get_candidates fails for unauthenticated request', function () {
    $response = GetCandidatesTestServer::tool(GetCandidates::class, [
        'ids' => ['abc123'],
    ]);

    $response->assertHasErrors();
    $response->assertSee('authenticated');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/GetCandidatesToolTest.php
```

Expected: FAIL — `Class "App\Mcp\Tools\GetCandidates" not found`. (Run ONLY this file; the wider suite has known unrelated breakage.)

- [ ] **Step 4: Add `CandidateService::getMany()`**

In `/Users/eth0/Herd/360ai/app/Services/Agent/CandidateService.php`, insert directly after the closing brace of `get()` (before `stagesByJob()`):

```php
    /**
     * Get full detail for multiple candidates in one call.
     *
     * Unknown IDs are collected into `not_found` instead of failing the
     * whole batch. Same contact stripping as get(): only has_email /
     * has_phone booleans, never raw contact values.
     *
     * @param  array<int, string>  $ids
     * @return array{count: int, candidates: array<int, array<string, mixed>>, not_found: array<int, string>}
     */
    public function getMany(AgentContext $context, array $ids): array
    {
        $candidates = [];
        $notFound = [];

        foreach ($ids as $id) {
            try {
                $candidates[] = $this->get($context, $id);
            } catch (ResourceNotFoundException) {
                $notFound[] = (string) $id;
            }
        }

        return [
            'count' => count($candidates),
            'candidates' => $candidates,
            'not_found' => $notFound,
        ];
    }
```

(`ResourceNotFoundException` is already imported at the top of the file.)

- [ ] **Step 5: Create the tool**

Create `/Users/eth0/Herd/360ai/app/Mcp/Tools/GetCandidates.php` (conventions mirror `GetCandidate.php`; array schema style mirrors `SearchTalents.php:90` / `SearchJobs.php:67`):

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\Agent\CandidateService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
#[IsIdempotent]
class GetCandidates extends Tool
{
    private const MAX_IDS = 10;

    protected string $name = 'get_candidates';

    protected string $description = 'Returns full detail for up to 10 candidates in ONE call (work history, skills, education, enrichment data). Use this instead of repeated get_candidate calls when deep-diving a shortlist. Unknown IDs are reported in not_found instead of failing the batch.';

    public function handle(Request $request, CandidateService $service): Response
    {
        try {
            $context = AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $ids = collect($request->get('ids', []))
            ->map(fn ($id) => (string) $id)
            ->filter()
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return Response::error('Provide at least one candidate ID.');
        }

        if ($ids->count() > self::MAX_IDS) {
            return Response::error('Provide at most '.self::MAX_IDS.' candidate IDs per call.');
        }

        return Response::json($service->getMany($context, $ids->all()));
    }

    /**
     * @return array<string, \Illuminate\Contracts\JsonSchema\JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'ids' => $schema->array()
                ->items($schema->string())
                ->description('Candidate IDs to retrieve full profiles for (1-10 per call).')
                ->required(),
        ];
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/GetCandidatesToolTest.php
```

Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Services/Agent/CandidateService.php app/Mcp/Tools/GetCandidates.php tests/Feature/Mcp/GetCandidatesToolTest.php
git commit -m "feat(mcp): add get_candidates batch profile tool (ids[], max 10)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Laravel — register `get_candidates` on `RecruitingServer` (TDD)

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetCandidatesToolTest.php` (append one test)

**Interfaces:**
- Consumes: `App\Mcp\Tools\GetCandidates` (Task 1).
- Produces: `get_candidates` live on the `360ai` MCP server — the tool name the chat.360ai prompts (Tasks 5–6) and card mapping (Task 4) rely on.

- [ ] **Step 1: Append the failing registration test**

Add to the end of `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetCandidatesToolTest.php`:

```php
test('get_candidates is registered on the recruiting server', function () {
    $tools = (new ReflectionClass(\App\Mcp\Servers\RecruitingServer::class))
        ->getProperty('tools')
        ->getDefaultValue();

    expect($tools)->toContain(\App\Mcp\Tools\GetCandidates::class);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/GetCandidatesToolTest.php --filter="registered on the recruiting server"
```

Expected: FAIL — assertion that `$tools` contains `GetCandidates::class`.

- [ ] **Step 3: Register the tool**

In `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php`:

1. Add the import in the existing `use App\Mcp\Tools\...` block, directly after `use App\Mcp\Tools\GetCandidate;`:

```php
use App\Mcp\Tools\GetCandidates;
```

2. Add to the `$tools` array, directly after `GetCandidate::class,`:

```php
        GetCandidates::class,
```

3. Update the `#[Instructions]` heredoc — replace this line:

```
You can search candidates, browse jobs, view pipeline stages, and check usage.
```

with:

```
You can search candidates, browse jobs, view pipeline stages, and check usage.
Use get_candidates (ids[], max 10) to pull full profiles for a whole
shortlist in one call instead of repeated get_candidate calls.
```

- [ ] **Step 4: Run the full test file to verify everything passes**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/GetCandidatesToolTest.php
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/GetCandidatesToolTest.php
git commit -m "feat(mcp): register get_candidates on the 360ai recruiting server

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Note: after deploying/restarting the provider, MCP clients pick up the new tool on their next tools/list. Locally, restart the chat.360ai backend to refresh its MCP connection when smoke-testing (Task 7).

---

### Task 3: chat.360ai — raise the agent-loop recursion limit via `endpoints.agents.recursionLimit`

**Files:**
- Modify: `/Users/eth0/Herd/chat.360ai/librechat.yaml:815-819` (the active `endpoints:` block)

**Interfaces:**
- Consumes: `resolveRecursionLimit` cascade (verified — see Global Constraints). No code changes needed; `packages/api/src/agents/config.spec.ts` already tests the resolver, including the yaml-override path.
- Produces: effective recursion limit of 80 for every model-spec conversation (ephemeral agents have no per-agent `recursion_limit`, and no `maxRecursionLimit` is set, so 80 is the final value).

- [ ] **Step 1: Edit `librechat.yaml`**

The active endpoints block currently reads (lines 814-819):

```yaml
# Definition of custom endpoints
endpoints:
  # 360AI: only the Anthropic endpoint is active. Models are locked via ANTHROPIC_MODELS in .env.
  anthropic:
    titleModel: 'claude-opus-4-6'
    streamRate: 25
```

Replace with:

```yaml
# Definition of custom endpoints
endpoints:
  # 360AI: only the Anthropic endpoint is active. Models are locked via ANTHROPIC_MODELS in .env.
  anthropic:
    titleModel: 'claude-opus-4-6'
    streamRate: 25
  # 360AI: deep-dive sourcing runs need a high agent-loop ceiling (rich search →
  # fresh-results re-polls → batch profile pull → per-company verification →
  # synthesis). Model-spec conversations run as ephemeral agents with no
  # per-agent recursion_limit, so endpoints.agents.recursionLimit is the only
  # effective knob — see resolveRecursionLimit in
  # packages/api/src/agents/config.ts (fork default 50; upstream comments below
  # claiming 25 are stale).
  agents:
    recursionLimit: 80
```

Do NOT touch the commented `# agents:` example at lines ~833-837 — it stays as documentation.

- [ ] **Step 2: Verify the yaml parses and the key lands**

```bash
cd /Users/eth0/Herd/chat.360ai && node -e "const{load}=require('js-yaml');const c=load(require('fs').readFileSync('librechat.yaml','utf8'));console.log(JSON.stringify(c.endpoints.agents))"
```

Expected output: `{"recursionLimit":80}`
(If `js-yaml` is not resolvable from root, run the same via `node -e` with `require('./api/node_modules/js-yaml')`.)

- [ ] **Step 3: Confirm the resolver behavior is already covered by tests (no changes expected)**

```bash
cd /Users/eth0/Herd/chat.360ai/packages/api && npx jest src/agents/config.spec.ts
```

Expected: PASS — including `uses yaml recursionLimit when set` (100 in the test; proves the `endpoints.agents.recursionLimit` path we rely on).

- [ ] **Step 4: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(agents): raise agent-loop recursion limit to 80 for deep-dive sourcing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: chat.360ai — map `get_candidates` output to talent cards (TDD)

**Files:**
- Modify: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/tools.ts`
- Modify: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/types.ts`
- Modify: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/parse.ts`
- Test: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts`

**Interfaces:**
- Consumes: the pinned `get_candidates` response envelope (Global Constraints); existing `Talent`, `Parsed360Result` types; existing helpers in `parse.ts` (`isRecord`, `filterRecords`, `toCount`, `hasError`, `safeParse`).
- Produces: `AI360_TOOLS.get_candidates === 'talents'`; `parse360Output('get_candidates', output)` returns `{ kind: 'talents', talents: Talent[], count: number }`. Rendering then flows through the EXISTING pipeline unchanged: `ToolCall.tsx:110` gates on `is360Tool(function_name)` + server `360ai`, `index.tsx` `RENDERERS.talents` → `TalentsResult` → `ResultList` of `TalentCard` (this is exactly how `search_talents`/`search_candidates` multi-result lists render today — no renderer changes needed).

- [ ] **Step 1: Write the failing tests**

In `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts`, extend the `is360Tool` test — inside the existing `it('recognizes 360AI tool names and rejects others', ...)`, after the `get_job` expectation add:

```ts
    expect(is360Tool('get_candidates')).toBe(true);
    expect(is360Tool('get_candidate')).toBe(false);
```

Then append inside the `describe('parse360Output', ...)` block:

```ts
  it('parses get_candidates batch envelope into talents kind', () => {
    const output = JSON.stringify({
      count: 2,
      not_found: ['zzz'],
      candidates: [
        {
          id: 'a',
          name: 'Jane Doe',
          avatar: 'https://cdn.example.com/jane.png',
          title: 'Senior Laravel Engineer',
          current_company: 'Acme',
          location: 'London, United Kingdom',
          skills: ['PHP', 'Laravel'],
          summary: 'Ten years of PHP.',
          open_to_work: { looking: true, availability: 'immediately' },
          profiles: [
            { network: 'github', url: 'https://github.com/janedoe' },
            { network: 'linkedin', url: 'https://www.linkedin.com/in/janedoe' },
          ],
        },
        { id: 'b', name: 'John Roe', open_to_work: null, profiles: [] },
      ],
    });
    const result = parse360Output('get_candidates', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.count).toBe(2);
      expect(result.talents).toHaveLength(2);
      expect(result.talents[0].open_to_work).toBe(true);
      expect(result.talents[0].linkedin_url).toBe('https://www.linkedin.com/in/janedoe');
      expect(result.talents[0].skills).toEqual(['PHP', 'Laravel']);
      expect(result.talents[1].open_to_work).toBe(false);
      expect(result.talents[1].linkedin_url).toBeNull();
    }
  });

  it('falls back to candidates length when get_candidates count is missing', () => {
    const output = JSON.stringify({
      candidates: [{ id: 'a', name: 'Jane Doe' }],
      not_found: [],
    });
    const result = parse360Output('get_candidates', output);
    expect(result?.kind).toBe('talents');
    if (result?.kind === 'talents') {
      expect(result.count).toBe(1);
    }
  });

  it('returns null for get_candidates error or malformed payloads', () => {
    expect(parse360Output('get_candidates', JSON.stringify({ error: 'nope' }))).toBeNull();
    expect(parse360Output('get_candidates', JSON.stringify({ candidates: 'oops' }))).toBeNull();
    expect(parse360Output('get_candidates', 'not json')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
```

Expected: FAIL — `is360Tool('get_candidates')` returns `false`; the three new `parse360Output` tests return `null` where `talents` is expected.

- [ ] **Step 3: Add the tool mapping in `tools.ts`**

In `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/tools.ts`, change the `AI360_TOOLS` map — after the `search_candidates` line add `get_candidates`:

```ts
export const AI360_TOOLS = {
  search_companies: 'companies',
  search_talents: 'talents',
  search_candidates: 'talents',
  get_candidates: 'talents',
  search_jobs: 'jobs',
  list_jobs: 'jobs',
  get_job: 'job',
  enrich_contact: 'contact',
  send_outreach: 'outreach',
} as const;
```

- [ ] **Step 4: Add the `CandidateProfile` type in `types.ts`**

In `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/types.ts`, insert directly after the `Talent` interface:

```ts
export interface CandidateProfileLink {
  network?: string | null;
  url?: string | null;
}

/** Full-profile shape returned by the get_candidates batch MCP tool. */
export interface CandidateProfile {
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
  title?: string | null;
  headline?: string | null;
  summary?: string | null;
  location?: string | null;
  current_company?: string | null;
  open_to_work?: { looking?: boolean } | boolean | null;
  skills?: string[];
  profiles?: CandidateProfileLink[];
}
```

- [ ] **Step 5: Add the parser in `parse.ts`**

In `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/parse.ts`:

1. Extend the type-only import at the top with `CandidateProfile` (imports in this file are already a single `import type { ... } from './types';` — add `CandidateProfile,` to the list).

2. Insert directly after the `parseTalents` function:

```ts
function candidateToTalent(candidate: CandidateProfile): Talent {
  const linkedin = candidate.profiles?.find((p) => p.network === 'linkedin')?.url ?? null;
  const openToWork = isRecord(candidate.open_to_work)
    ? candidate.open_to_work.looking === true
    : candidate.open_to_work === true;
  return {
    id: candidate.id,
    name: candidate.name,
    avatar: candidate.avatar,
    title: candidate.title,
    current_company: candidate.current_company,
    location: candidate.location,
    linkedin_url: linkedin,
    open_to_work: openToWork,
    skills: candidate.skills,
    summary: candidate.summary,
  };
}

function parseCandidateProfiles(data: unknown): Parsed360Result | null {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return null;
  }
  const talents = filterRecords<CandidateProfile>(data.candidates, 'name').map(candidateToTalent);
  return { kind: 'talents', talents, count: toCount(data.count, talents.length) };
}
```

3. Add the switch case in `parse360Output`, directly after the `search_candidates` case:

```ts
    case 'search_talents':
    case 'search_candidates':
      return parseTalents(data);
    case 'get_candidates':
      return parseCandidateProfiles(data);
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
```

Expected: PASS (all existing + 3 new tests).

- [ ] **Step 7: Run the neighboring AI360 suites to catch regressions**

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360/__tests__
```

Expected: PASS (registry/index/card tests unaffected — the `talents` renderer is unchanged).

- [ ] **Step 8: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/tools.ts client/src/components/Chat/Messages/Content/AI360/types.ts client/src/components/Chat/Messages/Content/AI360/parse.ts client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
git commit -m "feat(ai360): render get_candidates batch results as talent cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: chat.360ai — deep-dive choreography in the `'360ai'` spec `promptPrefix`

**Files:**
- Modify: `/Users/eth0/Herd/chat.360ai/librechat.yaml:506-526` (section "2. THEN GO DEEP..." inside the `'360ai'` spec's `promptPrefix`)

**Interfaces:**
- Consumes: pinned `search_talents` re-poll contract and `get_candidates` tool name (Tasks 1–2). Existing prompt structure: sections 1/1b (anchor+intake), 2 (go deep), 3 (chain to end goal), 4 (pause only for billable/irreversible). Only section 2 is replaced; 1, 1b, 3, 4 and the Style block stay byte-identical — this integrates with the existing workflow phases, it does not clobber them.
- Produces: the autonomous deep-dive loop (rich search → re-poll → batch profiles → company verification → ranked evidence-backed shortlist) as spec'd.

- [ ] **Step 1: Replace section 2 of the `'360ai'` promptPrefix**

Using the Edit tool on `/Users/eth0/Herd/chat.360ai/librechat.yaml`, replace this exact block (currently lines 506-526; note the odd wrapping of "Then screen / them against / the brief" — match it exactly):

```
          2. THEN GO DEEP, AND SHOW YOUR WORK — once you have the brief,
             never stop at a raw search list. Narrate the sourcing funnel in
             plain, REAL numbers from the search result as you go, so the
             recruiter sees the effort: how many matching candidates you
             FOUND (the result's `total`), how many you pulled to review (the
             returned candidates), and that you are screening them — e.g.
             "Found 312 Laravel engineers in London (8+ yrs) in the global
             pool — pulled the top 25 to review, screening them now…". Lead
             with the number FOUND, not the number "searched". Use the actual
             numbers the tool returns; never invent a count. Then screen
             them against
             the brief and present a RANKED shortlist (aim for the top ~10)
             with a one-line reason each made the cut; pull full profiles for
             the top few with the candidate-detail tool to add real depth
             (skills, tenure, relevant companies, education). Flag who is
             open to work and who is contactable. Close with a clear,
             concrete next step you can take.
             Do NOT enrich contact details or take any credit-spending
             action while sourcing — enrichment is billable, so fetch
             contacts only when the recruiter asks you to pursue specific
             people.
```

with:

```
          2. THEN GO DEEP — RUN THE FULL DEEP-DIVE LOOP, AND SHOW YOUR
             WORK — once you have the brief, never stop at a raw search
             list. Narrate the sourcing funnel in plain, REAL numbers from
             the search result as you go, so the recruiter sees the effort:
             how many matching candidates you FOUND (the result's `total`),
             how many you pulled to review (the returned candidates), and
             that you are screening them — e.g. "Found 312 Laravel engineers
             in London (8+ yrs) in the global pool — pulled the top 25 to
             review, screening them now…". Lead with the number FOUND, not
             the number "searched". Use the actual numbers the tool returns;
             never invent a count. Run this loop autonomously, in one turn,
             without pausing between steps:
             2a. SEARCH RICH: call `search_talents` with the richest filter
                 set the brief supports (titles, skills, location, seniority,
                 years of experience) — never just a bare keyword. Resolve
                 exact filter values with `autocomplete` first. Refine and
                 re-run if results are thin or off-target.
             2b. RE-POLL FRESH RESULTS: if the response has
                 `fresh_results_pending: true`, live sourcing is filling the
                 pool in the background. Continue useful work (screening the
                 candidates you already have), then re-call `search_talents`
                 with EXACTLY the same arguments after the response's
                 `poll_after_seconds` hint. Re-poll up to 2 times, merge and
                 de-duplicate by id, and tell the recruiter when fresh
                 candidates arrived. If `fresh_results_pending` is false or
                 absent, do not re-poll.
             2c. PULL FULL PROFILES IN BATCH: shortlist the strongest ~10
                 candidates, then call `get_candidates` ONCE with their ids
                 (`ids: [...]`, max 10 per call) to fetch full profiles —
                 work history, tenure, education, skills, open-to-work — in
                 a single call. Do NOT loop `get_candidate` one id at a
                 time. Screen every profile against the brief.
             2d. VERIFY CURRENT COMPANIES: for shortlisted candidates whose
                 company signals are thin or stale (unknown employer, no
                 industry data, a `job_start_date` years back), verify with
                 `search_companies`, and use web search for live signals —
                 recent funding, layoffs, hiring freezes, acquisitions —
                 that change the pitch or the candidate's likely openness.
                 Skip verification when the profile data is already fresh
                 and unambiguous.
             2e. DELIVER A RANKED SHORTLIST: present the candidates RANKED
                 against the brief, each with a short fit rationale citing
                 concrete evidence from their profile (tenure, stack,
                 companies, education) and any company signals you verified.
                 Flag who is open to work and who is contactable
                 (has_email/has_phone). Close with a clear, concrete next
                 step you can take.
             Do NOT enrich contact details or take any credit-spending
             action while sourcing — enrichment is billable, so fetch
             contacts only when the recruiter asks you to pursue specific
             people.
```

Leave section 4 (PAUSE ONLY for billable/irreversible actions, lines 547-550) untouched — it already encodes the autonomy rule.

- [ ] **Step 2: Verify yaml still parses and the choreography landed**

```bash
cd /Users/eth0/Herd/chat.360ai && node -e "const{load}=require('js-yaml');const c=load(require('fs').readFileSync('librechat.yaml','utf8'));const p=c.modelSpecs.list[0].preset.promptPrefix;['fresh_results_pending','poll_after_seconds','get_candidates','2e. DELIVER A RANKED SHORTLIST'].forEach(k=>{if(!p.includes(k)){throw new Error('missing: '+k)}});if(!p.includes('PAUSE ONLY')){throw new Error('section 4 clobbered')};console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(prompts): autonomous deep-dive loop in the 360ai model spec

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: chat.360ai — align `headhunter` and `shortlister` specs with re-poll + batch tool

**Files:**
- Modify: `/Users/eth0/Herd/chat.360ai/librechat.yaml:596-602` (headhunter workflow steps 1-2) and `:660-661` (shortlister preferred tools)

**Interfaces:**
- Consumes: same pinned contracts as Task 5.
- Produces: no spec left instructing a per-id `get_candidate` loop that contradicts the batch tool.

- [ ] **Step 1: Update headhunter workflow steps 1-2**

Replace this exact block (lines 596-602):

```
          1. Source: run search_talents (pool: global); refine and re-run the
             filters if results are thin or off-target until you have a strong
             set.
          2. Deepen: for the strongest ~5–8 candidates, call get_candidate to
             pull full profiles (work history, education, skills,
             certifications). This is free and read-only — do it automatically,
             do not wait to be asked.
```

with:

```
          1. Source: run search_talents (pool: global) with rich filters;
             refine and re-run if results are thin or off-target until you
             have a strong set. If the response has
             `fresh_results_pending: true`, live sourcing is still filling
             the pool: re-call search_talents with EXACTLY the same
             arguments after the response's `poll_after_seconds` hint (up to
             2 re-polls), merge, and de-duplicate by id.
          2. Deepen: for the strongest ~5–10 candidates, call get_candidates
             ONCE with their ids (max 10 per call) to pull full profiles
             (work history, education, skills, certifications) in a single
             batch — do not loop get_candidate one id at a time. This is
             free and read-only — do it automatically, do not wait to be
             asked.
```

- [ ] **Step 2: Update the shortlister preferred-tools list**

Replace this exact block (lines 660-661, inside the shortlister promptPrefix):

```
          search_candidates, get_candidate, pipeline_stages, and
          stage_candidates. Produce evidence-based, bias-aware fit assessments;
```

with:

```
          search_candidates, get_candidates (batch full profiles, ids max
          10), get_candidate, pipeline_stages, and
          stage_candidates. Produce evidence-based, bias-aware fit assessments;
```

- [ ] **Step 3: Verify yaml parses and both specs updated**

```bash
cd /Users/eth0/Herd/chat.360ai && node -e "const{load}=require('js-yaml');const c=load(require('fs').readFileSync('librechat.yaml','utf8'));const byName=n=>c.modelSpecs.list.find(s=>s.name===n).preset.promptPrefix;const hh=byName('headhunter');const sl=byName('shortlister');if(!hh.includes('poll_after_seconds')||!hh.includes('get_candidates')){throw new Error('headhunter missing edits')}if(!sl.includes('get_candidates')){throw new Error('shortlister missing edits')}console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(prompts): re-poll + batch profile guidance in headhunter/shortlister specs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification (source-level + optional backend smoke)

**Files:** none created (verification only).

**Interfaces:**
- Consumes: everything above.

Browser QA is explicitly out (unreliable per known limitation). Verification is layered:

- [ ] **Step 1: Re-run every automated check in one pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/GetCandidatesToolTest.php
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360/__tests__
cd /Users/eth0/Herd/chat.360ai/packages/api && npx jest src/agents/config.spec.ts
cd /Users/eth0/Herd/chat.360ai && node -e "const{load}=require('js-yaml');const c=load(require('fs').readFileSync('librechat.yaml','utf8'));console.log(c.endpoints.agents.recursionLimit)"
```

Expected: all PASS; final command prints `80`.

- [ ] **Step 2 (optional, requires local stack): direct backend smoke test**

With MongoDB up, the 360ai Laravel app served (Herd), and `npm run backend:dev` running in chat.360ai:

1. Confirm the backend boots and logs show the `360ai` MCP server connecting with its tool list including `get_candidates` (grep the backend console output for `get_candidates`).
2. Ask, via the UI at `https://chat.360ai.test` in a normal (non-headless) browser session, "find me senior Laravel devs" against a live job and observe: multiple tool calls in one turn, a `get_candidates` call rendering talent cards, no recursion-limit error at ≤80 steps.

This step is a manual spot-check, not a gate; the automated checks in Step 1 are the acceptance bar.

- [ ] **Step 3: Wrap up branches**

Use the superpowers:finishing-a-development-branch skill for both repos: `feat/mcp-batch-candidates` (360ai) and `feat/360ai-result-cards` (chat.360ai).

---

## Self-Review (run against the spec)

**1. Spec coverage** (sub-project 3 items):
- "Raise the agent loop ceiling… target ≥ 50; verify exact mechanism via resolveRecursionLimit" → Task 3 (mechanism verified: `endpoints.agents.recursionLimit`, fork default 50, set to 80). ✔
- "Prompt choreography… (a) rich filters (b) fresh_results_pending re-poll (c) get_candidate full profiles (d) verify companies via search_companies + web_search (e) ranked shortlist with rationale; keep pause-only-for-billable rule" → Task 5 steps 2a-2e; pause rule preserved untouched (verified by the Step 2 script asserting `PAUSE ONLY` still present); (c) upgraded to the batch tool per spec item 3. ✔
- "Batch profile fetch: get_candidates MCP tool (ids[], max ~10), contacts stripped same as get_candidate" → Tasks 1-2 (contacts stripping inherited from `get()`; tests assert no raw contact keys). ✔
- "Result cards: map get_candidates to existing TalentCard rendering in AI360/tools.ts" → Task 4 (mirrors how `search_candidates` lists render: `talents` kind → `TalentsResult` → `ResultList` of `TalentCard`). ✔
- "Testing: jest for tools.ts mapping; source-level yaml verification; direct API smoke where feasible" → Tasks 4 and 7. ✔
- Gaps: none found. Additions beyond pinned lines: headhunter/shortlister prompt alignment (Task 6) — justified because the headhunter spec explicitly instructed the per-id `get_candidate` loop the batch tool replaces.

**2. Placeholder scan:** no TBD/TODO/"similar to Task N"; every code step shows complete code; every test step has runnable commands with expected outcomes. One intentional runtime-conditional: the Task 1 branch checkout falls back when sub-project 2's branch is absent — documented in Global Constraints, not a placeholder.

**3. Type consistency:** `getMany(AgentContext, array $ids): array{count, candidates, not_found}` (Task 1) matches the envelope the tool returns (Task 1 Step 5), the Pest fixtures (Task 1 Step 2), and the client parser's expectations (`data.candidates` array, `data.count`, Task 4). `CandidateProfile`/`candidateToTalent`/`parseCandidateProfiles` names are used consistently across Task 4 steps. Tool name `get_candidates` is identical in the Laravel `$name`, `AI360_TOOLS` key, the `parse360Output` case, and all prompt text. ✔
