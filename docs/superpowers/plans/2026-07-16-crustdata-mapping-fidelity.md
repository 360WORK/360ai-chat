# Crustdata Mapping Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the lossy `SearchTerm` → Crustdata persondb filter mapping so boolean/free-text searches, roles, keyword excludes, soft skills, geo filters, education levels, and industry groups actually reach Crustdata — and fix the response-side phone/open-to-work mapping.

**Architecture:** All mapping work happens in `CrustdataLookup::buildFilters()` (already public and covered by a Pest suite that asserts exact filter payloads via `CrustdataLookup::make($searchTerm)->buildFilters()` — no new test seam is needed). Crustdata has no negative-contains operator, so keyword excludes and boolean `NOT` terms are applied as client-side post-filters in `CrustdataLookup::search()`. A new `BooleanQueryTranslator` decomposes sanitized boolean queries into Crustdata AND/OR condition trees. Response-side fixes live in `CrustdataPersonMapper`.

**Tech Stack:** PHP 8.4 / Laravel 13, Pest tests, Crustdata persondb REST API (`crustdata.md` §2491–3065 is the API reference in the repo root).

## Global Constraints

- **All work happens in the Laravel repo `/Users/eth0/Herd/360ai`** (GitHub `360WORK/hire-suite`) — NOT in chat.360ai.
- **Branch:** `feat/crustdata-mapping-fidelity`, created from the current working branch `feature/360ai-chat-auth`. The working tree has unrelated dirty files (`app/Mcp/Servers/RecruitingServer.php`, `app/Mcp/Tools/SaveOnboardingProfile.php`, `app/Services/Agent/OnboardingProfile.php`, untracked docs). **Never `git add -A` — stage only the files listed in each commit step.**
- **No per-user credit checks on Crustdata** (platform-level integration; approved spec decision). Do not add any.
- **Isolated test runs only.** The full suite has known breakage from the Laravel 13 upgrade. Run exactly the file(s) named in each step, e.g. `php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`. Never run the whole suite; unrelated failures are not yours to fix.
- **Test conventions:** Pest (`it(...)` style). Feature tests boot Laravel via `uses(Tests\TestCase::class)->in('Feature')` in `tests/Pest.php`; Unit tests do not boot the app.
- **Code style:** mirror the existing `apply*Conditions(array &$conditions): void` private-method pattern in `CrustdataLookup`, `declare(strict_types=1)`, collection pipelines, no narrating comments.
- **Crustdata operator semantics** (crustdata.md §2613–2685): `(.)` fuzzy/contains (multi-word: all words required, any order), `[.]` substring/exact-token, `=` exact (case-insensitive on text), `in`/`not_in` exact set membership, `=>`/`=<` numeric. There is **no negative-contains operator** — `not_in` compares whole values.

---

### Task 1: Branch setup + free-text `query` fallback condition

A `SearchTerm` carrying only a free-text `query` currently passes `hasAppliedFilters()` (SearchTerm.php:577) but produces zero conditions, so `buildFilters()` returns `[]` and `search()` returns empty without calling Crustdata. Add a fallback: when the query is short free text and no title/headline condition was built, emit a `headline`/`summary`/`current_employers.title` fuzzy OR-group.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

**Interfaces:**
- Produces: private `applyFreeTextQueryConditions(array &$conditions): void` and private `hasAnyColumnCondition(array $conditions, array $columns): bool` on `CrustdataLookup` (Task 5 relies on `hasAnyColumnCondition` NOT existing elsewhere; Tasks 2–3 add sibling methods).

- [ ] **Step 1: Create the branch**

```bash
cd /Users/eth0/Herd/360ai
git branch --show-current   # expect: feature/360ai-chat-auth
git status --porcelain      # note the pre-existing dirty files; leave them alone
git checkout -b feat/crustdata-mapping-fidelity
```

- [ ] **Step 2: Baseline run of the existing suite**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (all ~50 tests). If anything fails here already, stop and report before changing code.

- [ ] **Step 3: Write the failing tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('falls back to a headline/summary/title fuzzy group for a free-text query', function () {
    $searchTerm = SearchTerm::fromArray([
        'query' => 'senior laravel developer',
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();

    expect($filters['op'])->toBe('or');
    expect(collect($filters['conditions'])->pluck('column')->all())
        ->toBe(['headline', 'summary', 'current_employers.title']);
    expect(collect($filters['conditions'])->every(
        fn ($c) => $c['type'] === '(.)' && $c['value'] === 'senior laravel developer',
    ))->toBeTrue();
});

it('does not emit the free-text fallback when a job title condition exists', function () {
    $searchTerm = SearchTerm::fromArray([
        'query' => 'senior laravel developer',
        'job_title' => 'Software Engineer',
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();

    expect($filters)->toEqual([
        'column' => 'current_employers.title',
        'type' => '(.)',
        'value' => 'Software Engineer',
    ]);
});

it('does not emit the free-text fallback for long job-description queries', function () {
    $searchTerm = SearchTerm::fromArray([
        'query' => 'We are hiring a senior backend developer to join our growing platform team building distributed systems at scale',
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();

    expect($filters)->toBeEmpty();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="free-text"`
Expected: FAIL — first test gets `[]` instead of an or-group (the other two may already pass; that is fine).

- [ ] **Step 5: Implement the fallback**

In `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`, inside `buildFilters()`, add a call **after** `$this->applyKeywordConditions($conditions);`:

```php
        $this->applyKeywordConditions($conditions);
        $this->applyFreeTextQueryConditions($conditions);
```

Add these two methods after `applyKeywordConditions()`:

```php
    /**
     * Fallback for free-text-only searches: without this, a SearchTerm whose only
     * signal is `query` passes hasAppliedFilters() but builds zero conditions and
     * silently returns no results. Long queries (job descriptions) are skipped —
     * the fuzzy (.) operator requires every word to be present.
     *
     * @param  array<int, array<string, mixed>>  $conditions
     */
    private function applyFreeTextQueryConditions(array &$conditions): void
    {
        if ($this->searchTerms->is_boolean_search) {
            return;
        }

        $query = trim((string) ($this->searchTerms->query ?? ''));
        if ($query === '') {
            return;
        }

        $words = preg_split('/\s+/', $query, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (count($words) > 12) {
            return;
        }

        if ($this->hasAnyColumnCondition($conditions, ['current_employers.title', 'past_employers.title', 'headline'])) {
            return;
        }

        $conditions[] = [
            'op' => 'or',
            'conditions' => [
                ['column' => 'headline', 'type' => '(.)', 'value' => $query],
                ['column' => 'summary', 'type' => '(.)', 'value' => $query],
                ['column' => 'current_employers.title', 'type' => '(.)', 'value' => $query],
            ],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $conditions
     * @param  array<int, string>  $columns
     */
    private function hasAnyColumnCondition(array $conditions, array $columns): bool
    {
        foreach ($conditions as $condition) {
            if (in_array($condition['column'] ?? null, $columns, true)) {
                return true;
            }
            foreach ($condition['conditions'] ?? [] as $inner) {
                if (in_array($inner['column'] ?? null, $columns, true)) {
                    return true;
                }
            }
        }

        return false;
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file — confirms no regression in the other ~50 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): map free-text query to headline/summary/title fuzzy fallback"
```

---

### Task 2: Real negative-contains semantics for keyword excludes

`keyword_exclude_all`/`keyword_exclude_any` currently become `headline not_in [<keywords>]` (CrustdataLookup.php:468–474) — `not_in` is whole-value equality, so a keyword never equals a full headline and the condition is a no-op. Crustdata has **no** negative-contains operator, so the correct implementation is client-side: drop the bogus condition and reject returned profiles whose text contains excluded keywords.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php` (also rewrites the existing test `maps keyword_exclude_* as not_in`)

**Interfaces:**
- Produces: private properties `array $excludedKeywordsAny` / `array $excludedKeywordsAll` on `CrustdataLookup`, reset at the top of `buildFilters()` and **merged** into (never assigned over) by `apply*` methods. Task 3 merges boolean `NOT` terms into `$excludedKeywordsAny`.
- Semantics: `exclude_any` rejects a profile containing ANY listed keyword; `exclude_all` rejects only profiles containing EVERY listed keyword. Matching is case-insensitive substring over `headline + summary + job_title` of the mapped `TalentData`.

- [ ] **Step 1: Write the failing tests**

In `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`, **replace** the existing test `it('maps keyword_exclude_* as not_in', ...)` (the whole block) with:

```php
it('does not send keyword excludes as headline not_in conditions', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'keyword_exclude_all' => ['intern'],
        'keyword_exclude_any' => ['junior'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    expect($conditions->firstWhere('type', 'not_in'))->toBeNull();
});

it('rejects results containing any keyword_exclude_any keyword', function () {
    Http::fake([
        'api.crustdata.com/screener/persondb/search' => Http::response([
            'profiles' => [
                ['person_id' => 1, 'name' => 'A', 'headline' => 'Software Engineering Intern'],
                ['person_id' => 2, 'name' => 'B', 'headline' => 'Senior Software Engineer'],
            ],
            'total_count' => 2,
        ], 200),
    ]);

    $talents = CrustdataLookup::make(SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'keyword_exclude_any' => ['intern'],
    ]))->search();

    expect($talents)->toHaveCount(1)
        ->and($talents->first()->full_name)->toBe('B');
});

it('rejects results only when every keyword_exclude_all keyword is present', function () {
    Http::fake([
        'api.crustdata.com/screener/persondb/search' => Http::response([
            'profiles' => [
                ['person_id' => 1, 'name' => 'A', 'headline' => 'Junior PHP Intern'],
                ['person_id' => 2, 'name' => 'B', 'headline' => 'Junior PHP Developer'],
            ],
            'total_count' => 2,
        ], 200),
    ]);

    $talents = CrustdataLookup::make(SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'keyword_exclude_all' => ['junior', 'intern'],
    ]))->search();

    expect($talents)->toHaveCount(1)
        ->and($talents->first()->full_name)->toBe('B');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="keyword_exclude"`
Expected: FAIL — the `not_in` condition still exists and no client-side rejection happens (`toHaveCount(1)` gets 2).

- [ ] **Step 3: Implement client-side exclusion**

In `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`:

Add the import (with the other `use` statements):

```php
use App\DataTransferObject\Talent\TalentData;
```

Add properties below `private int $totalCount = 0;`:

```php
    /** @var array<int, string> */
    private array $excludedKeywordsAny = [];

    /** @var array<int, string> */
    private array $excludedKeywordsAll = [];
```

In `buildFilters()`, reset them right after the `hasAppliedFilters()` guard:

```php
        if (! $this->searchTerms->hasAppliedFilters()) {
            return [];
        }

        $this->excludedKeywordsAny = [];
        $this->excludedKeywordsAll = [];

        $conditions = [];
```

In `applyKeywordConditions()`, **replace** the "Excludes - collapse both lists" block:

```php
        // Excludes - collapse both lists
        $keywordsExclude = collect(array_merge(
            $this->searchTerms->keyword_exclude_all ?? [],
            $this->searchTerms->keyword_exclude_any ?? [],
        ))->filter()->unique()->values()->all();
        if ($keywordsExclude !== []) {
            $conditions[] = ['column' => 'headline', 'type' => 'not_in', 'value' => $keywordsExclude];
        }
```

with:

```php
        // Crustdata has no negative-contains operator (not_in is whole-value
        // equality), so excludes are applied client-side after mapping.
        $this->excludedKeywordsAny = array_values(array_unique(array_merge(
            $this->excludedKeywordsAny,
            collect($this->searchTerms->keyword_exclude_any ?? [])->filter()->unique()->values()->all(),
        )));
        $this->excludedKeywordsAll = array_values(array_unique(array_merge(
            $this->excludedKeywordsAll,
            collect($this->searchTerms->keyword_exclude_all ?? [])->filter()->unique()->values()->all(),
        )));
```

In `search()`, change the final return from `return $result->talents;` to:

```php
        return $this->rejectExcludedKeywords($result->talents);
```

Add these methods after `applyKeywordConditions()`:

```php
    private function rejectExcludedKeywords(Collection $talents): Collection
    {
        if ($this->excludedKeywordsAny === [] && $this->excludedKeywordsAll === []) {
            return $talents;
        }

        return $talents
            ->reject(fn (TalentData $talent) => $this->matchesExcludedKeywords($talent))
            ->values();
    }

    private function matchesExcludedKeywords(TalentData $talent): bool
    {
        $haystack = mb_strtolower(implode(' ', array_filter([
            $talent->headline,
            $talent->summary,
            $talent->job_title,
        ])));

        if ($haystack === '') {
            return false;
        }

        foreach ($this->excludedKeywordsAny as $keyword) {
            if (str_contains($haystack, mb_strtolower($keyword))) {
                return true;
            }
        }

        if ($this->excludedKeywordsAll === []) {
            return false;
        }

        foreach ($this->excludedKeywordsAll as $keyword) {
            if (! str_contains($haystack, mb_strtolower($keyword))) {
                return false;
            }
        }

        return true;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "fix(crustdata): replace no-op headline not_in with client-side keyword exclusion"
```

---

### Task 3: Boolean query translator

`boolean_query` searches currently build zero Crustdata conditions. Add `BooleanQueryTranslator` (recursive-descent over quoted phrases, `AND`/`OR`/implicit-AND, `NOT`/`-term`, parentheses) producing a Crustdata condition tree; `NOT` terms are returned separately and fed into the Task 2 client-side exclusion. Input is pre-cleaned by the existing `App\TalentLookup\BooleanQuerySanitizer`.

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/BooleanQueryTranslator.php`
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php` (new), `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

**Interfaces:**
- Consumes: `$this->excludedKeywordsAny` merge pattern from Task 2.
- Produces: `BooleanQueryTranslator::translate(string $query): array{filter: array<string, mixed>, excluded: list<string>}`. Each positive term expands to an OR across columns `headline`, `summary`, `skills`, `current_employers.title` with the `(.)` operator.

- [ ] **Step 1: Write the failing unit tests**

Create `/Users/eth0/Herd/360ai/tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php`:

```php
<?php

use App\TalentLookup\Crustdata\BooleanQueryTranslator;

it('translates a single term into a cross-column fuzzy OR group', function () {
    $result = (new BooleanQueryTranslator)->translate('python');

    expect($result['excluded'])->toBe([]);
    expect($result['filter']['op'])->toBe('or');
    expect(collect($result['filter']['conditions'])->pluck('column')->all())
        ->toBe(['headline', 'summary', 'skills', 'current_employers.title']);
    expect(collect($result['filter']['conditions'])->every(
        fn ($c) => $c['type'] === '(.)' && $c['value'] === 'python',
    ))->toBeTrue();
});

it('translates AND with a parenthesised OR group', function () {
    $result = (new BooleanQueryTranslator)->translate('"machine learning" AND (python OR django)');

    $filter = $result['filter'];
    expect($filter['op'])->toBe('and');
    expect($filter['conditions'])->toHaveCount(2);

    [$phrase, $orGroup] = $filter['conditions'];
    expect($phrase['op'])->toBe('or');
    expect(collect($phrase['conditions'])->every(fn ($c) => $c['value'] === 'machine learning'))->toBeTrue();

    expect($orGroup['op'])->toBe('or');
    $values = collect($orGroup['conditions'])
        ->flatMap(fn ($group) => collect($group['conditions'])->pluck('value'))
        ->unique()->values()->all();
    expect($values)->toBe(['python', 'django']);
});

it('treats bare adjacency as implicit AND', function () {
    $result = (new BooleanQueryTranslator)->translate('senior laravel');

    expect($result['filter']['op'])->toBe('and');
    expect($result['filter']['conditions'])->toHaveCount(2);
});

it('collects NOT and minus-prefixed terms as excluded', function () {
    $result = (new BooleanQueryTranslator)->translate('python NOT intern -junior');

    expect($result['excluded'])->toBe(['intern', 'junior']);
    expect($result['filter']['op'])->toBe('or');
    expect(collect($result['filter']['conditions'])->every(fn ($c) => $c['value'] === 'python'))->toBeTrue();
});

it('collects every term of a negated group as excluded', function () {
    $result = (new BooleanQueryTranslator)->translate('python NOT (intern OR junior)');

    expect($result['excluded'])->toBe(['intern', 'junior']);
});

it('returns an empty filter for an empty query', function () {
    $result = (new BooleanQueryTranslator)->translate('');

    expect($result['filter'])->toBe([])
        ->and($result['excluded'])->toBe([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php`
Expected: FAIL — `Class "App\TalentLookup\Crustdata\BooleanQueryTranslator" not found`.

- [ ] **Step 3: Implement the translator**

Create `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/BooleanQueryTranslator.php`:

```php
<?php

declare(strict_types=1);

namespace App\TalentLookup\Crustdata;

class BooleanQueryTranslator
{
    private const COLUMNS = ['headline', 'summary', 'skills', 'current_employers.title'];

    /** @var array<int, string> */
    private array $tokens = [];

    private int $position = 0;

    /** @var array<int, string> */
    private array $excluded = [];

    /**
     * Translate a sanitized boolean query into a Crustdata filter tree.
     *
     * Grammar: quoted phrases, AND / OR (implicit AND between adjacent terms),
     * NOT / leading minus, parentheses. Crustdata cannot express negation over
     * text-contains, so negated terms are returned in `excluded` for
     * client-side filtering.
     *
     * @return array{filter: array<string, mixed>, excluded: array<int, string>}
     */
    public function translate(string $query): array
    {
        $this->tokens = $this->tokenize($query);
        $this->position = 0;
        $this->excluded = [];

        $filter = $this->parseOr() ?? [];

        return [
            'filter' => $filter,
            'excluded' => array_values(array_unique($this->excluded)),
        ];
    }

    /**
     * @return array<int, string>
     */
    private function tokenize(string $query): array
    {
        preg_match_all('/"[^"]*"|\(|\)|[^\s()]+/u', $query, $matches);

        return array_values(array_filter($matches[0], fn (string $token) => trim($token) !== ''));
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseOr(): ?array
    {
        $groups = [];

        $group = $this->parseAnd();
        if ($group !== null) {
            $groups[] = $group;
        }

        while ($this->currentIs('OR')) {
            $this->position++;
            $group = $this->parseAnd();
            if ($group !== null) {
                $groups[] = $group;
            }
        }

        if ($groups === []) {
            return null;
        }

        return count($groups) === 1 ? $groups[0] : ['op' => 'or', 'conditions' => $groups];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseAnd(): ?array
    {
        $parts = [];

        while (true) {
            if ($this->currentIs('AND')) {
                $this->position++;

                continue;
            }
            if ($this->current() === null || $this->currentIs('OR') || $this->current() === ')') {
                break;
            }

            $part = $this->parseUnary();
            if ($part !== null) {
                $parts[] = $part;
            }
        }

        if ($parts === []) {
            return null;
        }

        return count($parts) === 1 ? $parts[0] : ['op' => 'and', 'conditions' => $parts];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseUnary(): ?array
    {
        if ($this->currentIs('NOT')) {
            $this->position++;
            $this->collectExcluded();

            return null;
        }

        $token = $this->current();
        if ($token !== null && str_starts_with($token, '-') && mb_strlen($token) > 1) {
            $this->position++;
            $this->excluded[] = $this->cleanTerm(mb_substr($token, 1));

            return null;
        }

        return $this->parsePrimary();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parsePrimary(): ?array
    {
        $token = $this->current();
        if ($token === null) {
            return null;
        }

        if ($token === '(') {
            $this->position++;
            $group = $this->parseOr();
            if ($this->current() === ')') {
                $this->position++;
            }

            return $group;
        }

        if ($token === ')') {
            $this->position++;

            return null;
        }

        $this->position++;

        return $this->termFilter($this->cleanTerm($token));
    }

    /** Consume the operand after NOT (term, phrase, or parenthesised group) into excluded. */
    private function collectExcluded(): void
    {
        $token = $this->current();
        if ($token === null) {
            return;
        }

        if ($token !== '(') {
            $this->position++;
            $this->excluded[] = $this->cleanTerm($token);

            return;
        }

        $this->position++;
        $depth = 1;
        while (($token = $this->current()) !== null && $depth > 0) {
            $this->position++;
            if ($token === '(') {
                $depth++;

                continue;
            }
            if ($token === ')') {
                $depth--;

                continue;
            }
            if (! in_array(strtoupper($token), ['AND', 'OR', 'NOT'], true)) {
                $this->excluded[] = $this->cleanTerm($token);
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function termFilter(string $term): ?array
    {
        if ($term === '') {
            return null;
        }

        return [
            'op' => 'or',
            'conditions' => array_map(
                fn (string $column) => ['column' => $column, 'type' => '(.)', 'value' => $term],
                self::COLUMNS,
            ),
        ];
    }

    private function cleanTerm(string $token): string
    {
        return trim($token, "\"' ");
    }

    private function current(): ?string
    {
        return $this->tokens[$this->position] ?? null;
    }

    private function currentIs(string $keyword): bool
    {
        $token = $this->current();

        return $token !== null && strtoupper($token) === $keyword;
    }
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing wiring tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('builds filters from a boolean query instead of returning empty', function () {
    $searchTerm = SearchTerm::fromArray([
        'is_boolean_search' => true,
        'boolean_query' => '"machine learning" AND (python OR django)',
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();

    expect($filters)->not->toBeEmpty()
        ->and($filters['op'])->toBe('and')
        ->and($filters['conditions'])->toHaveCount(2);
});

it('applies boolean NOT terms as client-side exclusions', function () {
    Http::fake([
        'api.crustdata.com/screener/persondb/search' => Http::response([
            'profiles' => [
                ['person_id' => 1, 'name' => 'A', 'headline' => 'Engineering Intern'],
                ['person_id' => 2, 'name' => 'B', 'headline' => 'Staff Engineer'],
            ],
            'total_count' => 2,
        ], 200),
    ]);

    $talents = CrustdataLookup::make(SearchTerm::fromArray([
        'is_boolean_search' => true,
        'boolean_query' => 'engineer NOT intern',
    ]))->search();

    expect($talents)->toHaveCount(1)
        ->and($talents->first()->full_name)->toBe('B');
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="boolean"`
Expected: FAIL — `buildFilters()` returns `[]` for boolean searches.

- [ ] **Step 7: Wire the translator into buildFilters**

In `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`:

Add the import:

```php
use App\TalentLookup\BooleanQuerySanitizer;
```

In `buildFilters()`, add as the FIRST apply call (before `$this->applyJobTitleConditions($conditions);`):

```php
        $this->applyBooleanQueryConditions($conditions);
```

Add the method before `applyJobTitleConditions()`:

```php
    /**
     * @param  array<int, array<string, mixed>>  $conditions
     */
    private function applyBooleanQueryConditions(array &$conditions): void
    {
        if (! $this->searchTerms->is_boolean_search || ! $this->searchTerms->boolean_query) {
            return;
        }

        $sanitized = (new BooleanQuerySanitizer)->sanitize($this->searchTerms->boolean_query);
        if ($sanitized === '') {
            return;
        }

        $result = (new BooleanQueryTranslator)->translate($sanitized);

        if ($result['filter'] !== []) {
            $conditions[] = $result['filter'];
        }

        $this->excludedKeywordsAny = array_values(array_unique(array_merge(
            $this->excludedKeywordsAny,
            $result['excluded'],
        )));
    }
```

Note on the first wiring test: for `'"machine learning" AND (python OR django)'` the boolean tree is a single top-level condition, so `buildFilters()` returns it directly — an `and` of the phrase group and the or-group, hence `toHaveCount(2)`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/BooleanQueryTranslator.php app/TalentLookup/Crustdata/CrustdataLookup.php tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): translate boolean queries into persondb filter trees"
```

---

### Task 4: Keyword matches search summary as well as headline

`keyword_match_all` / `keyword_match_any` (and the legacy `required_keywords`, which `SearchTerm::normalizeKeywordFilters()` already folds into `keyword_match_all` — SearchTerm.php:860–892) currently hit `headline` only. Per keyword, emit a `headline OR summary` fuzzy group.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php` (also rewrites the existing test `builds keyword conditions from keyword_match_all`)

- [ ] **Step 1: Write the failing tests**

In `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`, **replace** the existing test `it('builds keyword conditions from keyword_match_all', ...)` (the whole block) with:

```php
it('builds a headline-or-summary group per keyword_match_all keyword', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'keyword_match_all' => ['machine learning', 'python'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    foreach (['machine learning', 'python'] as $keyword) {
        $group = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
            && collect($c['conditions'] ?? [])->every(fn ($inner) => $inner['value'] === $keyword));

        expect($group)->not->toBeNull();
        expect(collect($group['conditions'])->pluck('column')->all())->toBe(['headline', 'summary']);
        expect(collect($group['conditions'])->every(fn ($inner) => $inner['type'] === '(.)'))->toBeTrue();
    }
});

it('maps legacy required_keywords through keyword_match_all', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'required_keywords' => ['kubernetes'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $group = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && collect($c['conditions'] ?? [])->every(fn ($inner) => $inner['value'] === 'kubernetes'));

    expect($group)->not->toBeNull();
    expect(collect($group['conditions'])->pluck('column')->all())->toBe(['headline', 'summary']);
});

it('spans keyword_match_any across headline and summary in one OR group', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'keyword_match_any' => ['aws', 'gcp'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $anyGroup = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && collect($c['conditions'] ?? [])->contains(fn ($inner) => ($inner['column'] ?? null) === 'summary'));

    expect($anyGroup)->not->toBeNull();
    expect(collect($anyGroup['conditions'])->pluck('value')->unique()->values()->all())->toBe(['aws', 'gcp']);
    expect(collect($anyGroup['conditions'])->pluck('column')->unique()->values()->all())->toBe(['headline', 'summary']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="keyword"`
Expected: FAIL — match_all keywords are still flat headline conditions; match_any group has no summary column.

- [ ] **Step 3: Implement**

In `applyKeywordConditions()` in `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`, **replace** the "All" and "Any" blocks:

```php
        // All - single-value-per-condition, each sits in outer AND
        $keywordsAll = collect($this->searchTerms->keyword_match_all ?? [])->filter()->unique()->values()->all();
        foreach ($keywordsAll as $kw) {
            $conditions[] = ['column' => 'headline', 'type' => '(.)', 'value' => $kw];
        }

        // Any - OR-group
        $keywordsAny = collect($this->searchTerms->keyword_match_any ?? [])->filter()->unique()->values()->all();
        if ($filter = $this->textFilter('headline', $keywordsAny, '(.)')) {
            $conditions[] = $filter;
        }
```

with:

```php
        // All - one headline-or-summary group per keyword, each sits in outer AND
        $keywordsAll = collect($this->searchTerms->keyword_match_all ?? [])->filter()->unique()->values()->all();
        foreach ($keywordsAll as $kw) {
            $conditions[] = [
                'op' => 'or',
                'conditions' => [
                    ['column' => 'headline', 'type' => '(.)', 'value' => $kw],
                    ['column' => 'summary', 'type' => '(.)', 'value' => $kw],
                ],
            ];
        }

        // Any - single OR-group across headline and summary
        $keywordsAny = collect($this->searchTerms->keyword_match_any ?? [])->filter()->unique()->values()->all();
        if ($keywordsAny !== []) {
            $conditions[] = [
                'op' => 'or',
                'conditions' => collect($keywordsAny)
                    ->flatMap(fn (string $kw) => [
                        ['column' => 'headline', 'type' => '(.)', 'value' => $kw],
                        ['column' => 'summary', 'type' => '(.)', 'value' => $kw],
                    ])
                    ->values()
                    ->all(),
            ];
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file — the pre-existing test `maps keyword_match_any as an OR group` still passes because the group still contains headline conditions).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): span keyword matches across headline and summary"
```

---

### Task 5: Map roles/subroles to function_category + title OR-group

`roles`/`subroles` are silently dropped, so a role-only search sends no title-ish filter at all. Map roles → `current_employers.function_category (.)` and subroles → `current_employers.title (.)` inside a single OR group. Only when no explicit title filters exist (job_title / included_job_titles / job_title_conditions) — when titles exist, AND-ing a sparse function_category would over-restrict. Subrole enum values are snake_case (`information_technology`) and are humanized to spaces.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('maps role-only searches to a function_category/title OR group', function () {
    $searchTerm = SearchTerm::fromArray([
        'roles' => ['engineering'],
        'subroles' => ['software', 'information_technology'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();

    expect($filters['op'])->toBe('or');
    $conditions = collect($filters['conditions']);

    expect($conditions)->toContain([
        'column' => 'current_employers.function_category',
        'type' => '(.)',
        'value' => 'engineering',
    ])->toContain([
        'column' => 'current_employers.title',
        'type' => '(.)',
        'value' => 'software',
    ])->toContain([
        'column' => 'current_employers.title',
        'type' => '(.)',
        'value' => 'information technology',
    ]);
});

it('skips the roles group when explicit title filters exist', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Software Engineer',
        'roles' => ['engineering'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $functionCategory = $conditions->first(fn ($c) => ($c['column'] ?? null) === 'current_employers.function_category'
        || collect($c['conditions'] ?? [])->contains('column', 'current_employers.function_category'));

    expect($functionCategory)->toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="role"`
Expected: FAIL — role-only search builds `[]`.

- [ ] **Step 3: Implement**

In `buildFilters()` in `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`, add after `$this->applySeniorityConditions($conditions);`:

```php
        $this->applyRoleConditions($conditions);
```

Add the method after `applySeniorityConditions()`:

```php
    /**
     * Role-only searches previously sent no title filter at all. Roles map to
     * Crustdata's function_category, subroles to fuzzy title terms; both live
     * in one OR group. Skipped when explicit title filters exist — AND-ing a
     * sparsely populated function_category with titles over-restricts.
     *
     * @param  array<int, array<string, mixed>>  $conditions
     */
    private function applyRoleConditions(array &$conditions): void
    {
        $hasTitleFilters = $this->searchTerms->job_title
            || $this->searchTerms->included_job_titles
            || $this->searchTerms->job_title_conditions;

        if ($hasTitleFilters) {
            return;
        }

        $roleConditions = collect($this->searchTerms->roles ?? [])
            ->filter()
            ->unique()
            ->map(fn (string $role) => [
                'column' => 'current_employers.function_category',
                'type' => '(.)',
                'value' => str_replace('_', ' ', $role),
            ])
            ->merge(
                collect($this->searchTerms->subroles ?? [])
                    ->filter()
                    ->unique()
                    ->map(fn (string $subrole) => [
                        'column' => 'current_employers.title',
                        'type' => '(.)',
                        'value' => str_replace('_', ' ', $subrole),
                    ]),
            )
            ->values()
            ->all();

        if ($roleConditions === []) {
            return;
        }

        $conditions[] = count($roleConditions) === 1
            ? $roleConditions[0]
            : ['op' => 'or', 'conditions' => $roleConditions];
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file — the pre-existing kitchen-sink test sets `roles` together with `job_title`, so it is unaffected by the gate).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): map roles and subroles to function_category/title OR group"
```

---

### Task 6: Fold soft_skills into the skills OR-group

`soft_skills` is dropped today. Merge it into the existing `skills (.)` OR-group in `applySkillConditions()` (CrustdataLookup.php:508).

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

- [ ] **Step 1: Write the failing test**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('folds soft_skills into the skills OR group', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'required_skills' => ['python'],
        'soft_skills' => ['leadership'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $skillsGroup = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && collect($c['conditions'] ?? [])->contains('column', 'skills'));

    expect($skillsGroup)->not->toBeNull();
    expect(collect($skillsGroup['conditions'])->pluck('value'))->toContain('python', 'leadership');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="soft_skills"`
Expected: FAIL — `leadership` is missing from the skills group.

- [ ] **Step 3: Implement**

In `applySkillConditions()` in `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`, **replace**:

```php
        $skills = collect([
            $this->searchTerms->required_skills ?? [],
            $this->searchTerms->desired_skills ?? [],
        ])->flatten(1);
```

with:

```php
        $skills = collect([
            $this->searchTerms->required_skills ?? [],
            $this->searchTerms->desired_skills ?? [],
            $this->searchTerms->soft_skills ?? [],
        ])->flatten(1);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): include soft_skills in the skills filter group"
```

---

### Task 7: Fuzzy geo operators (region, countries, continents)

Per the approved spec: `region` switches `[.]` → `(.)` (CrustdataLookup.php:388), and `location_country` / `location_continent` switch `=` → `(.)` (`:409`, `:426`). **Heads-up:** crustdata.md §2676–2678 (persondb) warns that `(.)` on `region` can cross-match countries (Illinois → India) and recommends `[.]` for state-level filters; the spec decision was still to go fuzzy because our `region` values come from geocoders/users with varied phrasings. Follow the spec; the note stays in the code comment. Three existing tests assert the old operators and are updated here.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

- [ ] **Step 1: Update the existing assertions and add coverage**

In `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

1. In `it('builds region condition from address and geo_distance from locations with distance', ...)`, change:

```php
    expect($conditions)->toContain([
        'column' => 'region',
        'type' => '[.]',
        'value' => 'San Francisco Bay Area',
    ]);
```

to:

```php
    expect($conditions)->toContain([
        'column' => 'region',
        'type' => '(.)',
        'value' => 'San Francisco Bay Area',
    ]);
```

2. In `it('wraps multiple conditions in an and-op object', ...)`, change:

```php
    // Region is a flat [.] condition
    expect($conditions)->toContain(['column' => 'region', 'type' => '[.]', 'value' => 'London']);
```

to:

```php
    // Region is a flat (.) condition
    expect($conditions)->toContain(['column' => 'region', 'type' => '(.)', 'value' => 'London']);
```

3. **Replace** the whole test `it('uses substring [.] for region to avoid cross-country fuzzy matches', ...)` with:

```php
it('uses fuzzy (.) for region to tolerate varied location phrasings', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'address' => 'St. Peter Port, Guernsey',
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = crustdataExtractConditions($filters);

    expect(collect($conditions))->toContain([
        'column' => 'region',
        'type' => '(.)',
        'value' => 'St. Peter Port, Guernsey',
    ]);
});
```

4. **Replace** the whole test `it('maps countries to location_country with = operator', ...)` with:

```php
it('maps countries to location_country with fuzzy (.) operator', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'countries' => ['united kingdom', 'germany'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $countryFilter = $conditions->first(fn ($c) => ($c['column'] ?? null) === 'location_country'
        || collect($c['conditions'] ?? [])->contains('column', 'location_country'));

    expect($countryFilter)->not->toBeNull();
    expect($countryFilter['op'])->toBe('or');
    $values = collect($countryFilter['conditions'])->pluck('value');
    expect($values)->toContain('United Kingdom', 'Germany');
    expect(collect($countryFilter['conditions'])->every(fn ($c) => $c['type'] === '(.)'))->toBeTrue();
});
```

5. Append a continent-operator test:

```php
it('maps continents to location_continent with fuzzy (.) operator', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'continents' => ['europe'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    expect($conditions)->toContain([
        'column' => 'location_continent',
        'type' => '(.)',
        'value' => 'Europe',
    ]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="region|location_country|location_continent|and-op"`
Expected: FAIL — operators are still `[.]` and `=`.

- [ ] **Step 3: Implement**

In `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`:

1. In `applyLocationConditions()`, change:

```php
        if ($filter = $this->textFilter('region', $regions, '[.]')) {
```

to:

```php
        // Fuzzy (.) — region phrasings vary ("Guernsey", "St. Peter Port,
        // Guernsey"); note crustdata.md persondb docs prefer [.] for bare US
        // state names, our region values are city/area strings from geocoders.
        if ($filter = $this->textFilter('region', $regions, '(.)')) {
```

2. In `applyCountryConditions()`, change:

```php
        if ($filter = $this->textFilter('location_country', $countries, '=')) {
```

to:

```php
        if ($filter = $this->textFilter('location_country', $countries, '(.)')) {
```

3. In `applyContinentConditions()`, change:

```php
        if ($filter = $this->textFilter('location_continent', $continents, '=')) {
```

to:

```php
        if ($filter = $this->textFilter('location_continent', $continents, '(.)')) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): loosen region/country/continent operators to fuzzy match"
```

---

### Task 8: Raise the sync max_total default to 500

`max_total` is **already** env-configurable (`CRUSTDATA_MAX_TOTAL`, config/suite.php:22, default 200; the queued backfill separately uses `background_max_total` = 1000). The remaining work from the spec is raising the sync default from 200 to 500 (with page limit 100 that means up to 5 pages instead of 2).

**Files:**
- Modify: `/Users/eth0/Herd/360ai/config/suite.php:22`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('defaults crustdata max_total to 500', function () {
    expect((int) config('suite.talent_lookup.crustdata.max_total'))->toBe(500);
});

it('paginates up to five pages under the default max_total', function () {
    config()->set('suite.talent_lookup.crustdata.limit', 100);

    $page = fn (int $offset) => array_map(fn ($i) => [
        'person_id' => $offset + $i,
        'linkedin_profile_url' => 'https://www.linkedin.com/in/p'.($offset + $i),
        'name' => 'P'.($offset + $i),
    ], range(1, 100));

    Http::fakeSequence('api.crustdata.com/screener/persondb/search')
        ->push(['profiles' => $page(0), 'total_count' => 900, 'next_cursor' => 'c2'], 200)
        ->push(['profiles' => $page(100), 'total_count' => 900, 'next_cursor' => 'c3'], 200)
        ->push(['profiles' => $page(200), 'total_count' => 900, 'next_cursor' => 'c4'], 200)
        ->push(['profiles' => $page(300), 'total_count' => 900, 'next_cursor' => 'c5'], 200)
        ->push(['profiles' => $page(400), 'total_count' => 900, 'next_cursor' => 'c6'], 200);

    $talents = CrustdataLookup::make(SearchTerm::fromArray(['job_title' => 'Engineer']))->search();

    expect($talents)->toHaveCount(500);
    Http::assertSentCount(5);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="max_total"`
Expected: FAIL — config default is 200, only 2 pages fetched.

- [ ] **Step 3: Implement**

In `/Users/eth0/Herd/360ai/config/suite.php`, change line 22:

```php
            'max_total' => env('CRUSTDATA_MAX_TOTAL', 200),
```

to:

```php
            'max_total' => env('CRUSTDATA_MAX_TOTAL', 500),
```

Also update the fallback in `CrustdataLookup::search()` (`/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php:39`) so the two defaults agree:

```php
            maxTotal: (int) config('suite.talent_lookup.crustdata.max_total', 500),
```

Check `.env.example` for a `CRUSTDATA_MAX_TOTAL` entry (`grep CRUSTDATA_MAX_TOTAL /Users/eth0/Herd/360ai/.env.example`); if present, update its value to 500 too.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file — pre-existing pagination tests set `max_total` explicitly, so they are unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add config/suite.php app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git add .env.example 2>/dev/null || true
git commit -m "feat(crustdata): raise sync search max_total default to 500"
```

---

### Task 9: Map education_levels and industry_groups

`education_levels` (canonical values: doctorate, masters, bachelors, certificate, school) expand to degree-name terms on `education_background.degree_name (.)`. `industry_groups` (array of `{value: <Industry id>, timeframe, restrict}` per `SearchTerm::fillFiltersFromChatGpt`, or bare ids) resolve via `App\Enums\Company\Industry::id()`/`title()` and merge into the existing industry OR-group. Example pair used in tests: id `4` = `Computer Software`.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('expands education_levels into degree_name fuzzy terms', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'education_levels' => ['masters'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $degreeGroup = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && collect($c['conditions'] ?? [])->contains('column', 'education_background.degree_name'));

    expect($degreeGroup)->not->toBeNull();
    $values = collect($degreeGroup['conditions'])->pluck('value');
    expect($values)->toContain('master', 'mba', 'msc');
    expect(collect($degreeGroup['conditions'])->every(fn ($c) => $c['type'] === '(.)'))->toBeTrue();
});

it('maps industry_groups ids into the current_employers.industry group', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'industry_groups' => [
            ['value' => 4, 'timeframe' => 'both', 'restrict' => false],
        ],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    expect($conditions)->toContain([
        'column' => 'current_employers.industry',
        'type' => '(.)',
        'value' => 'Computer Software',
    ]);
});

it('combines industry_groups with industries into one OR group', function () {
    $searchTerm = SearchTerm::fromArray([
        'job_title' => 'Engineer',
        'industries' => ['financial services'],
        'industry_groups' => [
            ['value' => 4, 'timeframe' => 'both', 'restrict' => false],
        ],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    $industryGroup = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && collect($c['conditions'] ?? [])->every(fn ($inner) => ($inner['column'] ?? null) === 'current_employers.industry'));

    expect($industryGroup)->not->toBeNull();
    expect(collect($industryGroup['conditions'])->pluck('value'))->toContain('financial services', 'Computer Software');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="education_levels|industry_groups"`
Expected: FAIL — no degree_name group from education_levels; no `Computer Software` condition.

- [ ] **Step 3: Implement**

In `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`:

1. Add a class constant below the `$excludedKeywordsAll` property:

```php
    /** @var array<string, array<int, string>> */
    private const EDUCATION_LEVEL_DEGREE_TERMS = [
        'doctorate' => ['phd', 'doctorate'],
        'masters' => ['master', 'mba', 'msc'],
        'bachelors' => ['bachelor', 'bsc', 'beng'],
        'certificate' => ['certificate', 'diploma'],
        'school' => ['high school'],
    ];
```

2. **Replace** `applyEducationConditions()` with:

```php
    /**
     * @param  array<int, array<string, mixed>>  $conditions
     */
    private function applyEducationConditions(array &$conditions): void
    {
        if ($filter = $this->textFilter('education_background.degree_name', $this->searchTerms->degrees ?? [], '(.)')) {
            $conditions[] = $filter;
        }
        if ($filter = $this->textFilter('education_background.field_of_study', $this->searchTerms->majors ?? [], '(.)')) {
            $conditions[] = $filter;
        }

        $degreeTerms = collect($this->searchTerms->education_levels ?? [])
            ->filter()
            ->map(fn (string $level) => self::EDUCATION_LEVEL_DEGREE_TERMS[mb_strtolower($level)] ?? [])
            ->flatten()
            ->unique()
            ->values()
            ->all();

        if ($filter = $this->textFilter('education_background.degree_name', $degreeTerms, '(.)')) {
            $conditions[] = $filter;
        }
    }
```

3. In `applyIndustryConditions()`, **replace** the `$industries` pipeline:

```php
        $industries = collect()
            ->merge(collect($this->searchTerms->company_industries ?? []))
            ->merge(collect($this->searchTerms->industries ?? []))
            ->map(fn ($v) => $v instanceof CompanyIndustry ? $v->value : (string) $v)
            ->filter()
            ->unique()
            ->values()
            ->all();
```

with:

```php
        $industryGroupTitles = collect($this->searchTerms->industry_groups ?? [])
            ->map(fn ($group) => is_array($group) ? ($group['value'] ?? null) : $group)
            ->filter(fn ($id) => is_numeric($id))
            ->map(fn ($id) => self::industryTitleForId((int) $id))
            ->filter();

        $industries = collect()
            ->merge(collect($this->searchTerms->company_industries ?? []))
            ->merge(collect($this->searchTerms->industries ?? []))
            ->map(fn ($v) => $v instanceof CompanyIndustry ? $v->value : (string) $v)
            ->merge($industryGroupTitles)
            ->filter()
            ->unique()
            ->values()
            ->all();
```

4. Add the resolver method after `applyIndustryConditions()`:

```php
    private static function industryTitleForId(int $id): ?string
    {
        static $titlesById = null;

        if ($titlesById === null) {
            $titlesById = [];
            foreach (CompanyIndustry::cases() as $industry) {
                $industryId = $industry->id();
                if ($industryId !== null) {
                    $titlesById[$industryId] = $industry->title();
                }
            }
        }

        return $titlesById[$id] ?? null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): map education_levels and industry_groups filters"
```

---

### Task 10: must_have_skills hard-AND + document unsupported fields

`mergeSenioritySkillsIntoOr()` deliberately softens skills into an OR with seniority. When `must_have_skills` is set, skills must stay a hard AND — skip the merge. `must_have_industry` is already satisfied (industry conditions are always ANDed). `must_have_phone`, `interests`, `networks`, `excluded_networks` have **no persondb filter equivalent** (Crustdata phones exist only on the credit-gated enrich endpoint via `personal_contact_info.phone_numbers`) — document them as unsupported in the `buildFilters()` docblock.

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`

- [ ] **Step 1: Write the failing test**

Append to `/Users/eth0/Herd/360ai/tests/Feature/TalentLookup/CrustdataLookupTest.php`:

```php
it('keeps skills as a hard AND condition when must_have_skills is set', function () {
    $searchTerm = SearchTerm::fromArray([
        'levels' => ['senior'],
        'required_skills' => ['python', 'django'],
        'must_have_skills' => true,
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    expect($conditions->firstWhere('column', 'current_employers.seniority_level'))->not->toBeNull();

    $skillsGroup = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && ($c['conditions'][0]['column'] ?? null) === 'skills');
    expect($skillsGroup)->not->toBeNull();
});

it('still softens seniority and skills into an OR without must_have_skills', function () {
    $searchTerm = SearchTerm::fromArray([
        'levels' => ['senior'],
        'required_skills' => ['python', 'django'],
    ]);

    $filters = CrustdataLookup::make($searchTerm)->buildFilters();
    $conditions = collect(crustdataExtractConditions($filters));

    expect($conditions->firstWhere('column', 'current_employers.seniority_level'))->toBeNull();

    $merged = $conditions->first(fn ($c) => ($c['op'] ?? null) === 'or'
        && collect($c['conditions'] ?? [])->contains(fn ($inner) => ($inner['column'] ?? null) === 'current_employers.seniority_level'));
    expect($merged)->not->toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php --filter="must_have_skills|softens"`
Expected: FAIL — the first test finds no top-level seniority condition (it was merged into the OR despite `must_have_skills`).

- [ ] **Step 3: Implement**

In `/Users/eth0/Herd/360ai/app/TalentLookup/Crustdata/CrustdataLookup.php`:

1. In `mergeSenioritySkillsIntoOr()`, add at the very top of the method body:

```php
        if ($this->searchTerms->must_have_skills ?? false) {
            return;
        }
```

2. **Replace** the `buildFilters()` docblock with:

```php
    /**
     * Build Crustdata persondb search filter object from SearchTerm.
     *
     * Returns:
     *   - [] when no filters apply
     *   - a single filter (column/type/value) when exactly one condition
     *   - { op: 'and', conditions: [...] } when multiple
     *
     * SearchTerm fields with no persondb equivalent (intentionally unmapped):
     *   - must_have_phone — phones exist only on the credit-gated enrich
     *     endpoint (personal_contact_info.phone_numbers); persondb has no
     *     phone-presence filter.
     *   - must_have_industry — industry conditions are already hard ANDs,
     *     so the flag is inherently satisfied whenever industries are set.
     *   - interests, networks, excluded_networks — no persondb columns.
     *   - keyword_exclude_all / keyword_exclude_any and boolean NOT terms —
     *     Crustdata has no negative-contains operator; applied client-side
     *     in search() via rejectExcludedKeywords().
     *
     * @return array<string, mixed>
     */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/TalentLookup/Crustdata/CrustdataLookup.php tests/Feature/TalentLookup/CrustdataLookupTest.php
git commit -m "feat(crustdata): honor must_have_skills and document unsupported filters"
```

---

### Task 11: Map phone_numbers in CrustdataPersonMapper

`CrustdataPersonMapper::toTalentData()` hardcodes `'phone_numbers' => []` (Mapper:103). persondb search profiles carry no phone fields, but enrich-shaped payloads routed through this mapper can carry `personal_contact_info.phone_numbers`. Map them when present (`TalentData::$phone_numbers` is a plain string array).

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Services/Crustdata/Mappers/CrustdataPersonMapper.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php` (new)

- [ ] **Step 1: Write the failing tests**

Create `/Users/eth0/Herd/360ai/tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php`:

```php
<?php

use App\Services\Crustdata\Mappers\CrustdataPersonMapper;

it('maps phone numbers from personal_contact_info when present', function () {
    $talent = CrustdataPersonMapper::toTalentData([
        'person_id' => 1,
        'name' => 'Jane Smith',
        'personal_contact_info' => [
            'phone_numbers' => ['+44 7700 900123', ['number' => '+1 555 0100']],
        ],
    ]);

    expect($talent->phone_numbers)->toBe(['+44 7700 900123', '+1 555 0100']);
});

it('maps phone numbers from a top-level phone_numbers key', function () {
    $talent = CrustdataPersonMapper::toTalentData([
        'person_id' => 1,
        'name' => 'Jane Smith',
        'phone_numbers' => ['+44 7700 900123'],
    ]);

    expect($talent->phone_numbers)->toBe(['+44 7700 900123']);
});

it('defaults phone numbers to an empty list when absent', function () {
    $talent = CrustdataPersonMapper::toTalentData([
        'person_id' => 1,
        'name' => 'Jane Smith',
    ]);

    expect($talent->phone_numbers)->toBe([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php`
Expected: FAIL — first two tests get `[]`.

- [ ] **Step 3: Implement**

In `/Users/eth0/Herd/360ai/app/Services/Crustdata/Mappers/CrustdataPersonMapper.php`:

1. Change line 103:

```php
            'phone_numbers' => [],
```

to:

```php
            'phone_numbers' => self::mapPhoneNumbers($profile),
```

2. Add the method after `mapEmails()`:

```php
    /**
     * persondb search profiles carry no phone data; enrich payloads routed
     * through this mapper expose personal_contact_info.phone_numbers.
     *
     * @param  array<string, mixed>  $profile
     * @return array<int, string>
     */
    private static function mapPhoneNumbers(array $profile): array
    {
        $raw = $profile['personal_contact_info']['phone_numbers']
            ?? $profile['phone_numbers']
            ?? [];

        if (! is_array($raw)) {
            $raw = [$raw];
        }

        return collect($raw)
            ->map(function ($row) {
                if (is_array($row)) {
                    $row = $row['number'] ?? $row['phone_number'] ?? null;
                }

                return is_string($row) ? self::normalizeString($row) : null;
            })
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php tests/Feature/TalentLookup/CrustdataLookupTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Services/Crustdata/Mappers/CrustdataPersonMapper.php tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php
git commit -m "fix(crustdata): map phone numbers from enrich payloads in person mapper"
```

---

### Task 12: Fix the open_to_work field/value mismatch in the mapper

The search filter targets `linkedin_open_to_cards` with value `'opento-work'` (CrustdataLookup.php:588–592, matching crustdata.md's enrich field naming), while the mapper reads only `open_to_cards` and only matches `'CAREER_INTEREST'` (Mapper:104–124). Make the mapper accept both key spellings and both token families so open-to-work profiles are recognised regardless of which shape Crustdata returns. The filter side stays as-is (`linkedin_open_to_cards` is the documented field name).

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Services/Crustdata/Mappers/CrustdataPersonMapper.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `/Users/eth0/Herd/360ai/tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php`:

```php
it('maps open to work from linkedin_open_to_cards with opento-work tokens', function () {
    $talent = CrustdataPersonMapper::toTalentData([
        'person_id' => 1,
        'name' => 'Jane Smith',
        'linkedin_open_to_cards' => ['opento-work'],
        'last_updated' => '2026-06-01T00:00:00Z',
    ]);

    expect($talent->open_to_work)->not->toBeNull()
        ->and($talent->open_to_work->looking)->toBeTrue()
        ->and($talent->open_to_work->updated_at)->toBe('2026-06-01');
});

it('still maps open to work from open_to_cards CAREER_INTEREST', function () {
    $talent = CrustdataPersonMapper::toTalentData([
        'person_id' => 1,
        'name' => 'Jane Smith',
        'open_to_cards' => ['CAREER_INTEREST'],
    ]);

    expect($talent->open_to_work)->not->toBeNull()
        ->and($talent->open_to_work->looking)->toBeTrue();
});

it('returns null open_to_work when no card indicates job seeking', function () {
    $talent = CrustdataPersonMapper::toTalentData([
        'person_id' => 1,
        'name' => 'Jane Smith',
        'linkedin_open_to_cards' => ['opento-hiring'],
    ]);

    expect($talent->open_to_work)->toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php`
Expected: FAIL — first test gets `null` open_to_work (mapper never reads `linkedin_open_to_cards`).

- [ ] **Step 3: Implement**

In `/Users/eth0/Herd/360ai/app/Services/Crustdata/Mappers/CrustdataPersonMapper.php`:

1. Change the `toTalentData()` call site:

```php
            'open_to_work' => self::mapOpenToWork(
                $profile['open_to_cards'] ?? [],
                $profile['last_updated'] ?? null,
            ),
```

to:

```php
            'open_to_work' => self::mapOpenToWork(
                $profile['open_to_cards'] ?? $profile['linkedin_open_to_cards'] ?? [],
                $profile['last_updated'] ?? null,
            ),
```

2. In `mapOpenToWork()`, **replace**:

```php
        if (! in_array('CAREER_INTEREST', $openToCards, true)) {
            return null;
        }
```

with:

```php
        $looking = collect($openToCards)
            ->filter(fn ($card) => is_string($card))
            ->map(fn (string $card) => preg_replace('/[^a-z]/', '', mb_strtolower($card)) ?? '')
            ->contains(fn (string $card) => $card === 'careerinterest' || str_starts_with($card, 'opentowork'));

        if (! $looking) {
            return null;
        }
```

3. Update the method's param annotation from `@param  array<int, string>  $openToCards` to `@param  array<int, mixed>  $openToCards`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/eth0/Herd/360ai && php artisan test tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php tests/Feature/TalentLookup/CrustdataLookupTest.php tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php`
Expected: PASS — full regression across everything this plan touched.

- [ ] **Step 5: Format check and final commit**

```bash
cd /Users/eth0/Herd/360ai
vendor/bin/pint --dirty
git add app/Services/Crustdata/Mappers/CrustdataPersonMapper.php tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php
git status --porcelain   # if pint reformatted files already committed in this plan, add those too
git commit -m "fix(crustdata): recognise open-to-work across both card field shapes"
```

If `vendor/bin/pint` does not exist, skip that line (do not install anything).

---

## Verification after all tasks

```bash
cd /Users/eth0/Herd/360ai
php artisan test tests/Feature/TalentLookup/CrustdataLookupTest.php tests/Unit/TalentLookup/BooleanQueryTranslatorTest.php tests/Feature/Services/Crustdata/CrustdataPersonMapperTest.php
git log --oneline feature/360ai-chat-auth..feat/crustdata-mapping-fidelity   # expect 12 commits
```

Do not merge; hand back to the orchestrator (sub-project 2 builds on this branch's mapping fidelity).
