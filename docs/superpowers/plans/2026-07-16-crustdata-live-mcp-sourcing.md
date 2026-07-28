# Live Crustdata Sourcing from MCP search_talents (Trigger + Poll) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MCP `search_talents` tool trigger live Crustdata sourcing in the background on fresh global-pool searches and tell the model when (and that) it should re-poll for the newly sourced profiles.

**Architecture:** `TalentSearchService::search()` asks a refactored `CrustdataSeeder` for a *seed disposition* (Skip / InFlight / Dispatch) derived from the seeder's existing 30-min filter-hash cache plus a new short-lived `:queued` in-flight marker. On `Dispatch` it queues a new `SeedTalentPoolFromCrustdata` job (which wraps the existing synchronous `CrustdataSeeder::seed()` — the same seeding the web talent-finder runs inline) and returns current Elasticsearch results immediately. The tool response gains `fresh_results_pending` and `poll_after_seconds`, and the tool description + MCP server instructions teach the model the re-poll loop.

**Tech Stack:** Laravel (PHP 8.3, `declare(strict_types=1)`), Laravel queues (`background-search` queue), Laravel Cache, Laravel MCP (`laravel/mcp`), Pest + Mockery tests.

## Global Constraints

- **Repo:** all file paths below are relative to `/Users/eth0/Herd/360ai` (the 360AI Laravel platform). This plan does NOT touch `/Users/eth0/Herd/chat.360ai`.
- **Execution order:** this plan executes AFTER sub-project 1 (Crustdata mapping fidelity). Work on branch `feat/crustdata-live-mcp-sourcing`, created from `feat/crustdata-mapping-fidelity` (sub-project 1's branch). As of plan-writing time `feat/crustdata-mapping-fidelity` does not exist yet — if it is still missing when you start, STOP and report back; do not branch from anything else.
- **Pinned tool-response contract (plans 2 and 3 must agree, copy verbatim):** the `search_talents` response gains `fresh_results_pending` (bool — true when the job was dispatched or seeding is known in-flight) and `poll_after_seconds` (int, `8`, only present when pending). When the seeder's filter-hash cache is warm: do NOT dispatch and return `fresh_results_pending: false`.
- **NO per-user credit checks** on Crustdata sourcing (explicit product decision — 360ai pays Crustdata at platform level). Do not add any credit/billing gate.
- **Dedupe guard = the existing filter-hash cache** (`crustdata_seed:<sha1>` written by `CrustdataSeeder::seed()`). The only addition allowed is the derived `crustdata_seed:<sha1>:queued` in-flight marker introduced in Task 1 — same hash, short TTL — required so "seeding is known in-flight" is observable (the main key is only written AFTER seeding completes, `app/Services/Crustdata/CrustdataSeeder.php:81`).
- **Config gate:** `config('suite.talent_lookup.crustdata.enabled')` (env `CRUSTDATA_ENABLED`, default `true`) must disable all of this.
- **Queue:** dispatch on the `background-search` queue at the dispatch site, mirroring `BackfillCrustdataTalents` and `LookupTalentsFromExternalSourcesInBackground`.
- **Testing:** Pest (`it(...)`, `expect(...)`), base `Tests\TestCase` with `LazilyRefreshDatabase`. The local suite has known breakage from the Laravel 13 upgrade — ONLY run the test files named in this plan (invoke `./vendor/bin/pest <file>` per file). Failures outside these files are pre-existing; do not chase them.
- **Pest helper functions are process-global.** Never reuse helper names that exist in other test files (`makeTalentFinderUser`, `mockTalentSearch`, `crustdataSearchTerm`, `crustdataHash`, `mockCrustdataCoverage` are taken). This plan's helpers use unique names.
- All new PHP files start with `declare(strict_types=1);`. Run `./vendor/bin/pint --dirty` before every commit.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Verified-source notes (spec deltas the implementer must know)

1. **`was_just_created` is true on effectively every MCP search.** MCP arguments never include a `qid`, so `QueryManager::create()` (`app/TalentLookup/QueryManager.php:125-130`) always persists a new Filter and sets `was_just_created = true` (also true on the `updateQuery()` path, `:255`). The `was_just_created && pool global` gate therefore does no real dedupe work in the MCP path — the filter-hash cache is the actual guard. We keep the gate anyway (contract + mirrors the web flow in `app/Http/Controllers/TalentFinderQueryController.php:21-25`).
2. **`CrustdataSeeder::seed()` writes the cache key only after seeding finishes** (including on zero results). Between dispatch and completion the cache is cold, hence the `:queued` marker (set atomically with `Cache::add`) so concurrent/re-polled identical searches return `fresh_results_pending: true` without double-dispatching.
3. `CrustdataSeeder` lives at `app/Services/Crustdata/CrustdataSeeder.php`. It is fail-open (catches `\Throwable`), so the wrapping job never retries meaningfully; if seeding fails the `:queued` marker simply expires (default 5 min) and a later search can retry.
4. `TalentSearch::search()` is a static factory with no container seam (`app/Talent/TalentSearch.php:32`); tests must alias-mock it (existing pattern in `tests/Feature/Http/Controllers/TalentFinderCrustdataIngestionTest.php:38-49`). Repeated `Mockery::mock('alias:...')` calls in one process were verified to work as long as the real class is never autoloaded first — another reason these tests run in their own pest invocation.
5. An empty `new SearchTerm([])` produces an empty Crustdata filter payload (proven by the existing test `'is a no-op when the SearchTerm produces no filter payload'` in `tests/Feature/Services/Crustdata/CrustdataSeederTest.php:58`), and `new SearchTerm(['job_title' => 'Engineer'])` produces a non-empty one (same file, `crustdataSearchTerm()` helper).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `app/Enums/Crustdata/SeedDisposition.php` | Create | Tri-state seeding decision: `Dispatch` / `InFlight` / `Skip` |
| `app/Services/Crustdata/CrustdataSeeder.php` | Modify | Add `cacheKey()` + `disposition()`; extract shared `hashFilters()`; `seed()` behavior unchanged |
| `config/suite.php` | Modify | Add `queued_ttl_minutes` to the `crustdata` block |
| `app/Jobs/SeedTalentPoolFromCrustdata.php` | Create | Queued wrapper around `CrustdataSeeder::seed($term)` |
| `app/Services/Agent/TalentSearchService.php` | Modify | Gate + dispatch + `fresh_results_pending` / `poll_after_seconds` response fields |
| `app/Mcp/Tools/SearchTalents.php` | Modify | Tool description documents the re-poll contract |
| `app/Mcp/Servers/RecruitingServer.php` | Modify | Server instructions document the re-poll contract |
| `tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php` | Create | Disposition truth table against real Cache |
| `tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php` | Create | Job delegates to seeder |
| `tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php` | Create | Service-level dispatch + response-field tests |
| `tests/Feature/Mcp/SearchTalentsPollContractTest.php` | Create | Tool description + server instructions mention the contract |

---

### Task 1: `SeedDisposition` enum + `CrustdataSeeder::disposition()` / `cacheKey()`

**Files:**
- Create: `app/Enums/Crustdata/SeedDisposition.php`
- Modify: `app/Services/Crustdata/CrustdataSeeder.php` (imports at `:7-16`, hash lines at `:33-35`, new methods)
- Modify: `config/suite.php:19-26` (crustdata block)
- Test: `tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php`

**Interfaces:**
- Consumes: existing `CrustdataSeeder::seed(SearchTerm): void`, `CrustdataLookup::make(SearchTerm)->buildFilters(): array`, `config('suite.talent_lookup.crustdata.*')`.
- Produces (Tasks 2–3 rely on these exact signatures):
  - `App\Enums\Crustdata\SeedDisposition` — string-backed enum, cases `Dispatch = 'dispatch'`, `InFlight = 'in_flight'`, `Skip = 'skip'`.
  - `CrustdataSeeder::disposition(SearchTerm $searchTerm): SeedDisposition` — side effect: on the `Dispatch` path it atomically claims the `:queued` marker (so callers must dispatch when they receive `Dispatch`).
  - `CrustdataSeeder::cacheKey(SearchTerm $searchTerm): ?string` — `null` when crustdata disabled or the term yields no filters; otherwise `'crustdata_seed:'.sha1(json_encode(ksortRecursive(filters)))` — identical to the key `seed()` writes.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/eth0/Herd/360ai
git fetch --all --prune
git rev-parse --verify feat/crustdata-mapping-fidelity   # must succeed; if not, STOP (see Global Constraints)
git checkout -b feat/crustdata-live-mcp-sourcing feat/crustdata-mapping-fidelity
```

- [ ] **Step 2: Write the failing test file**

Create `tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php`:

```php
<?php

declare(strict_types=1);

use App\Enums\Crustdata\SeedDisposition;
use App\Services\Crustdata\CrustdataSeeder;
use App\TalentLookup\Crustdata\CrustdataLookup;
use App\TalentLookup\SearchTerm;
use Illuminate\Support\Facades\Cache;

function dispositionTerm(): SearchTerm
{
    return new SearchTerm(['job_title' => 'Engineer']);
}

beforeEach(function () {
    Cache::flush();
    config()->set('suite.talent_lookup.crustdata.enabled', true);
});

it('returns Skip when Crustdata is disabled via config', function () {
    config()->set('suite.talent_lookup.crustdata.enabled', false);

    expect(app(CrustdataSeeder::class)->disposition(dispositionTerm()))
        ->toBe(SeedDisposition::Skip);
});

it('returns Skip when the SearchTerm produces no Crustdata filter payload', function () {
    expect(app(CrustdataSeeder::class)->disposition(new SearchTerm([])))
        ->toBe(SeedDisposition::Skip);
});

it('returns Dispatch on a cold cache and claims the queued marker', function () {
    $seeder = app(CrustdataSeeder::class);

    expect($seeder->disposition(dispositionTerm()))->toBe(SeedDisposition::Dispatch)
        ->and(Cache::has($seeder->cacheKey(dispositionTerm()).':queued'))->toBeTrue();
});

it('returns InFlight while an identical seed is already queued', function () {
    $seeder = app(CrustdataSeeder::class);
    $seeder->disposition(dispositionTerm());

    expect($seeder->disposition(dispositionTerm()))->toBe(SeedDisposition::InFlight);
});

it('returns Skip when the filter-hash cache is warm, even with a stale queued marker', function () {
    $seeder = app(CrustdataSeeder::class);
    $key = $seeder->cacheKey(dispositionTerm());

    Cache::add($key.':queued', true, now()->addMinutes(5));
    Cache::put($key, true, now()->addMinutes(30));

    expect($seeder->disposition(dispositionTerm()))->toBe(SeedDisposition::Skip);
});

it('cacheKey returns null when disabled and null for a filterless term', function () {
    $seeder = app(CrustdataSeeder::class);

    expect($seeder->cacheKey(new SearchTerm([])))->toBeNull();

    config()->set('suite.talent_lookup.crustdata.enabled', false);

    expect($seeder->cacheKey(dispositionTerm()))->toBeNull();
});

it('derives exactly the cache key that seed() writes (hash format parity)', function () {
    $term = dispositionTerm();
    $filters = CrustdataLookup::make($term)->buildFilters();

    $ksort = function (array $a) use (&$ksort): array {
        foreach ($a as &$v) {
            if (is_array($v)) {
                $v = $ksort($v);
            }
        }
        unset($v);
        ksort($a);

        return $a;
    };

    expect(app(CrustdataSeeder::class)->cacheKey($term))
        ->toBe('crustdata_seed:'.sha1(json_encode($ksort($filters))));
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/eth0/Herd/360ai
./vendor/bin/pest tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php
```

Expected: FAIL — `Error: Class "App\Enums\Crustdata\SeedDisposition" not found` (and/or `Call to undefined method App\Services\Crustdata\CrustdataSeeder::disposition()`).

- [ ] **Step 4: Create the enum**

Create `app/Enums/Crustdata/SeedDisposition.php`:

```php
<?php

declare(strict_types=1);

namespace App\Enums\Crustdata;

enum SeedDisposition: string
{
    case Dispatch = 'dispatch';
    case InFlight = 'in_flight';
    case Skip = 'skip';
}
```

- [ ] **Step 5: Add the config key**

In `config/suite.php`, change the `crustdata` block (currently lines 19–26) to:

```php
        'crustdata' => [
            'enabled' => env('CRUSTDATA_ENABLED', true),
            'limit' => env('CRUSTDATA_SEARCH_LIMIT', 100),
            'max_total' => env('CRUSTDATA_MAX_TOTAL', 200),
            'background_max_total' => env('CRUSTDATA_BACKGROUND_MAX_TOTAL', 1000),
            'timeout_seconds' => env('CRUSTDATA_TIMEOUT_SECONDS', 10),
            'cache_ttl_minutes' => env('CRUSTDATA_CACHE_TTL_MINUTES', 30),
            'queued_ttl_minutes' => env('CRUSTDATA_QUEUED_TTL_MINUTES', 5),
        ],
```

- [ ] **Step 6: Refactor `CrustdataSeeder`**

In `app/Services/Crustdata/CrustdataSeeder.php`:

6a. Add the enum import. The import block (currently lines 7–16) becomes:

```php
use App\Enums\Crustdata\SeedDisposition;
use App\Jobs\BackfillCrustdataTalents;
use App\TalentLookup\Crustdata\CrustdataLookup;
use App\TalentLookup\SearchTerm;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Sentry\State\Scope;

use function Sentry\trace;

use Sentry\Tracing\SpanContext;
```

6b. Add a class constant as the first class member (above `seed()`):

```php
    private const CACHE_PREFIX = 'crustdata_seed:';
```

6c. Inside `seed()`, replace these three lines (currently `:33-35`):

```php
        $canonical = self::ksortRecursive($filters);
        $filtersHash = sha1(json_encode($canonical));
        $cacheKey = 'crustdata_seed:'.$filtersHash;
```

with:

```php
        $filtersHash = self::hashFilters($filters);
        $cacheKey = self::CACHE_PREFIX.$filtersHash;
```

6d. Add the new public methods and the shared hash helper directly below `seed()` (above `dispatchBackfillIfNeeded()`):

```php
    /**
     * Decide whether live seeding should be queued for this term.
     * `Dispatch` atomically claims the queued marker — the caller MUST
     * dispatch the seeding job when it receives `Dispatch`.
     */
    public function disposition(SearchTerm $searchTerm): SeedDisposition
    {
        $cacheKey = $this->cacheKey($searchTerm);

        if ($cacheKey === null || Cache::has($cacheKey)) {
            return SeedDisposition::Skip;
        }

        $queuedTtl = now()->addMinutes(
            (int) config('suite.talent_lookup.crustdata.queued_ttl_minutes', 5)
        );

        if (! Cache::add($cacheKey.':queued', true, $queuedTtl)) {
            return SeedDisposition::InFlight;
        }

        return SeedDisposition::Dispatch;
    }

    /**
     * The exact cache key seed() writes on completion for this term,
     * or null when Crustdata is disabled / the term yields no filters.
     */
    public function cacheKey(SearchTerm $searchTerm): ?string
    {
        if (! config('suite.talent_lookup.crustdata.enabled', true)) {
            return null;
        }

        $filters = CrustdataLookup::make($searchTerm)->buildFilters();

        if (empty($filters)) {
            return null;
        }

        return self::CACHE_PREFIX.self::hashFilters($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private static function hashFilters(array $filters): string
    {
        return sha1(json_encode(self::ksortRecursive($filters)));
    }
```

- [ ] **Step 7: Run the new tests — expect PASS**

```bash
./vendor/bin/pest tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php
```

Expected: 7 passed.

- [ ] **Step 8: Guard the refactor — run the existing seeder tests**

```bash
./vendor/bin/pest tests/Feature/Services/Crustdata/CrustdataSeederTest.php tests/Feature/Services/Crustdata/CrustdataSeederBackfillTest.php
```

Expected: PASS (these passed before the Laravel 13 upgrade caveat applies to *other* areas; if a failure here reproduces on `feat/crustdata-mapping-fidelity` without your changes, note it and move on — otherwise fix your refactor).

- [ ] **Step 9: Format + commit**

```bash
./vendor/bin/pint --dirty
git add app/Enums/Crustdata/SeedDisposition.php app/Services/Crustdata/CrustdataSeeder.php config/suite.php tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php
git commit -m "feat(crustdata): seed disposition + public cache key on CrustdataSeeder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `SeedTalentPoolFromCrustdata` queued job

**Files:**
- Create: `app/Jobs/SeedTalentPoolFromCrustdata.php`
- Test: `tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php`

**Interfaces:**
- Consumes: `CrustdataSeeder::seed(SearchTerm): void` (existing, unchanged by Task 1).
- Produces (Task 3 relies on this): `App\Jobs\SeedTalentPoolFromCrustdata` with constructor `__construct(public SearchTerm $searchTerm)` and `handle(CrustdataSeeder $seeder): void`. Dispatched via `SeedTalentPoolFromCrustdata::dispatch($term)->onQueue('background-search')` (queue set at dispatch site, matching `BackfillCrustdataTalents` / `LookupTalentsFromExternalSourcesInBackground` convention). The public property name `searchTerm` is used by Task 3's warm-cache test.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php`:

```php
<?php

declare(strict_types=1);

use App\Jobs\SeedTalentPoolFromCrustdata;
use App\Services\Crustdata\CrustdataSeeder;
use App\TalentLookup\SearchTerm;

it('delegates to CrustdataSeeder::seed with the exact job search term', function () {
    $term = new SearchTerm(['job_title' => 'Engineer']);

    $seeder = Mockery::mock(CrustdataSeeder::class);
    $seeder->shouldReceive('seed')
        ->once()
        ->with(Mockery::on(fn ($st) => $st === $term));

    (new SeedTalentPoolFromCrustdata($term))->handle($seeder);
});

it('is queueable with the conventions of the other crustdata jobs', function () {
    $job = new SeedTalentPoolFromCrustdata(new SearchTerm(['job_title' => 'Engineer']));

    expect($job)->toBeInstanceOf(Illuminate\Contracts\Queue\ShouldQueue::class)
        ->and($job->tries)->toBe(2)
        ->and($job->timeout)->toBe(300);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
./vendor/bin/pest tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php
```

Expected: FAIL — `Error: Class "App\Jobs\SeedTalentPoolFromCrustdata" not found`.

- [ ] **Step 3: Write the job**

Create `app/Jobs/SeedTalentPoolFromCrustdata.php` (mirrors `SeedTalentPoolForJob` trait layout and `BackfillCrustdataTalents` tries/timeout; carrying a `SearchTerm` on a queued job has precedent in `LookupTalentsFromExternalSourcesInBackground`):

```php
<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Services\Crustdata\CrustdataSeeder;
use App\TalentLookup\SearchTerm;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SeedTalentPoolFromCrustdata implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;

    public int $timeout = 300;

    public function __construct(public SearchTerm $searchTerm) {}

    public function handle(CrustdataSeeder $seeder): void
    {
        $seeder->seed($this->searchTerm);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./vendor/bin/pest tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php
```

Expected: 2 passed.

- [ ] **Step 5: Format + commit**

```bash
./vendor/bin/pint --dirty
git add app/Jobs/SeedTalentPoolFromCrustdata.php tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php
git commit -m "feat(crustdata): queued SeedTalentPoolFromCrustdata job wrapping CrustdataSeeder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire seeding into `TalentSearchService::search()` + response fields

**Files:**
- Modify: `app/Services/Agent/TalentSearchService.php` (imports `:5-14`, constructor `:18-20`, body after pool resolution `:64-66`, return array `:112-119`)
- Test: `tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php`

**Interfaces:**
- Consumes: `SeedDisposition` + `CrustdataSeeder::disposition()/cacheKey()` (Task 1), `SeedTalentPoolFromCrustdata` (Task 2), existing `Pool` enum (`App\Enums\TalentFinder\Pool`, cases `Global = 'global'` / `Internal = 'internal'`).
- Produces (Task 4 and sub-project 3 rely on this): search result array gains `'fresh_results_pending' => bool` always, and `'poll_after_seconds' => 8` ONLY when pending. Constant `TalentSearchService::POLL_AFTER_SECONDS = 8` (public).

- [ ] **Step 1: Write the failing test file**

Create `tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php`.

Notes baked into this file: `TalentSearch` is alias-mocked (no container seam; same pattern as `TalentFinderCrustdataIngestionTest`); the filters deliberately avoid `query`/`companies` so no OpenAI/company-resolution calls happen; results are empty so no geocoding happens; `Queue::fake()` also absorbs the unrelated `LookupTalentsFromExternalSourcesInBackground` dispatch from `QueryManager`, which is why assertions name the job class explicitly.

```php
<?php

declare(strict_types=1);

use App\Jobs\SeedTalentPoolFromCrustdata;
use App\Mcp\AgentContext;
use App\Models\Client;
use App\Models\ClientCustomer;
use App\Models\User;
use App\Services\Agent\TalentSearchService;
use App\Services\Crustdata\CrustdataSeeder;
use App\Talent\TalentSearch;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

function agentSearchContext(): AgentContext
{
    $client = Client::factory()->createQuietly([
        'trial_ends_at' => null,
        'trial_starts_at' => null,
        'onboarding_completed' => true,
        'approved' => true,
    ]);

    $clientCustomer = ClientCustomer::factory()->create([
        'client_id' => $client->id,
    ]);

    $user = User::factory()->create([
        'current_client_id' => $client->id,
        'current_client_customer_id' => $clientCustomer->id,
    ]);

    return new AgentContext($user, $client);
}

function fakeAgentTalentSearch(): void
{
    $emptyResults = Mockery::mock();
    $emptyResults->shouldReceive('resolve')->andReturn([]);

    $builder = Mockery::mock();
    $builder->shouldReceive('filter')->andReturnSelf();
    $builder->shouldReceive('usingPool')->andReturnSelf();
    $builder->shouldReceive('size')->andReturnSelf();
    $builder->shouldReceive('count')->andReturn(0);
    $builder->shouldReceive('get')->andReturn($emptyResults);

    Mockery::mock('alias:'.TalentSearch::class)
        ->shouldReceive('search')
        ->andReturn($builder);
}

function agentSearchFilters(): array
{
    return ['job_title' => 'engineer', 'countries' => ['gb']];
}

beforeEach(function () {
    Cache::flush();
    Http::fake();
    Queue::fake();
    config()->set('suite.talent_lookup.crustdata.enabled', true);
    fakeAgentTalentSearch();
});

it('dispatches Crustdata seeding for a fresh global search and flags pending', function () {
    $result = app(TalentSearchService::class)
        ->search(agentSearchContext(), agentSearchFilters(), 'global');

    Queue::assertPushedOn('background-search', SeedTalentPoolFromCrustdata::class);
    expect($result['fresh_results_pending'])->toBeTrue()
        ->and($result['poll_after_seconds'])->toBe(8);
});

it('does not dispatch seeding when Crustdata is disabled via config', function () {
    config()->set('suite.talent_lookup.crustdata.enabled', false);

    $result = app(TalentSearchService::class)
        ->search(agentSearchContext(), agentSearchFilters(), 'global');

    Queue::assertNotPushed(SeedTalentPoolFromCrustdata::class);
    expect($result['fresh_results_pending'])->toBeFalse()
        ->and($result)->not->toHaveKey('poll_after_seconds');
});

it('does not dispatch seeding for internal-pool searches', function () {
    $result = app(TalentSearchService::class)
        ->search(agentSearchContext(), agentSearchFilters(), 'internal');

    Queue::assertNotPushed(SeedTalentPoolFromCrustdata::class);
    expect($result['fresh_results_pending'])->toBeFalse()
        ->and($result)->not->toHaveKey('poll_after_seconds');
});

it('skips dispatch and reports not-pending when the filter-hash cache is warm', function () {
    $service = app(TalentSearchService::class);
    $context = agentSearchContext();

    $service->search($context, agentSearchFilters(), 'global');

    $job = Queue::pushed(SeedTalentPoolFromCrustdata::class)->first();
    Cache::put(
        app(CrustdataSeeder::class)->cacheKey($job->searchTerm),
        true,
        now()->addMinutes(30),
    );

    $result = $service->search($context, agentSearchFilters(), 'global');

    Queue::assertPushed(SeedTalentPoolFromCrustdata::class, 1);
    expect($result['fresh_results_pending'])->toBeFalse()
        ->and($result)->not->toHaveKey('poll_after_seconds');
});

it('reports pending without re-dispatching while an identical seed is in flight', function () {
    $service = app(TalentSearchService::class);
    $context = agentSearchContext();

    $first = $service->search($context, agentSearchFilters(), 'global');
    $second = $service->search($context, agentSearchFilters(), 'global');

    Queue::assertPushed(SeedTalentPoolFromCrustdata::class, 1);
    expect($first['fresh_results_pending'])->toBeTrue()
        ->and($second['fresh_results_pending'])->toBeTrue()
        ->and($second['poll_after_seconds'])->toBe(8);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
./vendor/bin/pest tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php
```

Expected: FAIL — first test with `The expected [App\Jobs\SeedTalentPoolFromCrustdata] job was not pushed` (or `Undefined array key "fresh_results_pending"`).

- [ ] **Step 3: Implement the service changes**

In `app/Services/Agent/TalentSearchService.php`:

3a. Replace the import block (currently lines 7–14) with:

```php
use App\Actions\Companies\SearchCompaniesByName;
use App\Enums\Crustdata\SeedDisposition;
use App\Enums\TalentFinder\Pool;
use App\Jobs\SeedTalentPoolFromCrustdata;
use App\KitchenSink\Geocode;
use App\Mcp\AgentContext;
use App\Services\Crustdata\CrustdataSeeder;
use App\Talent\TalentSearch;
use App\TalentLookup\QueryManager;
use App\TalentLookup\SearchTerm;
use Illuminate\Support\Facades\Cache;
```

3b. Replace the class opening + constructor (currently lines 16–20) with:

```php
class TalentSearchService
{
    public const POLL_AFTER_SECONDS = 8;

    public function __construct(
        private readonly SearchCompaniesByName $searchCompaniesByName,
        private readonly CrustdataSeeder $crustdataSeeder,
    ) {}
```

3c. Directly after the pool resolution (currently lines 64–66, `$pool = Pool::tryFrom(...) ?? ... ?? Pool::Global;`) and BEFORE `$search = TalentSearch::search()...`, insert:

```php
        $freshResultsPending = $this->queueCrustdataSeeding($term, $pool);
```

3d. Replace the return array (currently lines 112–119) with:

```php
        return [
            'pool' => $pool->value,
            'total' => $total,
            'count' => count($resolved),
            'applied_filters' => array_keys($clean),
            'talent_finder_url' => $talentFinderUrl,
            'fresh_results_pending' => $freshResultsPending,
            ...($freshResultsPending ? ['poll_after_seconds' => self::POLL_AFTER_SECONDS] : []),
            'talents' => $resolved,
        ];
```

3e. Add this private method directly below `search()` (above `geocodeMissing()`):

```php
    /**
     * Queue live Crustdata sourcing for fresh global-pool searches.
     * Returns true when fresh results are pending (job dispatched now,
     * or an identical seed is already in flight). The seeder's filter-hash
     * cache is the dedupe guard — warm cache means nothing is pending.
     * No per-user credit checks by design: 360ai pays Crustdata.
     */
    private function queueCrustdataSeeding(SearchTerm $term, Pool $pool): bool
    {
        if (! $term->was_just_created || $pool !== Pool::Global) {
            return false;
        }

        $disposition = $this->crustdataSeeder->disposition($term);

        if ($disposition === SeedDisposition::Dispatch) {
            SeedTalentPoolFromCrustdata::dispatch($term)->onQueue('background-search');
        }

        return $disposition !== SeedDisposition::Skip;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./vendor/bin/pest tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php
```

Expected: 5 passed.

- [ ] **Step 5: Regression — re-run Task 1 and Task 2 test files**

```bash
./vendor/bin/pest tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php
```

Expected: all pass.

- [ ] **Step 6: Format + commit**

```bash
./vendor/bin/pint --dirty
git add app/Services/Agent/TalentSearchService.php tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php
git commit -m "feat(mcp): live Crustdata sourcing trigger + poll contract in talent search

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Teach the model — tool description + server instructions

**Files:**
- Modify: `app/Mcp/Tools/SearchTalents.php:23-50` (the `$description` heredoc)
- Modify: `app/Mcp/Servers/RecruitingServer.php:39-46` (the `#[Instructions(...)]` attribute)
- Test: `tests/Feature/Mcp/SearchTalentsPollContractTest.php`

**Interfaces:**
- Consumes: the pinned response contract from Task 3 (`fresh_results_pending`, `poll_after_seconds` = 8).
- Produces: prose only — no code contracts. Sub-project 3's prompt choreography quotes this behavior.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Mcp/SearchTalentsPollContractTest.php` (uses `ReflectionProperty::getDefaultValue()` so the tool never needs instantiating, and reads the raw attribute argument so no Laravel MCP internals are touched):

```php
<?php

declare(strict_types=1);

use App\Mcp\Servers\RecruitingServer;
use App\Mcp\Tools\SearchTalents;
use Laravel\Mcp\Server\Attributes\Instructions;

it('documents the fresh_results_pending re-poll contract in the tool description', function () {
    $description = (new ReflectionProperty(SearchTalents::class, 'description'))
        ->getDefaultValue();

    expect($description)
        ->toContain('fresh_results_pending')
        ->toContain('poll_after_seconds')
        ->toContain('same arguments');
});

it('documents the re-poll contract in the MCP server instructions', function () {
    $attribute = (new ReflectionClass(RecruitingServer::class))
        ->getAttributes(Instructions::class)[0];

    $instructions = $attribute->getArguments()[0];

    expect($instructions)
        ->toContain('fresh_results_pending')
        ->toContain('poll_after_seconds');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
./vendor/bin/pest tests/Feature/Mcp/SearchTalentsPollContractTest.php
```

Expected: FAIL — `Failed asserting that ... contains "fresh_results_pending"`.

- [ ] **Step 3: Update the tool description**

In `app/Mcp/Tools/SearchTalents.php`, the `$description` heredoc currently ends with:

```
The response includes funnel numbers: `total` = total candidates matching
the filters in the pool (the universe count, e.g. 1 847); `count` = how
many were returned for review (capped by `limit`). Narrate as
"found {total} candidates, reviewing the top {count}".
TXT;
```

Append a new paragraph so it ends with:

```
The response includes funnel numbers: `total` = total candidates matching
the filters in the pool (the universe count, e.g. 1 847); `count` = how
many were returned for review (capped by `limit`). Narrate as
"found {total} candidates, reviewing the top {count}".

Live sourcing (global pool only): a fresh search may also trigger
background sourcing of NEW profiles from Crustdata. If the response has
`fresh_results_pending: true`, newly sourced profiles are still being
ingested — re-call search_talents with the same arguments after
`poll_after_seconds` seconds to pick them up (review the already-returned
profiles in the meantime). Repeat until `fresh_results_pending` is false:
the pool is then fully sourced for these filters.
TXT;
```

- [ ] **Step 4: Update the server instructions**

In `app/Mcp/Servers/RecruitingServer.php`, replace the `#[Instructions(...)]` attribute (currently lines 39–46) with:

```php
#[Instructions(<<<'MARKDOWN'
This MCP server exposes recruiting data from the 360ai platform.
All operations are scoped to the authenticated user's current client workspace.
You can search candidates, browse jobs, view pipeline stages, and check usage.
Most tools are read-only. `send_outreach` performs an action: it ALWAYS
returns a preview first and only sends after you re-call it with
confirm:true, which you must not do until the user approves the message.

Global-pool `search_talents` responses may include
`fresh_results_pending: true`, meaning new profiles are still being
sourced from Crustdata in the background. Re-call `search_talents` with
the same arguments after `poll_after_seconds` seconds to pick up the
newly sourced profiles; stop re-polling once `fresh_results_pending`
is false.
MARKDOWN)]
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
./vendor/bin/pest tests/Feature/Mcp/SearchTalentsPollContractTest.php
```

Expected: 2 passed.

- [ ] **Step 6: Format + commit**

```bash
./vendor/bin/pint --dirty
git add app/Mcp/Tools/SearchTalents.php app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/SearchTalentsPollContractTest.php
git commit -m "docs(mcp): document fresh_results_pending re-poll contract for search_talents

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Full isolated verification sweep

**Files:**
- No new files. Runs every test file this plan owns or touches, in one pest invocation, plus static checks.

- [ ] **Step 1: Run all plan-owned + guarded test files together**

```bash
cd /Users/eth0/Herd/360ai
./vendor/bin/pest \
  tests/Feature/Services/Crustdata/CrustdataSeederDispositionTest.php \
  tests/Feature/Jobs/SeedTalentPoolFromCrustdataTest.php \
  tests/Feature/Services/Agent/TalentSearchServiceCrustdataTest.php \
  tests/Feature/Mcp/SearchTalentsPollContractTest.php \
  tests/Feature/Services/Crustdata/CrustdataSeederTest.php \
  tests/Feature/Services/Crustdata/CrustdataSeederBackfillTest.php \
  tests/Feature/Http/Controllers/TalentFinderCrustdataIngestionTest.php
```

Expected: all pass. (Alias-mock caveat: if `TalentFinderCrustdataIngestionTest` and the new service test conflict over the `TalentSearch` alias in this combined run, run the two files in separate pest invocations and record that in the PR notes — each file MUST pass in its own invocation.)

- [ ] **Step 2: Confirm no credit-check crept in and the contract strings match**

```bash
git diff feat/crustdata-mapping-fidelity...HEAD -- app/ | grep -i "credit" ; test $? -eq 1 && echo "OK: no credit checks"
grep -n "fresh_results_pending" app/Services/Agent/TalentSearchService.php app/Mcp/Tools/SearchTalents.php app/Mcp/Servers/RecruitingServer.php
grep -n "POLL_AFTER_SECONDS = 8" app/Services/Agent/TalentSearchService.php
```

Expected: "OK: no credit checks"; `fresh_results_pending` present in all three files; constant equals 8.

- [ ] **Step 3: Final format pass + push**

```bash
./vendor/bin/pint --dirty
git status --short   # expect clean or only pint fixes; commit pint fixes if any:
git add -A && git diff --cached --quiet || git commit -m "style: pint pass for crustdata live sourcing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin feat/crustdata-live-mcp-sourcing
```

---

## Self-Review (writing-plans checklist, run at authoring time)

**1. Spec coverage (sub-project 2 section of the spec):**
- "queue Crustdata seeding when query fresh + pool global" → Task 3 (`queueCrustdataSeeding`, gate `was_just_created && Pool::Global`), job in Task 2. ✔
- "same pattern as SeedTalentPoolForJob" → Task 2 mirrors trait layout/tries/timeout/queue-at-dispatch-site. ✔
- "return current ES results immediately with fresh_results_pending: true" → Task 3 (dispatch happens before the ES query executes; response built from current ES results). ✔
- "30-min filter-hash cache remains the dedupe guard; warm cache → skip queueing, fresh_results_pending: false" → Task 1 `disposition()` Skip path + Task 3 warm-cache test. ✔ (The `:queued` marker is an additive derived key needed for the pinned "known in-flight" semantics — flagged in Global Constraints and Verified-source notes, not a replacement guard.)
- "include poll_after_seconds hint + document in tool description/server instructions" → Tasks 3 and 4. ✔
- "no per-user credit check" → Global Constraints + Task 3 comment + Task 5 grep guard. ✔
- "query id in response" → already present as `talent_finder_url`/existing fields; no change required (spec's parenthetical, satisfied by existing `qid`-bearing URL). ✔
- "service-level tests: fresh global dispatches + flags; warm-cache doesn't" → Task 3 tests, plus disabled-config and internal-pool cases required by the assignment. ✔

**2. Placeholder scan:** no TBD/TODO/"add validation"/"similar to Task N" anywhere; every code step shows the complete code; every run step has a command and expected outcome. ✔

**3. Type consistency:** `SeedDisposition` (cases `Dispatch|InFlight|Skip`) defined Task 1, consumed with identical names Task 3. `disposition(SearchTerm): SeedDisposition` and `cacheKey(SearchTerm): ?string` used in Tasks 1, 3 tests. Job property `public SearchTerm $searchTerm` (Task 2) matches `$job->searchTerm` in Task 3's warm-cache test. `POLL_AFTER_SECONDS = 8` matches the `toBe(8)` assertions and the pinned contract. Queue name `background-search` consistent across Tasks 2/3. ✔
