# resolve_companies (Company Grounding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A batch `resolve_companies` MCP tool that grounds named companies against the internal ES index (linkedin → domain → name precedence), queues Crustdata-backed background imports for unmatched entries with identifiers, and renders through the existing companies card — plus the prompt upgrade that makes the ground-first rule use it.

**Architecture:** Laravel side (repo `/Users/eth0/Herd/360ai`): a new ES-only `CompanyResolver` service (the existing `UnifiedCompanySearchService::search` ALWAYS calls Crustdata and imports synchronously — wrong seam for cheap resolution), a new domain-based import action/job (the existing `EnrichCompanyBy*Job`s only enrich companies that already exist), and a new `ResolveCompanies` tool on `RecruitingServer`. Chat side (repo `/Users/eth0/Herd/chat.360ai`): map `resolve_companies` onto the existing `companies` card kind and upgrade the ground-first prompt text in `librechat.yaml`.

**Tech Stack:** Laravel 13 + Laravel MCP + Elasticsearch (`CompanyVersionTwo`) + Crustdata API + Pest; React/TypeScript + Jest; librechat.yaml prompt specs.

## Pinned contract (verbatim — implement exactly this)

Tool `resolve_companies`: input `companies: [{name: string required, linkedin_url?: string, domain?: string}]`, max 10 (error on 0 or >10 before service work). Output `{count, companies: [same payload shape UnifiedCompanySearchService returns for search_companies, each + matched_by: 'linkedin'|'domain'|'name'], not_found: [names], import_pending: bool, poll_after_seconds: 8 only when pending}`. Match precedence per entry: linkedin universal name (derived from linkedin_url) → domain → name. Unmatched WITH linkedin_url/domain → queue import (EnrichCompanyByUniversalNameJob / ByDomainJob on background-search; ShouldBeUnique is the dedupe) and import_pending true. Name-only unmatched → not_found, NO import. NO per-user credit checks. Config-gated consistent with crustdata.enabled. Tool description + RecruitingServer instructions document the standard re-poll contract (same args, poll_after_seconds, stop after 2-3 re-polls). Registered on RecruitingServer.

**Contract deviation (verified against source, keep the semantics, swap the mechanism):** `EnrichCompanyByUniversalNameJob` and `EnrichCompanyByDomainJob` only ENRICH companies that already exist in ES — both `handle()` methods early-return when `findCompany()` is null (`app/Jobs/Companies/EnrichCompanyByUniversalNameJob.php:33-39`, `.../EnrichCompanyByDomainJob.php:33-39`). Queueing them for UNMATCHED companies would be a guaranteed no-op. The real create-from-external seam is `App\Jobs\ImportCompanyByUniversalName` (wraps `ImportCompanyByUniversalNameAction`: RapidApi → ProxyCurl → Crustdata enrich, then `CompanyVersionTwo::updateOrCreate`). No domain-based create seam exists; this plan adds one (`ImportCompanyByDomainAction` + `ImportCompanyByDomainJob`). Everything else in the contract (queue name, ShouldBeUnique dedupe, envelope, gating) is implemented exactly as pinned.

## Global Constraints

- **Laravel repo:** `/Users/eth0/Herd/360ai`, work on branch `feat/mcp-resolve-companies` created off `feature/360ai-chat-auth` (currently at `7811351a`). Task 1 Step 1 creates it.
- **Chat repo:** `/Users/eth0/Herd/chat.360ai`, stay on the existing branch `feat/360ai-result-cards`.
- **NEVER `git add -A` / `git add .`** — stage exact file paths only. The Laravel working tree has pre-existing dirt that must stay untouched and unstaged: modified `.phpunit.cache/test-results` and untracked `docs/knit-production-checklist.md`, `docs/superpowers/plans/2026-05-07-unified-company-search.md`, `docs/superpowers/specs/2026-04-28-signals-design.md`, `docs/superpowers/specs/2026-06-02-crustdata-background-backfill-design.md`, `docs/superpowers/specs/unipile-linkedin-api-notes.md`.
- **Isolated test runs ONLY** in the Laravel repo (the full suite has unrelated breakage): `php artisan test <exact file>`. Never run the whole suite. Known pre-existing failure: `tests/Feature/Mcp/RecruitingServerTest.php` asserts `toHaveCount(15)` while the server registers 23 tools — do NOT fix or touch it.
- **Pint** on every Laravel file you create/modify, before committing: `vendor/bin/pint <paths>`.
- **Chat jest** runs from `client/`: `cd /Users/eth0/Herd/chat.360ai/client && npx jest <path>`.
- **librechat.yaml block-scalar safety:** the prompt text lives in `|`-style block scalars. Preserve exact indentation (10 spaces for prospector/researcher paragraphs, 10+3 for the numbered 360ai list continuation lines). After every yaml edit, re-parse the file (verification command given in Task 7). Never introduce tabs.
- **Commits:** one per task, message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **NO per-user credit checks** (standing decision — 360ai pays Crustdata at platform level).
- Crustdata config gate key (verified): `suite.talent_lookup.crustdata.enabled` (`config/suite.php:28`, used at `app/Services/Crustdata/CrustdataSeeder.php:31`).

---

## Task 1: Laravel — `CompanyResolver` service (ES-only matching)

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/Services/CompanySearch/CompanyResolver.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Services/CompanySearch/CompanyResolverTest.php`

**Interfaces:**
- Consumes: `CompanyVersionTwo::findByLinkedInUniversalHandler(string)` (`app/Models/ElasticSearch/CompanyVersionTwo.php:19`), `CompanyVersionTwo::search(array)`, `CompanyResultPresenter::present(Collection): array` (`app/Services/CompanySearch/Output/CompanyResultPresenter.php:16`), `AgentContext`.
- Produces: `CompanyResolver::resolve(AgentContext $context, array $entries): array` returning the pinned envelope. In this task, every unmatched entry lands in `not_found` and `import_pending` is always `false`; Task 4 layers the import queueing behind the same public signature. Later tasks rely on class name `App\Services\CompanySearch\CompanyResolver` and method name `resolve`.

Matching must be ES-only: verified that `UnifiedCompanySearchService::search` unconditionally calls Crustdata (3 credits/100 records) and synchronously imports before re-querying ES (`app/Services/CompanySearch/UnifiedCompanySearchService.php:43-58`) — do NOT call it here.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/eth0/Herd/360ai
git checkout feature/360ai-chat-auth
git checkout -b feat/mcp-resolve-companies
```

Expected: `Switched to a new branch 'feat/mcp-resolve-companies'`. Leave the dirty `.phpunit.cache` / untracked docs alone.

- [ ] **Step 2: Write the failing matching tests**

Create `/Users/eth0/Herd/360ai/tests/Feature/Services/CompanySearch/CompanyResolverTest.php`. This uses REAL Elasticsearch (same pattern as `tests/Feature/Services/CompanySearch/UnifiedCompanySearchServiceTest.php`: unique slug prefix + best-effort cleanup):

```php
<?php

declare(strict_types=1);

use App\Mcp\AgentContext;
use App\Models\Client;
use App\Models\ElasticSearch\CompanyVersionTwo;
use App\Models\User;
use App\Services\CompanySearch\CompanyResolver;

beforeEach(function () {
    $this->client = Client::factory()->create();
    $this->user = User::factory()->create(['current_client_id' => $this->client->id]);
    $this->context = new AgentContext($this->user, $this->client);

    $this->slug = 'resolver-test-'.bin2hex(random_bytes(4));
});

afterEach(function () {
    try {
        $found = CompanyVersionTwo::search([
            'size' => 50,
            'query' => ['prefix' => ['linkedin_universal_name' => 'resolver-test-']],
        ]);
        if ($found !== null) {
            foreach ($found as $doc) {
                $doc->delete();
            }
        }
    } catch (\Throwable $e) {
        // best-effort cleanup
    }
});

test('resolves by linkedin slug ahead of domain and name', function () {
    CompanyVersionTwo::create([
        'name' => 'Resolver Linked Co',
        'linkedin_universal_name' => $this->slug,
        'summary' => 'linkedin match target',
    ]);
    CompanyVersionTwo::create([
        'name' => 'Resolver Domain Co',
        'linkedin_universal_name' => $this->slug.'-domain',
        'website' => $this->slug.'.example',
    ]);

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Resolver Domain Co',
        'linkedin_url' => 'https://www.linkedin.com/company/'.$this->slug,
        'domain' => $this->slug.'.example',
    ]]);

    expect($out['count'])->toBe(1);
    expect($out['companies'][0]['name'])->toBe('Resolver Linked Co');
    expect($out['companies'][0]['matched_by'])->toBe('linkedin');
    expect($out['companies'][0]['linkedin_universal_name'])->toBe($this->slug);
    expect($out['not_found'])->toBe([]);
    expect($out['import_pending'])->toBeFalse();
    expect($out)->not->toHaveKey('poll_after_seconds');
});

test('resolves by domain when the linkedin slug misses, normalising the input domain', function () {
    CompanyVersionTwo::create([
        'name' => 'Resolver Widget Co',
        'linkedin_universal_name' => $this->slug,
        'website' => $this->slug.'.example',
    ]);

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Resolver Widget Co',
        'linkedin_url' => 'https://www.linkedin.com/company/'.$this->slug.'-no-such-slug',
        'domain' => 'https://www.'.$this->slug.'.example/about',
    ]]);

    expect($out['count'])->toBe(1);
    expect($out['companies'][0]['matched_by'])->toBe('domain');
});

test('resolves by exact-ish name as the last resort', function () {
    $name = 'Resolver Zeta '.substr($this->slug, -8);
    CompanyVersionTwo::create([
        'name' => $name,
        'linkedin_universal_name' => $this->slug,
    ]);

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => $name,
    ]]);

    expect($out['count'])->toBe(1);
    expect($out['companies'][0]['matched_by'])->toBe('name');
});

test('reports unmatched name-only entries in not_found', function () {
    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Utterly Unknown '.bin2hex(random_bytes(4)),
    ]]);

    expect($out['count'])->toBe(0);
    expect($out['companies'])->toBe([]);
    expect($out['not_found'])->toHaveCount(1);
    expect($out['import_pending'])->toBeFalse();
});

test('resolves a mixed batch in one call', function () {
    CompanyVersionTwo::create([
        'name' => 'Resolver Mixed Co',
        'linkedin_universal_name' => $this->slug,
    ]);

    $out = app(CompanyResolver::class)->resolve($this->context, [
        ['name' => 'Resolver Mixed Co', 'linkedin_url' => 'https://www.linkedin.com/company/'.$this->slug],
        ['name' => 'Nowhere GmbH '.bin2hex(random_bytes(4))],
    ]);

    expect($out['count'])->toBe(1);
    expect($out['not_found'])->toHaveCount(1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/CompanySearch/CompanyResolverTest.php
```

Expected: FAIL — `Class "App\Services\CompanySearch\CompanyResolver" not found`.

- [ ] **Step 4: Implement `CompanyResolver` (matching only)**

Create `/Users/eth0/Herd/360ai/app/Services/CompanySearch/CompanyResolver.php`. Slug regex mirrors the private `CrustdataCompanyMapper::extractLinkedinSlug` (`app/Services/CompanySearch/Importer/CrustdataCompanyMapper.php:133-142`); domain variations mirror `EnrichCompanyByDomainJob::findCompany` (`app/Jobs/Companies/EnrichCompanyByDomainJob.php:54-75`); name matching mirrors the `name` filter in `EsCompanyFilterTranslator` (`match_phrase` on `name.text`, `app/Services/CompanySearch/Translators/EsCompanyFilterTranslator.php:34`):

```php
<?php

declare(strict_types=1);

namespace App\Services\CompanySearch;

use App\Mcp\AgentContext;
use App\Models\ElasticSearch\CompanyVersionTwo;
use App\Services\CompanySearch\Output\CompanyResultPresenter;

class CompanyResolver
{
    private const POLL_AFTER_SECONDS = 8;

    public function __construct(
        private readonly CompanyResultPresenter $presenter,
    ) {}

    /**
     * Ground a batch of named companies against the internal index.
     * ES-only on purpose: resolution must be fast and never spend
     * Crustdata credits — imports happen via queued jobs instead.
     *
     * @param  array<int, array{name: string, linkedin_url?: string, domain?: string}>  $entries
     * @return array<string, mixed>
     */
    public function resolve(AgentContext $context, array $entries): array
    {
        $companies = [];
        $notFound = [];
        $importPending = false;

        foreach ($entries as $entry) {
            $name = trim((string) ($entry['name'] ?? ''));
            $slug = $this->extractLinkedinSlug((string) ($entry['linkedin_url'] ?? ''));
            $domain = $this->normaliseDomain((string) ($entry['domain'] ?? ''));

            [$match, $matchedBy] = $this->matchEntry($name, $slug, $domain);

            if ($match !== null) {
                $companies[] = [
                    ...$this->presenter->present(collect([$match]))[0],
                    'matched_by' => $matchedBy,
                ];

                continue;
            }

            if ($this->queueImport($slug, $domain)) {
                $importPending = true;

                continue;
            }

            $notFound[] = $name;
        }

        return [
            'count' => count($companies),
            'companies' => $companies,
            'not_found' => $notFound,
            'import_pending' => $importPending,
            ...($importPending ? ['poll_after_seconds' => self::POLL_AFTER_SECONDS] : []),
        ];
    }

    /**
     * @return array{0: ?CompanyVersionTwo, 1: ?string}
     */
    private function matchEntry(string $name, ?string $slug, ?string $domain): array
    {
        if ($slug !== null) {
            $hit = CompanyVersionTwo::findByLinkedInUniversalHandler($slug);
            if ($hit !== null) {
                return [$hit, 'linkedin'];
            }
        }

        if ($domain !== null) {
            $hit = CompanyVersionTwo::search([
                'size' => 1,
                'query' => ['terms' => ['website' => $this->domainVariations($domain)]],
            ])?->first();
            if ($hit !== null) {
                return [$hit, 'domain'];
            }
        }

        if ($name !== '') {
            $hit = CompanyVersionTwo::search([
                'size' => 1,
                'query' => ['match_phrase' => ['name.text' => $name]],
            ])?->first();
            if ($hit !== null) {
                return [$hit, 'name'];
            }
        }

        return [null, null];
    }

    private function queueImport(?string $slug, ?string $domain): bool
    {
        return false;
    }

    /**
     * @return string[]
     */
    private function domainVariations(string $domain): array
    {
        return [
            $domain,
            sprintf('www.%s', $domain),
            sprintf('http://%s', $domain),
            sprintf('https://%s', $domain),
            sprintf('http://www.%s', $domain),
            sprintf('https://www.%s', $domain),
        ];
    }

    private function extractLinkedinSlug(string $url): ?string
    {
        if ($url === '' || preg_match('~linkedin\.com/company/([^/?#]+)~i', $url, $matches) !== 1) {
            return null;
        }

        $slug = strtolower(trim($matches[1]));

        return $slug !== '' ? $slug : null;
    }

    private function normaliseDomain(string $domain): ?string
    {
        $domain = strtolower(trim($domain));
        if ($domain === '') {
            return null;
        }

        $domain = preg_replace('~^https?://~', '', $domain) ?? $domain;
        $domain = preg_replace('~^www\.~', '', $domain) ?? $domain;
        $domain = explode('/', $domain)[0];

        return $domain === '' ? null : $domain;
    }
}
```

(`queueImport` is a deliberate no-op stub here; Task 4 gives it its real body and tests. It exists now so `resolve()` never needs restructuring.)

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/CompanySearch/CompanyResolverTest.php
```

Expected: PASS (5 tests).

- [ ] **Step 6: Pint + commit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint app/Services/CompanySearch/CompanyResolver.php tests/Feature/Services/CompanySearch/CompanyResolverTest.php
git add app/Services/CompanySearch/CompanyResolver.php tests/Feature/Services/CompanySearch/CompanyResolverTest.php
git commit -m "feat(companies): add ES-only CompanyResolver for named-company grounding

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Laravel — scope `ImportCompanyByUniversalName`'s unique lock to the slug

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Jobs/ImportCompanyByUniversalName.php` (class body, after the constructor ending at line 29)
- Test: `/Users/eth0/Herd/360ai/tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php`

**Interfaces:**
- Consumes: existing job `App\Jobs\ImportCompanyByUniversalName` (`public string $universalName`, `implements ShouldBeUnique`).
- Produces: `uniqueId(): string` returning the slug. Task 4 dispatches this job for a batch of DIFFERENT slugs in one request; without this, `ShouldBeUnique`'s lock key is class-name-only (no `uniqueId()`/`$uniqueId` defined today), so the second distinct slug in a batch would be silently dropped while the first is in flight.

- [ ] **Step 1: Write the failing test**

Create `/Users/eth0/Herd/360ai/tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php`:

```php
<?php

declare(strict_types=1);

use App\Jobs\ImportCompanyByUniversalName;

test('unique lock is scoped to the universal name so batches of distinct slugs all enqueue', function () {
    expect((new ImportCompanyByUniversalName('acme'))->uniqueId())->toBe('acme');
    expect((new ImportCompanyByUniversalName('globex'))->uniqueId())->toBe('globex');
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php
```

Expected: FAIL — `Call to undefined method App\Jobs\ImportCompanyByUniversalName::uniqueId()`.

- [ ] **Step 3: Add `uniqueId()`**

In `/Users/eth0/Herd/360ai/app/Jobs/ImportCompanyByUniversalName.php`, directly after the constructor:

```php
    public function __construct(
        public string $universalName
    ) {}

    public function uniqueId(): string
    {
        return $this->universalName;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php
```

Expected: PASS.

- [ ] **Step 5: Pint + commit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint app/Jobs/ImportCompanyByUniversalName.php tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php
git add app/Jobs/ImportCompanyByUniversalName.php tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php
git commit -m "fix(jobs): scope ImportCompanyByUniversalName unique lock to the slug

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Laravel — domain-based import seam (`ImportCompanyByDomainAction` + `ImportCompanyByDomainJob`)

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/Actions/Companies/ImportCompanyByDomainAction.php`
- Create: `/Users/eth0/Herd/360ai/app/Jobs/Companies/ImportCompanyByDomainJob.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Actions/ImportCompanyByDomainActionTest.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Jobs/ImportCompanyByDomainJobTest.php`

**Interfaces:**
- Consumes: `CrustdataService::companies()->enrich(array $params)` (`GET /screener/company`, accepts `company_domain` — `app/Services/Crustdata/Resources/CompanyResource.php:88`), `App\Services\Crustdata\Mappers\CrustdataCompanyMapper::toCompanyData(array $row)`, and the protected `updateOrCreateCompany()` / `extractCrustdataCompanyRow()` on `ImportCompanyByUniversalNameAction` (reused via extension — they are `protected` by design), `FailedCompanyLookupCache` (string-keyed cache, `app/Services/FailedCompanyLookupCache.php`).
- Produces: `ImportCompanyByDomainAction::importByDomain(string $domain): ?CompanyVersionTwoData`; `ImportCompanyByDomainJob` (`public string $domain`, `implements ShouldBeUnique, ShouldQueue`, `uniqueId(): string` = domain). Task 4 dispatches `ImportCompanyByDomainJob::dispatch($domain)->onQueue('background-search')` and checks `FailedCompanyLookupCache::hasFailed('domain:'.$domain)`.

- [ ] **Step 1: Write the failing action tests**

Create `/Users/eth0/Herd/360ai/tests/Feature/Actions/ImportCompanyByDomainActionTest.php`. Only the Crustdata HTTP boundary is faked (same override-the-resource pattern as `fakeCrustdataReturning`/`bindFakeCrustdataService` in `tests/Feature/Services/CompanySearch/UnifiedCompanySearchServiceTest.php:172-190`); mapper, updateOrCreate, and ES writes are real:

```php
<?php

declare(strict_types=1);

use App\Actions\Companies\ImportCompanyByDomainAction;
use App\Models\ElasticSearch\CompanyVersionTwo;
use App\Services\Contracts\ResourceContract;
use App\Services\Crustdata\CrustdataService;
use App\Services\Crustdata\Resources\CompanyResource;
use App\Services\FailedCompanyLookupCache;

afterEach(function () {
    try {
        $found = CompanyVersionTwo::search([
            'size' => 50,
            'query' => ['prefix' => ['linkedin_universal_name' => 'domain-import-test-']],
        ]);
        if ($found !== null) {
            foreach ($found as $doc) {
                $doc->delete();
            }
        }
    } catch (\Throwable $e) {
        // best-effort cleanup
    }
});

function bindFakeEnrichCrustdata(array $enrichResponse): void
{
    $resource = new class($enrichResponse) extends CompanyResource
    {
        /** @param array<string, mixed> $enrichResponse */
        public function __construct(private array $enrichResponse) {}

        public function enrich(array $params): array
        {
            return $this->enrichResponse;
        }
    };

    $service = new class($resource) extends CrustdataService
    {
        public function __construct(private CompanyResource $resource) {}

        public function companies(): ResourceContract
        {
            return $this->resource;
        }
    };

    app()->instance(CrustdataService::class, $service);
}

test('imports a company from crustdata by domain and persists it to the index', function () {
    $slug = 'domain-import-test-'.bin2hex(random_bytes(4));

    bindFakeEnrichCrustdata([
        'linkedin_id' => (string) random_int(10000000, 99999999),
        'linkedin_profile_name' => $slug,
        'linkedin_profile_url' => 'https://www.linkedin.com/company/'.$slug,
        'company_name' => 'Domain Import Test Co',
        'company_website_domain' => $slug.'.example',
    ]);

    $company = app(ImportCompanyByDomainAction::class)->importByDomain($slug.'.example');

    expect($company)->not->toBeNull();
    expect($company->name)->toBe('Domain Import Test Co');
    expect(CompanyVersionTwo::findByLinkedInUniversalHandler($slug))->not->toBeNull();
});

test('marks the domain as failed when crustdata returns nothing', function () {
    bindFakeEnrichCrustdata([]);

    $domain = 'domain-import-test-nothing-'.bin2hex(random_bytes(4)).'.example';
    $company = app(ImportCompanyByDomainAction::class)->importByDomain($domain);

    expect($company)->toBeNull();
    expect(FailedCompanyLookupCache::hasFailed('domain:'.$domain))->toBeTrue();
});

test('short-circuits without calling crustdata when the domain recently failed', function () {
    $resource = new class extends CompanyResource
    {
        public function __construct() {}

        public function enrich(array $params): array
        {
            throw new RuntimeException('enrich must not be called for cached failures');
        }
    };
    $service = new class($resource) extends CrustdataService
    {
        public function __construct(private CompanyResource $resource) {}

        public function companies(): ResourceContract
        {
            return $this->resource;
        }
    };
    app()->instance(CrustdataService::class, $service);

    $domain = 'domain-import-test-cached-'.bin2hex(random_bytes(4)).'.example';
    FailedCompanyLookupCache::markAsFailed('domain:'.$domain);

    expect(app(ImportCompanyByDomainAction::class)->importByDomain($domain))->toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Actions/ImportCompanyByDomainActionTest.php
```

Expected: FAIL — `Class "App\Actions\Companies\ImportCompanyByDomainAction" not found`.

- [ ] **Step 3: Implement the action**

Create `/Users/eth0/Herd/360ai/app/Actions/Companies/ImportCompanyByDomainAction.php`. It extends `ImportCompanyByUniversalNameAction` to reuse the protected `updateOrCreateCompany()` (logo download + `CompanyVersionTwo::updateOrCreate` keyed on `linkedin_id`) and `extractCrustdataCompanyRow()` (handles Crustdata's three response shapes — see `app/Actions/Companies/ImportCompanyByUniversalNameAction.php:117-144`):

```php
<?php

declare(strict_types=1);

namespace App\Actions\Companies;

use App\DataTransferObject\CompanyVersionTwoData;
use App\Services\Crustdata\CrustdataService;
use App\Services\Crustdata\Mappers\CrustdataCompanyMapper;
use App\Services\FailedCompanyLookupCache;

class ImportCompanyByDomainAction extends ImportCompanyByUniversalNameAction
{
    public function importByDomain(string $domain): ?CompanyVersionTwoData
    {
        $cacheKey = 'domain:'.$domain;

        if (FailedCompanyLookupCache::hasFailed($cacheKey)) {
            return null;
        }

        try {
            $company = $this->fetchFromCrustdataByDomain($domain);
        } catch (\Exception $e) {
            FailedCompanyLookupCache::markAsFailed($cacheKey);

            return null;
        }

        if (! $company) {
            FailedCompanyLookupCache::markAsFailed($cacheKey);

            return null;
        }

        return $this->updateOrCreateCompany($company);
    }

    protected function fetchFromCrustdataByDomain(string $domain): ?CompanyVersionTwoData
    {
        $response = app(CrustdataService::class)->companies()->enrich([
            'company_domain' => $domain,
        ]);

        $row = $this->extractCrustdataCompanyRow($response);
        if ($row === null) {
            return null;
        }

        $company = CrustdataCompanyMapper::toCompanyData($row);

        return empty($company->linkedin_id) ? null : $company;
    }
}
```

- [ ] **Step 4: Run action tests to verify they pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Actions/ImportCompanyByDomainActionTest.php
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing job tests**

Create `/Users/eth0/Herd/360ai/tests/Feature/Jobs/ImportCompanyByDomainJobTest.php`:

```php
<?php

declare(strict_types=1);

use App\Actions\Companies\ImportCompanyByDomainAction;
use App\Jobs\Companies\ImportCompanyByDomainJob;
use App\Models\ElasticSearch\CompanyVersionTwo;

afterEach(function () {
    try {
        $found = CompanyVersionTwo::search([
            'size' => 50,
            'query' => ['prefix' => ['linkedin_universal_name' => 'domain-job-test-']],
        ]);
        if ($found !== null) {
            foreach ($found as $doc) {
                $doc->delete();
            }
        }
    } catch (\Throwable $e) {
        // best-effort cleanup
    }
});

test('job unique lock is scoped to the domain', function () {
    expect((new ImportCompanyByDomainJob('acme.com'))->uniqueId())->toBe('acme.com');
});

test('job skips the import when the domain already exists in the index', function () {
    $slug = 'domain-job-test-'.bin2hex(random_bytes(4));
    CompanyVersionTwo::create([
        'name' => 'Existing Co',
        'linkedin_universal_name' => $slug,
        'website' => $slug.'.example',
    ]);

    $this->mock(ImportCompanyByDomainAction::class, function ($mock) {
        $mock->shouldReceive('importByDomain')->never();
    });

    app()->call([new ImportCompanyByDomainJob($slug.'.example'), 'handle']);
});

test('job imports when the domain is missing from the index', function () {
    $domain = 'domain-job-test-missing-'.bin2hex(random_bytes(4)).'.example';

    $this->mock(ImportCompanyByDomainAction::class, function ($mock) use ($domain) {
        $mock->shouldReceive('importByDomain')->once()->with($domain)->andReturnNull();
    });

    app()->call([new ImportCompanyByDomainJob($domain), 'handle']);
});
```

- [ ] **Step 6: Run to verify failure**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Jobs/ImportCompanyByDomainJobTest.php
```

Expected: FAIL — `Class "App\Jobs\Companies\ImportCompanyByDomainJob" not found`.

- [ ] **Step 7: Implement the job**

Create `/Users/eth0/Herd/360ai/app/Jobs/Companies/ImportCompanyByDomainJob.php` (mirrors the structure of the sibling jobs in that directory; the ES existence check mirrors `EnrichCompanyByDomainJob::findCompany`, and doubles as a race guard for jobs queued before an import landed):

```php
<?php

declare(strict_types=1);

namespace App\Jobs\Companies;

use App\Actions\Companies\ImportCompanyByDomainAction;
use App\Models\ElasticSearch\CompanyVersionTwo;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ImportCompanyByDomainJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public $timeout = 15;

    public function __construct(
        public string $domain
    ) {}

    public function uniqueId(): string
    {
        return $this->domain;
    }

    public function handle(ImportCompanyByDomainAction $action): void
    {
        if ($this->alreadyImported()) {
            return;
        }

        $action->importByDomain($this->domain);
    }

    private function alreadyImported(): bool
    {
        $variations = [
            $this->domain,
            sprintf('www.%s', $this->domain),
            sprintf('http://%s', $this->domain),
            sprintf('https://%s', $this->domain),
            sprintf('http://www.%s', $this->domain),
            sprintf('https://www.%s', $this->domain),
        ];

        return CompanyVersionTwo::search([
            'size' => 1,
            'query' => ['terms' => ['website' => $variations]],
        ])?->first() !== null;
    }
}
```

- [ ] **Step 8: Run both test files to verify they pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Actions/ImportCompanyByDomainActionTest.php tests/Feature/Jobs/ImportCompanyByDomainJobTest.php
```

Expected: PASS (6 tests).

- [ ] **Step 9: Pint + commit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint app/Actions/Companies/ImportCompanyByDomainAction.php app/Jobs/Companies/ImportCompanyByDomainJob.php tests/Feature/Actions/ImportCompanyByDomainActionTest.php tests/Feature/Jobs/ImportCompanyByDomainJobTest.php
git add app/Actions/Companies/ImportCompanyByDomainAction.php app/Jobs/Companies/ImportCompanyByDomainJob.php tests/Feature/Actions/ImportCompanyByDomainActionTest.php tests/Feature/Jobs/ImportCompanyByDomainJobTest.php
git commit -m "feat(companies): add domain-based Crustdata company import seam

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Laravel — queue imports + `import_pending` in `CompanyResolver`

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Services/CompanySearch/CompanyResolver.php` (replace the `queueImport` stub, add imports)
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Services/CompanySearch/CompanyResolverTest.php` (append tests)

**Interfaces:**
- Consumes: `App\Jobs\ImportCompanyByUniversalName` (Task 2's `uniqueId`), `App\Jobs\Companies\ImportCompanyByDomainJob` (Task 3), `FailedCompanyLookupCache::hasFailed()`, config key `suite.talent_lookup.crustdata.enabled`.
- Produces: unchanged public signature; envelope now sets `import_pending: true` + `poll_after_seconds: 8` when at least one import was queued. Dedupe is `ShouldBeUnique` (in-flight) + `FailedCompanyLookupCache` (terminal not-found, keys: slug for linkedin, `'domain:'.$domain` for domain — MUST match Task 3's action key). Re-poll terminates because a failed import flips the entry to `not_found` on the next call.

- [ ] **Step 1: Append the failing queueing tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/Services/CompanySearch/CompanyResolverTest.php` (add `use App\Jobs\Companies\ImportCompanyByDomainJob;`, `use App\Jobs\ImportCompanyByUniversalName;`, `use App\Services\FailedCompanyLookupCache;`, `use Illuminate\Support\Facades\Queue;` to the imports at the top of the file):

```php
test('queues a linkedin import for unmatched entries with a linkedin url', function () {
    Queue::fake();

    $missing = $this->slug.'-missing';

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Ghost Corp',
        'linkedin_url' => 'https://www.linkedin.com/company/'.$missing,
    ]]);

    Queue::assertPushed(ImportCompanyByUniversalName::class, function ($job) use ($missing) {
        return $job->universalName === $missing && $job->queue === 'background-search';
    });
    expect($out['import_pending'])->toBeTrue();
    expect($out['poll_after_seconds'])->toBe(8);
    expect($out['not_found'])->toBe([]);
    expect($out['count'])->toBe(0);
});

test('queues a domain import for unmatched entries with a domain only', function () {
    Queue::fake();

    $domain = 'resolver-queue-'.bin2hex(random_bytes(3)).'.example';

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Ghost Widgets',
        'domain' => 'https://www.'.$domain.'/about',
    ]]);

    Queue::assertPushed(ImportCompanyByDomainJob::class, function ($job) use ($domain) {
        return $job->domain === $domain && $job->queue === 'background-search';
    });
    expect($out['import_pending'])->toBeTrue();
    expect($out['not_found'])->toBe([]);
});

test('prefers the linkedin import when an unmatched entry has both identifiers', function () {
    Queue::fake();

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Ghost Corp',
        'linkedin_url' => 'https://www.linkedin.com/company/'.$this->slug.'-both',
        'domain' => 'resolver-both-'.bin2hex(random_bytes(3)).'.example',
    ]]);

    Queue::assertPushed(ImportCompanyByUniversalName::class);
    Queue::assertNotPushed(ImportCompanyByDomainJob::class);
    expect($out['import_pending'])->toBeTrue();
});

test('does not queue imports when crustdata is disabled', function () {
    Queue::fake();
    config()->set('suite.talent_lookup.crustdata.enabled', false);

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Ghost Corp',
        'linkedin_url' => 'https://www.linkedin.com/company/'.$this->slug.'-disabled',
    ]]);

    Queue::assertNothingPushed();
    expect($out['import_pending'])->toBeFalse();
    expect($out['not_found'])->toBe(['Ghost Corp']);
});

test('does not re-queue identifiers that recently failed to import', function () {
    Queue::fake();

    $missing = $this->slug.'-failed';
    FailedCompanyLookupCache::markAsFailed($missing);

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Failed Corp',
        'linkedin_url' => 'https://www.linkedin.com/company/'.$missing,
    ]]);

    Queue::assertNothingPushed();
    expect($out['import_pending'])->toBeFalse();
    expect($out['not_found'])->toBe(['Failed Corp']);
});

test('does not re-queue domains that recently failed to import', function () {
    Queue::fake();

    $domain = 'resolver-failed-'.bin2hex(random_bytes(3)).'.example';
    FailedCompanyLookupCache::markAsFailed('domain:'.$domain);

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Failed Widgets',
        'domain' => $domain,
    ]]);

    Queue::assertNothingPushed();
    expect($out['import_pending'])->toBeFalse();
    expect($out['not_found'])->toBe(['Failed Widgets']);
});

test('name-only unmatched entries are never imported', function () {
    Queue::fake();

    $out = app(CompanyResolver::class)->resolve($this->context, [[
        'name' => 'Utterly Unknown '.bin2hex(random_bytes(4)),
    ]]);

    Queue::assertNothingPushed();
    expect($out['import_pending'])->toBeFalse();
    expect($out['not_found'])->toHaveCount(1);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/CompanySearch/CompanyResolverTest.php
```

Expected: the 5 Task-1 tests PASS; the queueing tests FAIL (nothing pushed / `import_pending` false / entries land in `not_found`).

- [ ] **Step 3: Implement `queueImport`**

In `/Users/eth0/Herd/360ai/app/Services/CompanySearch/CompanyResolver.php`, add these two `use` statements to the import block:

```php
use App\Jobs\Companies\ImportCompanyByDomainJob;
use App\Jobs\ImportCompanyByUniversalName;
use App\Services\FailedCompanyLookupCache;
```

and replace the stub:

```php
    private function queueImport(?string $slug, ?string $domain): bool
    {
        return false;
    }
```

with:

```php
    /**
     * Queue a background Crustdata-backed import for an unmatched entry.
     * ShouldBeUnique on the jobs is the in-flight dedupe; the
     * FailedCompanyLookupCache is the terminal guard that lets the model's
     * re-poll settle on not_found instead of polling forever.
     * No per-user credit checks by design: 360ai pays Crustdata.
     */
    private function queueImport(?string $slug, ?string $domain): bool
    {
        if (! config('suite.talent_lookup.crustdata.enabled', true)) {
            return false;
        }

        if ($slug !== null) {
            if (FailedCompanyLookupCache::hasFailed($slug)) {
                return false;
            }
            ImportCompanyByUniversalName::dispatch($slug)->onQueue('background-search');

            return true;
        }

        if ($domain !== null) {
            if (FailedCompanyLookupCache::hasFailed('domain:'.$domain)) {
                return false;
            }
            ImportCompanyByDomainJob::dispatch($domain)->onQueue('background-search');

            return true;
        }

        return false;
    }
```

- [ ] **Step 4: Run the full file to verify all pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/CompanySearch/CompanyResolverTest.php
```

Expected: PASS (12 tests).

- [ ] **Step 5: Pint + commit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint app/Services/CompanySearch/CompanyResolver.php tests/Feature/Services/CompanySearch/CompanyResolverTest.php
git add app/Services/CompanySearch/CompanyResolver.php tests/Feature/Services/CompanySearch/CompanyResolverTest.php
git commit -m "feat(companies): queue background imports for unresolved companies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Laravel — `ResolveCompanies` tool, registration, server instructions

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/Mcp/Tools/ResolveCompanies.php`
- Modify: `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php` (imports ~line 23, `#[Instructions]` block ~lines 41-57, `$tools` array ~line 62)
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Mcp/Tools/ResolveCompaniesTest.php`

**Interfaces:**
- Consumes: `CompanyResolver::resolve(AgentContext, array): array` (Tasks 1+4), `AgentContext::fromRequest`, `Laravel\Mcp\{Request,Response}`, `$schema->object([...])` (nested-object precedent: `SearchTalents.php:142-150`).
- Produces: MCP tool `resolve_companies` registered on `RecruitingServer`. Annotations: keep `#[IsReadOnly]` + `#[IsIdempotent]` — this mirrors SP2's honest answer for `search_talents`, which retains both annotations while queueing background Crustdata sourcing (`app/Mcp/Tools/SearchTalents.php:17-18`); background import is a read-path side effect, not a user-visible mutation.

- [ ] **Step 1: Write the failing tool tests**

Create `/Users/eth0/Herd/360ai/tests/Feature/Mcp/Tools/ResolveCompaniesTest.php` (conventions mirror `tests/Feature/Mcp/GetCandidatesToolTest.php`):

```php
<?php

declare(strict_types=1);

use App\Mcp\Servers\RecruitingServer;
use App\Mcp\Tools\ResolveCompanies;
use App\Models\Client;
use App\Models\User;
use App\Services\CompanySearch\CompanyResolver;
use Laravel\Mcp\Server;

/**
 * Minimal MCP server for isolated ResolveCompanies testing.
 */
class ResolveCompaniesTestServer extends Server
{
    protected string $name = 'resolve-companies-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [
        ResolveCompanies::class,
    ];
}

test('resolve_companies returns the resolver envelope', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CompanyResolver::class, function ($mock) {
        $mock->shouldReceive('resolve')
            ->once()
            ->andReturn([
                'count' => 1,
                'companies' => [[
                    'id' => '7',
                    'name' => 'Acme',
                    'linkedin_url' => 'https://www.linkedin.com/company/acme',
                    'linkedin_universal_name' => 'acme',
                    'website' => 'acme.com',
                    'industry' => 'Software',
                    'employee_range' => '51-200',
                    'location' => 'Berlin, Germany',
                    'description' => 'Roadrunner traps.',
                    'matched_by' => 'linkedin',
                ]],
                'not_found' => ['Ghost Corp'],
                'import_pending' => false,
            ]);
    });

    $response = ResolveCompaniesTestServer::actingAs($user)->tool(ResolveCompanies::class, [
        'companies' => [
            ['name' => 'Acme', 'linkedin_url' => 'https://www.linkedin.com/company/acme'],
            ['name' => 'Ghost Corp'],
        ],
    ]);

    $response->assertOk();
    $response->assertSee('Acme');
    $response->assertSee('matched_by');
    $response->assertSee('linkedin');
    $response->assertSee('Ghost Corp');
    $response->assertSee('import_pending');
});

test('resolve_companies surfaces import_pending with poll_after_seconds', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CompanyResolver::class, function ($mock) {
        $mock->shouldReceive('resolve')
            ->once()
            ->andReturn([
                'count' => 0,
                'companies' => [],
                'not_found' => [],
                'import_pending' => true,
                'poll_after_seconds' => 8,
            ]);
    });

    $response = ResolveCompaniesTestServer::actingAs($user)->tool(ResolveCompanies::class, [
        'companies' => [
            ['name' => 'Ghost Corp', 'domain' => 'ghost.example'],
        ],
    ]);

    $response->assertOk();
    $response->assertSee('import_pending');
    $response->assertSee('poll_after_seconds');
});

test('resolve_companies rejects an empty batch before resolving', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CompanyResolver::class, function ($mock) {
        $mock->shouldReceive('resolve')->never();
    });

    $response = ResolveCompaniesTestServer::actingAs($user)->tool(ResolveCompanies::class, [
        'companies' => [],
    ]);

    $response->assertHasErrors();
    $response->assertSee('at least one');
});

test('resolve_companies rejects entries without a usable name before resolving', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CompanyResolver::class, function ($mock) {
        $mock->shouldReceive('resolve')->never();
    });

    $response = ResolveCompaniesTestServer::actingAs($user)->tool(ResolveCompanies::class, [
        'companies' => [
            ['linkedin_url' => 'https://www.linkedin.com/company/acme'],
            ['name' => '   '],
        ],
    ]);

    $response->assertHasErrors();
    $response->assertSee('at least one');
});

test('resolve_companies rejects more than 10 companies without resolving', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CompanyResolver::class, function ($mock) {
        $mock->shouldReceive('resolve')->never();
    });

    $entries = array_map(fn (int $i) => ['name' => 'Company '.$i], range(1, 11));

    $response = ResolveCompaniesTestServer::actingAs($user)->tool(ResolveCompanies::class, [
        'companies' => $entries,
    ]);

    $response->assertHasErrors();
    $response->assertSee('at most 10');
});

test('resolve_companies accepts exactly 10 companies at the batch boundary', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $this->mock(CompanyResolver::class, function ($mock) {
        $mock->shouldReceive('resolve')
            ->once()
            ->andReturn([
                'count' => 0,
                'companies' => [],
                'not_found' => array_map(fn (int $i) => 'Company '.$i, range(1, 10)),
                'import_pending' => false,
            ]);
    });

    $entries = array_map(fn (int $i) => ['name' => 'Company '.$i], range(1, 10));

    $response = ResolveCompaniesTestServer::actingAs($user)->tool(ResolveCompanies::class, [
        'companies' => $entries,
    ]);

    $response->assertOk();
    $response->assertSee('not_found');
});

test('recruiting server registers resolve_companies and documents the re-poll contract', function () {
    $tools = (new ReflectionClass(RecruitingServer::class))->getProperty('tools');

    expect($tools->getValue(new RecruitingServer(new Laravel\Mcp\Server\Transport\FakeTransporter)))
        ->toContain(ResolveCompanies::class);

    $source = file_get_contents((new ReflectionClass(RecruitingServer::class))->getFileName());
    expect($source)->toContain('resolve_companies');
    expect($source)->toContain('poll_after_seconds');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/Tools/ResolveCompaniesTest.php
```

Expected: FAIL — `Class "App\Mcp\Tools\ResolveCompanies" not found`.

- [ ] **Step 3: Implement the tool**

Create `/Users/eth0/Herd/360ai/app/Mcp/Tools/ResolveCompanies.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\CompanySearch\CompanyResolver;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
#[IsIdempotent]
class ResolveCompanies extends Tool
{
    private const MAX_COMPANIES = 10;

    protected string $name = 'resolve_companies';

    protected string $description = <<<'TXT'
Ground a batch of NAMED companies (from web research or the user) against
the internal company index in ONE call — up to 10 entries of
{name, linkedin_url?, domain?}. Use this instead of per-company
search_companies calls when grounding named entities; search_companies
remains the tool for filter-based discovery.

Matching per entry, in order: LinkedIn slug (derived from linkedin_url)
→ website domain → exact-ish name. Matched entries come back in
`companies` with the same payload shape search_companies returns, plus
`matched_by: 'linkedin'|'domain'|'name'`.

Unmatched entries WITH a linkedin_url or domain are queued for a
background import; the response then sets `import_pending: true` and
`poll_after_seconds`. Re-call resolve_companies with the SAME arguments
after `poll_after_seconds` seconds to pick up imported companies; stop
once `import_pending` is false. If still pending after 2-3 re-polls,
stop polling and continue with inline cards for the missing companies.
Name-only entries that don't match are returned in `not_found` (no
import — too ambiguous to import blind).
TXT;

    public function handle(Request $request, CompanyResolver $resolver): Response
    {
        try {
            $context = AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $entries = collect($request->get('companies', []))
            ->filter(fn ($entry) => is_array($entry) && trim((string) ($entry['name'] ?? '')) !== '')
            ->values();

        if ($entries->isEmpty()) {
            return Response::error('Provide at least one company entry with a `name`.');
        }

        if ($entries->count() > self::MAX_COMPANIES) {
            return Response::error('Provide at most '.self::MAX_COMPANIES.' companies per call.');
        }

        try {
            return Response::json($resolver->resolve($context, $entries->all()));
        } catch (\Throwable $e) {
            report($e);

            return Response::error('Company resolution failed. Retry with fewer entries.');
        }
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'companies' => $schema->array()
                ->items(
                    $schema->object([
                        'name' => $schema->string()
                            ->description('Company name as you will present it.')
                            ->required(),
                        'linkedin_url' => $schema->string()
                            ->description('LinkedIn company URL, e.g. "https://www.linkedin.com/company/acme". Omit or pass empty string when unknown.'),
                        'domain' => $schema->string()
                            ->description('Website domain, e.g. "acme.com". Omit or pass empty string when unknown.'),
                    ])
                )
                ->description('Companies to ground against the internal index (1-10 per call).')
                ->required(),
        ];
    }
}
```

- [ ] **Step 4: Register the tool + extend the server instructions**

In `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php`:

(a) Add the import, keeping the alphabetical-ish block (next to the other `App\Mcp\Tools\*` imports):

```php
use App\Mcp\Tools\ResolveCompanies;
```

(b) In the `$tools` array, insert after `PipelineStages::class,`:

```php
        PipelineStages::class,
        ResolveCompanies::class,
        SaveOnboardingProfile::class,
```

(c) In the `#[Instructions(<<<'MARKDOWN' ... MARKDOWN)]` block, insert this paragraph after the existing `search_talents` re-poll paragraph (the one ending `...continue\nwith the current results.`) and before the closing `MARKDOWN`:

```
Before presenting NAMED companies (from web research or the user),
ground them with ONE `resolve_companies` call (batch of
{name, linkedin_url?, domain?}, max 10) instead of per-company
`search_companies` calls. If the response has `import_pending: true`,
unmatched companies with a LinkedIn URL or domain are being imported in
the background — re-call `resolve_companies` with the same arguments
after `poll_after_seconds` seconds; stop once `import_pending` is
false, or after 2-3 re-polls. Companies in `not_found` are not in the
index and will not be imported.
```

- [ ] **Step 5: Run to verify all pass**

```bash
cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Mcp/Tools/ResolveCompaniesTest.php
```

Expected: PASS (7 tests). Do NOT run `tests/Feature/Mcp/RecruitingServerTest.php` — its `toHaveCount(15)` assertion is stale pre-existing breakage (server already registers 23 tools before this task).

- [ ] **Step 6: Pint + commit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint app/Mcp/Tools/ResolveCompanies.php app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/Tools/ResolveCompaniesTest.php
git add app/Mcp/Tools/ResolveCompanies.php app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/Tools/ResolveCompaniesTest.php
git commit -m "feat(mcp): register resolve_companies on the 360ai recruiting server

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: chat.360ai — map `resolve_companies` onto the companies card

**Files:**
- Modify: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/tools.ts`
- Modify: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/types.ts` (Company interface, lines 1-11)
- Modify: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/parse.ts` (switch at lines 178-197)
- Test: `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts`

**Interfaces:**
- Consumes: existing `parseCompanies(data)` (`parse.ts:47-53`), `AI360_TOOLS` map, `Company` type.
- Produces: `resolve_companies` recognized by `is360Tool` and parsed to `{ kind: 'companies', companies, count }` — the exact shape `ResultList`/`CompanyCard` already render. `matched_by` passes through on each company (extra keys survive `filterRecords`' cast) and is typed as optional.

- [ ] **Step 1: Write the failing jest tests**

In `/Users/eth0/Herd/chat.360ai/client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts`:

(a) In the `is360Tool` test, after the line `expect(is360Tool('search_companies')).toBe(true);` add:

```ts
    expect(is360Tool('resolve_companies')).toBe(true);
```

(b) Inside `describe('parse360Output', ...)`, after the `it('parses search_companies envelope', ...)` block, add:

```ts
  it('parses resolve_companies envelope into the companies kind, keeping matched_by', () => {
    const output = JSON.stringify({
      count: 1,
      companies: [
        {
          id: '7',
          name: 'Acme',
          website: 'acme.com',
          linkedin_url: 'https://www.linkedin.com/company/acme',
          matched_by: 'linkedin',
        },
      ],
      not_found: ['Ghost Corp'],
      import_pending: true,
      poll_after_seconds: 8,
    });
    const result = parse360Output('resolve_companies', output);
    expect(result).toEqual({
      kind: 'companies',
      count: 1,
      companies: [
        {
          id: '7',
          name: 'Acme',
          website: 'acme.com',
          linkedin_url: 'https://www.linkedin.com/company/acme',
          matched_by: 'linkedin',
        },
      ],
    });
  });

  it('returns null for resolve_companies error envelopes and malformed output', () => {
    expect(parse360Output('resolve_companies', JSON.stringify({ error: 'boom' }))).toBeNull();
    expect(parse360Output('resolve_companies', JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(parse360Output('resolve_companies', '{not json')).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
```

Expected: FAIL — `is360Tool('resolve_companies')` is `false` and `parse360Output('resolve_companies', ...)` returns `null`.

- [ ] **Step 3: Implement the mapping**

(a) `tools.ts` — add the entry right after `search_companies`:

```ts
export const AI360_TOOLS = {
  search_companies: 'companies',
  resolve_companies: 'companies',
  search_talents: 'talents',
```

(b) `types.ts` — extend the `Company` interface (after `description`):

```ts
export interface Company {
  id?: string | number;
  name?: string | null;
  linkedin_url?: string | null;
  linkedin_universal_name?: string | null;
  website?: string | null;
  industry?: string | null;
  employee_range?: string | null;
  location?: string | null;
  description?: string | null;
  matched_by?: 'linkedin' | 'domain' | 'name';
}
```

(c) `parse.ts` — in the `switch (toolName)`, make `resolve_companies` fall through to the same parser:

```ts
    case 'search_companies':
    case 'resolve_companies':
      return parseCompanies(data);
```

- [ ] **Step 4: Run the AI360 jest suite to verify pass and no regressions**

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360
```

Expected: PASS (all AI360 tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add client/src/components/Chat/Messages/Content/AI360/tools.ts client/src/components/Chat/Messages/Content/AI360/types.ts client/src/components/Chat/Messages/Content/AI360/parse.ts client/src/components/Chat/Messages/Content/AI360/__tests__/parse.test.ts
git commit -m "feat(cards): map resolve_companies onto the companies result card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: chat.360ai — ground-first prompt upgrade in `librechat.yaml`

**Files:**
- Modify: `/Users/eth0/Herd/chat.360ai/librechat.yaml` — three ground-first blocks: 360ai spec item 6 (lines ~604-616), prospector paragraph (lines ~800-808), researcher paragraph (lines ~920-928; identical text to prospector's — use `replace_all`).

**Interfaces:**
- Consumes: the CURRENT hardened text from commit `e785d4b30` (anchors below verified against the working tree). The `search_companies` mention at line ~552 (candidate-employer verification in step 2d) is intentionally left unchanged — that is filter-based verification, not named-entity grounding.
- Produces: ground-first rules that batch named companies through `resolve_companies` with the standard re-poll contract; `search_companies` retained for filter-based discovery.

- [ ] **Step 1: Edit the 360ai spec item 6**

Replace this exact block (10+3-space continuation indent — currently at lines 604-616):

```
          6. GROUND FIRST — A MANDATORY STEP, NOT A SUGGESTION. Whenever
             your answer will name specific companies or people (target
             lists, market maps, shortlists, key decision-makers), STOP
             before writing it and run the internal lookups: one
             `search_companies` call per named company for your top ~5-10,
             `search_talents`/`search_candidates` for named people. THEN
             write the answer. Web research does NOT replace this — the
             targets you found online are exactly the ones to ground.
             Found internally → its tool card renders (skip the inline
             card); not found → emit the inline 360ai-card. ONE rich
             presentation per entity, never both. If a lookup errors,
             continue with inline cards — never block the answer.
```

with:

```
          6. GROUND FIRST — A MANDATORY STEP, NOT A SUGGESTION. Whenever
             your answer will name specific companies or people (target
             lists, market maps, shortlists, key decision-makers), STOP
             before writing it and run the internal lookups: ONE
             `resolve_companies` call with the batch of named companies
             for your top ~5-10 ({name, linkedin_url?, domain?} from
             your research), `search_talents`/`search_candidates` for
             named people. THEN write the answer. Web research does NOT
             replace this — the targets you found online are exactly the
             ones to ground. Matched → its tool card renders (skip the
             inline card); `import_pending` → re-poll resolve_companies
             with the same arguments after `poll_after_seconds` (stop
             after 2-3 re-polls), showing the inline card meanwhile and
             replacing it on the next poll if the company lands;
             `not_found` → keep the inline 360ai-card. ONE rich
             presentation per entity, never both. `search_companies`
             remains for filter-based discovery. If a lookup errors,
             continue with inline cards — never block the answer.
```

- [ ] **Step 2: Edit the prospector + researcher paragraphs (one `replace_all` edit)**

Replace ALL occurrences (there are exactly 2 — prospector ~line 800, researcher ~line 920) of:

```
          Ground first — mandatory, not optional: when your answer names
          specific companies or people, run the internal lookups BEFORE
          writing it (one search_companies call per named company, top
          ~5-10; search_talents or search_candidates for people) — even
          when they came from web research, ESPECIALLY then. Found → its
          tool card renders: skip the inline card, ONE card per entity,
          never both. If a lookup errors, continue with inline cards —
          never block the answer.
```

with:

```
          Ground first — mandatory, not optional: when your answer names
          specific companies or people, run the internal lookups BEFORE
          writing it (ONE resolve_companies call with the batch of named
          companies — {name, linkedin_url?, domain?}, top ~5-10;
          search_talents or search_candidates for people) — even when
          they came from web research, ESPECIALLY then. Matched → its
          tool card renders: skip the inline card, ONE card per entity,
          never both. import_pending → re-poll with the same arguments
          after poll_after_seconds (stop after 2-3 re-polls); not_found →
          keep the inline card. search_companies stays for filter-based
          discovery. If a lookup errors, continue with inline cards —
          never block the answer.
```

- [ ] **Step 3: Verify — yaml parses and content assertions hold**

```bash
cd /Users/eth0/Herd/chat.360ai
node -e "
const fs = require('fs');
const yaml = require('js-yaml');
const doc = yaml.load(fs.readFileSync('librechat.yaml', 'utf8'));
if (!doc || typeof doc !== 'object') throw new Error('yaml did not parse to an object');
console.log('yaml parse OK');
"
grep -c "resolve_companies" librechat.yaml
grep -c "one search_companies call per named company" librechat.yaml || true
grep -n "GROUND FIRST — A MANDATORY STEP" librechat.yaml
```

Expected: `yaml parse OK`; `resolve_companies` count is `4` (twice in the 360ai item 6 block, once each in prospector/researcher); the `one search_companies call per named company` count is `0` (grep exits 1 — that is the pass condition); the GROUND FIRST heading still present exactly once. Also confirm the untouched verification mention survives: `grep -n 'verify with' librechat.yaml` still shows the step-2d line (~552).

- [ ] **Step 4: Read-whole-prompt contradiction check**

Read the three edited prompt blocks in full (`sed -n '560,640p;770,830p;890,950p' librechat.yaml`) and confirm: (1) the deep-dive rule (get_candidates) and the one-rich-presentation-per-entity card rule still stand uncontradicted; (2) the terse-reply paragraphs from commit `13533fdad` are intact; (3) no block now instructs per-company `search_companies` grounding anywhere.

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/chat.360ai
git add librechat.yaml
git commit -m "feat(specs): ground named companies via batched resolve_companies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Verification sweep (both repos)

**Files:** none created — verification only. Fix-forward anything found, amend into the relevant task's commit style (a follow-up `fix:` commit is fine).

- [ ] **Step 1: Laravel — re-run every test file this plan touched, isolated**

```bash
cd /Users/eth0/Herd/360ai
php artisan test tests/Feature/Services/CompanySearch/CompanyResolverTest.php
php artisan test tests/Unit/Jobs/ImportCompanyByUniversalNameJobTest.php
php artisan test tests/Feature/Actions/ImportCompanyByDomainActionTest.php tests/Feature/Jobs/ImportCompanyByDomainJobTest.php
php artisan test tests/Feature/Mcp/Tools/ResolveCompaniesTest.php
php artisan test tests/Feature/Mcp/Tools/SearchCompaniesTest.php
php artisan test tests/Feature/Services/CompanySearch/UnifiedCompanySearchServiceTest.php
```

Expected: all PASS (the last two prove no regression in the neighboring company-search seams).

- [ ] **Step 2: Laravel — pint check + clean staging audit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint --test app/Services/CompanySearch/CompanyResolver.php app/Actions/Companies/ImportCompanyByDomainAction.php app/Jobs/Companies/ImportCompanyByDomainJob.php app/Jobs/ImportCompanyByUniversalName.php app/Mcp/Tools/ResolveCompanies.php app/Mcp/Servers/RecruitingServer.php
git status --porcelain
git log --oneline feature/360ai-chat-auth..HEAD
```

Expected: pint reports no issues; `git status` shows ONLY the pre-existing dirt (`.phpunit.cache/test-results` modified + the 5 untracked docs listed in Global Constraints — nothing new, nothing staged); log shows exactly 5 commits (Tasks 1-5).

- [ ] **Step 3: chat.360ai — jest + yaml + staging audit**

```bash
cd /Users/eth0/Herd/chat.360ai/client && npx jest src/components/Chat/Messages/Content/AI360
cd /Users/eth0/Herd/chat.360ai
node -e "require('js-yaml').load(require('fs').readFileSync('librechat.yaml','utf8')); console.log('yaml OK')"
git status --porcelain
git log --oneline -2
```

Expected: all AI360 tests PASS; `yaml OK`; working tree clean; the top two commits are Task 7's spec commit and Task 6's cards commit on `feat/360ai-result-cards`.

- [ ] **Step 4: Contract conformance read-through**

Re-read the "Pinned contract" section of this plan against `app/Mcp/Tools/ResolveCompanies.php` + `app/Services/CompanySearch/CompanyResolver.php` and tick each clause: input shape + max 10 pre-service errors; envelope keys (`count`, `companies` + `matched_by`, `not_found`, `import_pending`, `poll_after_seconds` only when pending); precedence linkedin → domain → name; identifier-bearing unmatched → queued import on `background-search` with ShouldBeUnique dedupe; name-only → `not_found` with no import; no credit checks; `suite.talent_lookup.crustdata.enabled` gate; re-poll contract in tool description AND server instructions; registered on RecruitingServer.
