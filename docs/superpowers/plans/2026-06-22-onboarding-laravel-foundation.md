# Onboarding Laravel Foundation — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable onboarding-profile storage, OIDC claims, and two MCP tools (`get_onboarding`, `save_onboarding_profile`) to the parent 360AI Laravel app so chat.360ai can read and write per-user and per-company onboarding profiles.

**Architecture:** Company profile lives as a JSON column on `clients` (gated by the existing `onboarding_completed` flag); personal profile lives in a new `client_user_onboarding` table keyed by `(user_id, client_id)`, which also caches per-user tailored prompt strings. A single `OnboardingProfile` service owns all reads/writes and owner-authorization; both MCP tools and the OIDC claim assembler call into it. This plan is the source-of-truth layer that Plans 2 (chat integration) and 3 (chat UI) consume.

**Tech Stack:** Laravel 11, PHP 8.x (`declare(strict_types=1)`), `laravel/mcp` (`Laravel\Mcp\Server\Tool`), Pest 2 for tests, MySQL/MariaDB.

**Repo for this plan:** `/Users/eth0/Herd/360ai` (GitHub `360WORK/hire-suite`). NOT the chat fork.

## Global Constraints

- All new PHP files start with `<?php` then `declare(strict_types=1);`.
- Migrations use the anonymous-class style: `return new class extends Migration { ... };` (no namespace).
- MCP tools extend `Laravel\Mcp\Server\Tool`, declare `protected string $name`/`$description`, implement `handle(Request $request): Response` and `schema(JsonSchema $schema): array`, and are registered in `app/Mcp/Servers/RecruitingServer.php`'s `$tools` array.
- Read-only tools are annotated `#[IsReadOnly]` and `#[IsIdempotent]` (see `app/Mcp/Tools/WhoAmI.php`).
- Tools obtain the user + workspace via `AgentContext::fromRequest($request)` and catch `App\Mcp\Exceptions\ResourceForbiddenException` → `Response::error(...)`.
- Authorization: the **company** profile may only be written by the workspace owner (`$user->ownsClient($client)`); personal profile is writable by any authenticated member.
- The MCP `JsonSchema` builder is only used with `->string()`, `->description()`, `->required()` in this plan. Structured payloads are passed as JSON **strings** (`profile_json`, `tailored_prompts_json`) and decoded server-side — do NOT invent a nested-object schema API.
- Profile fields are filtered to fixed allow-lists in the service so the Plan 3 Settings editor has stable keys:
  - Company: `industry, recruits_for, target_roles, seniority, markets, hiring_volume, tooling, candidate_icp, employer_value_prop`
  - Personal: `desk, role, seniority_focus, geographies, workflow, copilot_goals`
- After editing OIDC claims/clients run `php artisan optimize:clear` (note in the relevant task; not a test step).
- Test command (Pest 2): `./vendor/bin/pest --filter='<name>'` run from `/Users/eth0/Herd/360ai`.

---

### Task 1: Storage — migration, `ClientUserOnboarding` model, `Client` cast

**Files:**
- Create: `/Users/eth0/Herd/360ai/database/migrations/2026_06_22_000001_create_onboarding_profile_storage.php`
- Create: `/Users/eth0/Herd/360ai/app/Models/ClientUserOnboarding.php`
- Modify: `/Users/eth0/Herd/360ai/app/Models/Client.php` (add `onboarding_profile` to `$casts`)
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Onboarding/OnboardingStorageTest.php`

**Interfaces:**
- Produces: `clients.onboarding_profile` (nullable JSON, cast `array`); table `client_user_onboarding` with columns `id, user_id, client_id, profile (json nullable), tailored_prompts (json nullable), completed_at (timestamp nullable), timestamps`, unique `(user_id, client_id)`; model `App\Models\ClientUserOnboarding` with `$fillable = ['user_id','client_id','profile','tailored_prompts','completed_at']` and casts `profile=>array, tailored_prompts=>array, completed_at=>datetime`, plus `client()` and `user()` BelongsTo relations.

- [ ] **Step 1: Write the failing test**

Create `/Users/eth0/Herd/360ai/tests/Feature/Onboarding/OnboardingStorageTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\Client;
use App\Models\ClientUserOnboarding;
use App\Models\User;

test('client stores onboarding_profile as an array', function () {
    $client = Client::factory()->create();

    $client->forceFill(['onboarding_profile' => ['industry' => 'SaaS']])->save();

    expect($client->fresh()->onboarding_profile)->toBe(['industry' => 'SaaS']);
});

test('client_user_onboarding persists profile, prompts and completion', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create();

    $row = ClientUserOnboarding::create([
        'user_id' => $user->id,
        'client_id' => $client->id,
        'profile' => ['desk' => 'AI startups'],
        'tailored_prompts' => ['Source ML engineers in Berlin'],
        'completed_at' => now(),
    ]);

    $fresh = $row->fresh();
    expect($fresh->profile)->toBe(['desk' => 'AI startups']);
    expect($fresh->tailored_prompts)->toBe(['Source ML engineers in Berlin']);
    expect($fresh->completed_at)->not->toBeNull();
    expect($fresh->client->id)->toBe($client->id);
    expect($fresh->user->id)->toBe($user->id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest --filter='onboarding'`
Expected: FAIL — `Class "App\Models\ClientUserOnboarding" not found` / unknown column `onboarding_profile`.

- [ ] **Step 3: Write the migration**

Create `/Users/eth0/Herd/360ai/database/migrations/2026_06_22_000001_create_onboarding_profile_storage.php`:

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->json('onboarding_profile')->nullable()->after('metadata');
        });

        Schema::create('client_user_onboarding', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->json('profile')->nullable();
            $table->json('tailored_prompts')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'client_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_user_onboarding');

        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('onboarding_profile');
        });
    }
};
```

- [ ] **Step 4: Create the model**

Create `/Users/eth0/Herd/360ai/app/Models/ClientUserOnboarding.php`:

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientUserOnboarding extends Model
{
    protected $table = 'client_user_onboarding';

    protected $fillable = [
        'user_id',
        'client_id',
        'profile',
        'tailored_prompts',
        'completed_at',
    ];

    protected $casts = [
        'profile' => 'array',
        'tailored_prompts' => 'array',
        'completed_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 5: Add the `Client` cast**

In `/Users/eth0/Herd/360ai/app/Models/Client.php`, in the `$casts` array (near `'metadata' => 'array',`), add:

```php
        'onboarding_profile' => 'array',
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `./vendor/bin/pest --filter='onboarding'`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_06_22_000001_create_onboarding_profile_storage.php app/Models/ClientUserOnboarding.php app/Models/Client.php tests/Feature/Onboarding/OnboardingStorageTest.php
git commit -m "feat(onboarding): add onboarding profile storage (clients column + client_user_onboarding)"
```

---

### Task 2: `OnboardingProfile` service

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/Services/Agent/OnboardingProfile.php`
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Onboarding/OnboardingProfileServiceTest.php`

**Interfaces:**
- Consumes: `App\Models\Client`, `App\Models\User` (`ownsClient`), `App\Models\ClientUserOnboarding`, `App\Mcp\Exceptions\ResourceForbiddenException`.
- Produces class `App\Services\Agent\OnboardingProfile` with public methods:
  - `getFor(User $user, Client $client): array` → `['is_owner'=>bool, 'client'=>['id'=>int,'name'=>string], 'company'=>['completed'=>bool,'profile'=>?array], 'personal'=>['completed'=>bool,'profile'=>?array], 'tailored_prompts'=>array]`
  - `saveCompany(User $user, Client $client, array $profile): void` (throws `ResourceForbiddenException` if not owner)
  - `savePersonal(User $user, Client $client, array $profile): void`
  - `cacheTailoredPrompts(User $user, Client $client, array $prompts): void`
  - public consts `COMPANY_FIELDS` and `PERSONAL_FIELDS` (string arrays per Global Constraints).

- [ ] **Step 1: Write the failing test**

Create `/Users/eth0/Herd/360ai/tests/Feature/Onboarding/OnboardingProfileServiceTest.php`:

```php
<?php

declare(strict_types=1);

use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Models\Client;
use App\Models\User;
use App\Services\Agent\OnboardingProfile;

beforeEach(function () {
    $this->service = new OnboardingProfile();
});

test('getFor returns empty scaffold for a fresh owner', function () {
    $owner = User::factory()->create();
    $client = Client::factory()->create(['user_id' => $owner->id, 'name' => 'Acme']);
    $owner->forceFill(['current_client_id' => $client->id])->save();

    $result = $this->service->getFor($owner, $client);

    expect($result['is_owner'])->toBeTrue();
    expect($result['client']['name'])->toBe('Acme');
    expect($result['company']['completed'])->toBeFalse();
    expect($result['company']['profile'])->toBeNull();
    expect($result['personal']['completed'])->toBeFalse();
    expect($result['tailored_prompts'])->toBe([]);
});

test('saveCompany stores filtered fields and flips completion for owner', function () {
    $owner = User::factory()->create();
    $client = Client::factory()->create(['user_id' => $owner->id]);

    $this->service->saveCompany($owner, $client, [
        'industry' => 'SaaS',
        'recruits_for' => ['Engineering'],
        'not_a_field' => 'dropped',
    ]);

    $result = $this->service->getFor($owner, $client);
    expect($result['company']['completed'])->toBeTrue();
    expect($result['company']['profile'])->toBe([
        'industry' => 'SaaS',
        'recruits_for' => ['Engineering'],
    ]);
});

test('saveCompany forbids a non-owner member', function () {
    $owner = User::factory()->create();
    $member = User::factory()->create();
    $client = Client::factory()->create(['user_id' => $owner->id]);

    $this->service->saveCompany($member, $client, ['industry' => 'SaaS']);
})->throws(ResourceForbiddenException::class);

test('savePersonal upserts the per-user row and getFor reflects it', function () {
    $member = User::factory()->create();
    $client = Client::factory()->create();

    $this->service->savePersonal($member, $client, [
        'desk' => 'AI startups',
        'geographies' => ['Berlin'],
        'junk' => 'dropped',
    ]);

    $result = $this->service->getFor($member, $client);
    expect($result['personal']['completed'])->toBeTrue();
    expect($result['personal']['profile'])->toBe([
        'desk' => 'AI startups',
        'geographies' => ['Berlin'],
    ]);
});

test('cacheTailoredPrompts stores prompts on the per-user row', function () {
    $member = User::factory()->create();
    $client = Client::factory()->create();

    $this->service->cacheTailoredPrompts($member, $client, ['Source ML engineers', 'List Series A raises']);

    $result = $this->service->getFor($member, $client);
    expect($result['tailored_prompts'])->toBe(['Source ML engineers', 'List Series A raises']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest --filter='OnboardingProfileService'`
Expected: FAIL — `Class "App\Services\Agent\OnboardingProfile" not found`.

- [ ] **Step 3: Write the service**

Create `/Users/eth0/Herd/360ai/app/Services/Agent/OnboardingProfile.php`:

```php
<?php

declare(strict_types=1);

namespace App\Services\Agent;

use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Models\Client;
use App\Models\ClientUserOnboarding;
use App\Models\User;

class OnboardingProfile
{
    /** @var array<int, string> */
    public const COMPANY_FIELDS = [
        'industry', 'recruits_for', 'target_roles', 'seniority', 'markets',
        'hiring_volume', 'tooling', 'candidate_icp', 'employer_value_prop',
    ];

    /** @var array<int, string> */
    public const PERSONAL_FIELDS = [
        'desk', 'role', 'seniority_focus', 'geographies', 'workflow', 'copilot_goals',
    ];

    /**
     * @return array<string, mixed>
     */
    public function getFor(User $user, Client $client): array
    {
        $personal = $this->personalRow($user, $client);

        return [
            'is_owner' => $user->ownsClient($client),
            'client' => ['id' => $client->id, 'name' => $client->name],
            'company' => [
                'completed' => (bool) $client->onboarding_completed,
                'profile' => $client->onboarding_profile,
            ],
            'personal' => [
                'completed' => $personal?->completed_at !== null,
                'profile' => $personal?->profile,
            ],
            'tailored_prompts' => $personal?->tailored_prompts ?? [],
        ];
    }

    /**
     * @param  array<string, mixed>  $profile
     */
    public function saveCompany(User $user, Client $client, array $profile): void
    {
        if (! $user->ownsClient($client)) {
            throw new ResourceForbiddenException('Only the workspace owner can edit the company profile.');
        }

        $client->forceFill([
            'onboarding_profile' => $this->filter($profile, self::COMPANY_FIELDS),
            'onboarding_completed' => true,
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $profile
     */
    public function savePersonal(User $user, Client $client, array $profile): void
    {
        ClientUserOnboarding::updateOrCreate(
            ['user_id' => $user->id, 'client_id' => $client->id],
            ['profile' => $this->filter($profile, self::PERSONAL_FIELDS), 'completed_at' => now()],
        );
    }

    /**
     * @param  array<int, string>  $prompts
     */
    public function cacheTailoredPrompts(User $user, Client $client, array $prompts): void
    {
        ClientUserOnboarding::updateOrCreate(
            ['user_id' => $user->id, 'client_id' => $client->id],
            ['tailored_prompts' => array_values($prompts)],
        );
    }

    private function personalRow(User $user, Client $client): ?ClientUserOnboarding
    {
        return ClientUserOnboarding::query()
            ->where('user_id', $user->id)
            ->where('client_id', $client->id)
            ->first();
    }

    /**
     * @param  array<string, mixed>  $profile
     * @param  array<int, string>  $allowed
     * @return array<string, mixed>
     */
    private function filter(array $profile, array $allowed): array
    {
        return array_intersect_key($profile, array_flip($allowed));
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest --filter='OnboardingProfileService'`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Agent/OnboardingProfile.php tests/Feature/Onboarding/OnboardingProfileServiceTest.php
git commit -m "feat(onboarding): OnboardingProfile service (read/write company + personal, owner-gated)"
```

---

### Task 3: OIDC claims — role, client, onboarding status

**Files:**
- Modify: `/Users/eth0/Herd/360ai/app/Support/Oidc/OidcClaims.php` (`forUser` return array)
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Onboarding/OnboardingClaimsTest.php`

**Interfaces:**
- Consumes: `App\Services\Agent\OnboardingProfile::getFor`, `User::currentClient`, `User::ownsClient`.
- Produces: `OidcClaims::forUser($user)` additionally returns keys `is_owner` (bool), `role` (`'owner'|'member'`), `client_id` (?string), `client_name` (?string), `company_onboarded` (bool), `personal_onboarded` (bool). When the user has no current client, client keys are `null` and the booleans are `false`.

- [ ] **Step 1: Write the failing test**

Create `/Users/eth0/Herd/360ai/tests/Feature/Onboarding/OnboardingClaimsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Models\Client;
use App\Models\User;
use App\Support\Oidc\OidcClaims;

test('claims include role, client and onboarding status for an owner', function () {
    $owner = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);
    $client = Client::factory()->create([
        'user_id' => $owner->id,
        'name' => 'Acme',
        'onboarding_completed' => true,
    ]);
    $owner->forceFill(['current_client_id' => $client->id])->save();

    $claims = OidcClaims::forUser($owner->fresh());

    expect($claims['is_owner'])->toBeTrue();
    expect($claims['role'])->toBe('owner');
    expect($claims['client_id'])->toBe((string) $client->id);
    expect($claims['client_name'])->toBe('Acme');
    expect($claims['company_onboarded'])->toBeTrue();
    expect($claims['personal_onboarded'])->toBeFalse();
});

test('claims degrade gracefully when user has no current client', function () {
    $user = User::factory()->create(['current_client_id' => null]);

    $claims = OidcClaims::forUser($user);

    expect($claims['client_id'])->toBeNull();
    expect($claims['is_owner'])->toBeFalse();
    expect($claims['role'])->toBe('member');
    expect($claims['company_onboarded'])->toBeFalse();
    expect($claims['personal_onboarded'])->toBeFalse();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest --filter='OnboardingClaims'`
Expected: FAIL — undefined array key `is_owner`.

- [ ] **Step 3: Add the claims**

In `/Users/eth0/Herd/360ai/app/Support/Oidc/OidcClaims.php`, add the import at the top (with the other `use` statements):

```php
use App\Services\Agent\OnboardingProfile;
```

Then, inside `forUser(User $user)`, replace the single `return [ ... ];` with profile-aware assembly:

```php
        $client = $user->currentClient;
        $onboarding = $client
            ? (new OnboardingProfile())->getFor($user, $client)
            : null;

        return [
            'sub' => (string) $user->id,
            'email' => $user->email,
            'email_verified' => $user->email_verified_at !== null,
            'name' => $name,
            'preferred_username' => $user->email,
            'picture' => $user->profile_photo_url,
            'is_owner' => (bool) ($onboarding['is_owner'] ?? false),
            'role' => ($onboarding['is_owner'] ?? false) ? 'owner' : 'member',
            'client_id' => $client ? (string) $client->id : null,
            'client_name' => $client?->name,
            'company_onboarded' => (bool) ($onboarding['company']['completed'] ?? false),
            'personal_onboarded' => (bool) ($onboarding['personal']['completed'] ?? false),
        ];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest --filter='OnboardingClaims'`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add app/Support/Oidc/OidcClaims.php tests/Feature/Onboarding/OnboardingClaimsTest.php
git commit -m "feat(onboarding): expose role/client/onboarding-status OIDC claims"
```

Note: after deploying, run `php artisan optimize:clear` on the provider so cached config/discovery picks up the change (not part of tests).

---

### Task 4: `get_onboarding` MCP tool

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/Mcp/Tools/GetOnboarding.php`
- Modify: `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php` (add to `$tools`)
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetOnboardingToolTest.php`

**Interfaces:**
- Consumes: `AgentContext::fromRequest`, `OnboardingProfile::getFor`.
- Produces: MCP tool name `get_onboarding`, read-only, no input params. Returns `Response::json($service->getFor($context->user, $context->client))` — the exact shape from Task 2's `getFor`. This is the shape Plans 2/3 consume.

- [ ] **Step 1: Write the failing test**

Create `/Users/eth0/Herd/360ai/tests/Feature/Mcp/GetOnboardingToolTest.php`:

```php
<?php

declare(strict_types=1);

use App\Mcp\Tools\GetOnboarding;
use App\Models\Client;
use App\Models\User;
use App\Services\Agent\OnboardingProfile;
use Laravel\Mcp\Server;

class GetOnboardingTestServer extends Server
{
    protected string $name = 'get-onboarding-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [
        GetOnboarding::class,
    ];
}

test('get_onboarding returns the profile scaffold for the current workspace', function () {
    $owner = User::factory()->create();
    $client = Client::factory()->create(['user_id' => $owner->id, 'name' => 'Acme']);
    $owner->forceFill(['current_client_id' => $client->id])->save();

    (new OnboardingProfile())->savePersonal($owner, $client, ['desk' => 'AI startups']);

    $response = GetOnboardingTestServer::actingAs($owner->fresh())->tool(GetOnboarding::class);

    $response->assertOk();
    $response->assertSee('"is_owner": true');
    $response->assertSee('Acme');
    $response->assertSee('AI startups');
});

test('get_onboarding fails for unauthenticated request', function () {
    $response = GetOnboardingTestServer::tool(GetOnboarding::class);

    $response->assertHasErrors();
    $response->assertSee('authenticated');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest --filter='get_onboarding'`
Expected: FAIL — `Class "App\Mcp\Tools\GetOnboarding" not found`.

- [ ] **Step 3: Write the tool**

Create `/Users/eth0/Herd/360ai/app/Mcp/Tools/GetOnboarding.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\Agent\OnboardingProfile;
use Laravel\Mcp\Server\Attributes\IsIdempotent;
use Laravel\Mcp\Server\Attributes\IsReadOnly;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Request;
use Laravel\Mcp\Server\Tools\Response;
use Laravel\Mcp\Server\Tools\JsonSchema;

#[IsReadOnly]
#[IsIdempotent]
class GetOnboarding extends Tool
{
    protected string $name = 'get_onboarding';

    protected string $description = 'Returns the onboarding profile (company + personal), completion status, ownership, and cached tailored prompts for the authenticated user in their current workspace.';

    public function handle(Request $request): Response
    {
        try {
            $context = AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        return Response::json((new OnboardingProfile())->getFor($context->user, $context->client));
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
```

Note: confirm the `use` import lines for `Request`, `Response`, `JsonSchema`, and the attributes match those at the top of `app/Mcp/Tools/WhoAmI.php`; copy WhoAmI's exact namespaces if any differ.

- [ ] **Step 4: Register the tool**

In `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php`, add to the `protected array $tools = [ ... ];` list:

```php
        \App\Mcp\Tools\GetOnboarding::class,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./vendor/bin/pest --filter='get_onboarding'`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add app/Mcp/Tools/GetOnboarding.php app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/GetOnboardingToolTest.php
git commit -m "feat(onboarding): add get_onboarding MCP tool"
```

---

### Task 5: `save_onboarding_profile` MCP tool

**Files:**
- Create: `/Users/eth0/Herd/360ai/app/Mcp/Tools/SaveOnboardingProfile.php`
- Modify: `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php` (add to `$tools`)
- Test: `/Users/eth0/Herd/360ai/tests/Feature/Mcp/SaveOnboardingProfileToolTest.php`

**Interfaces:**
- Consumes: `AgentContext::fromRequest`, `OnboardingProfile::{saveCompany,savePersonal,cacheTailoredPrompts}`.
- Produces: MCP tool name `save_onboarding_profile`. Input schema (all strings): `scope` (required, `'company'|'personal'`), `profile_json` (required, JSON object string), `tailored_prompts_json` (optional, JSON array-of-strings string). Behavior: decode `profile_json` → assoc array (error on invalid JSON / non-object); `scope=company` → `saveCompany` (owner-gated, error surfaced), `scope=personal` → `savePersonal`; if `tailored_prompts_json` present and decodes to a list, `cacheTailoredPrompts`. Returns `Response::json(['status'=>'saved','scope'=>$scope,'completed'=>true])`.

- [ ] **Step 1: Write the failing test**

Create `/Users/eth0/Herd/360ai/tests/Feature/Mcp/SaveOnboardingProfileToolTest.php`:

```php
<?php

declare(strict_types=1);

use App\Mcp\Tools\SaveOnboardingProfile;
use App\Models\Client;
use App\Models\ClientUserOnboarding;
use App\Models\User;
use Laravel\Mcp\Server;

class SaveOnboardingProfileTestServer extends Server
{
    protected string $name = 'save-onboarding-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [
        SaveOnboardingProfile::class,
    ];
}

test('owner can save the company profile', function () {
    $owner = User::factory()->create();
    $client = Client::factory()->create(['user_id' => $owner->id, 'onboarding_completed' => false]);
    $owner->forceFill(['current_client_id' => $client->id])->save();

    $response = SaveOnboardingProfileTestServer::actingAs($owner->fresh())->tool(SaveOnboardingProfile::class, [
        'scope' => 'company',
        'profile_json' => json_encode(['industry' => 'SaaS', 'recruits_for' => ['Engineering']]),
    ]);

    $response->assertOk();
    $response->assertSee('"status": "saved"');
    expect($client->fresh()->onboarding_completed)->toBeTrue();
    expect($client->fresh()->onboarding_profile)->toBe(['industry' => 'SaaS', 'recruits_for' => ['Engineering']]);
});

test('non-owner member cannot save the company profile', function () {
    $owner = User::factory()->create();
    $member = User::factory()->create();
    $client = Client::factory()->create(['user_id' => $owner->id]);
    $member->forceFill(['current_client_id' => $client->id])->save();

    $response = SaveOnboardingProfileTestServer::actingAs($member->fresh())->tool(SaveOnboardingProfile::class, [
        'scope' => 'company',
        'profile_json' => json_encode(['industry' => 'SaaS']),
    ]);

    $response->assertHasErrors();
    $response->assertSee('owner');
});

test('member can save personal profile and tailored prompts', function () {
    $member = User::factory()->create();
    $client = Client::factory()->create();
    $member->forceFill(['current_client_id' => $client->id])->save();

    $response = SaveOnboardingProfileTestServer::actingAs($member->fresh())->tool(SaveOnboardingProfile::class, [
        'scope' => 'personal',
        'profile_json' => json_encode(['desk' => 'AI startups']),
        'tailored_prompts_json' => json_encode(['Source ML engineers', 'List Series A raises']),
    ]);

    $response->assertOk();
    $row = ClientUserOnboarding::where('user_id', $member->id)->where('client_id', $client->id)->first();
    expect($row->profile)->toBe(['desk' => 'AI startups']);
    expect($row->tailored_prompts)->toBe(['Source ML engineers', 'List Series A raises']);
});

test('invalid scope is rejected', function () {
    $user = User::factory()->create();
    $client = Client::factory()->create();
    $user->forceFill(['current_client_id' => $client->id])->save();

    $response = SaveOnboardingProfileTestServer::actingAs($user->fresh())->tool(SaveOnboardingProfile::class, [
        'scope' => 'bogus',
        'profile_json' => json_encode(['desk' => 'x']),
    ]);

    $response->assertHasErrors();
    $response->assertSee('scope');
});

test('invalid profile_json is rejected', function () {
    $user = User::factory()->create();
    $client = Client::factory()->create();
    $user->forceFill(['current_client_id' => $client->id])->save();

    $response = SaveOnboardingProfileTestServer::actingAs($user->fresh())->tool(SaveOnboardingProfile::class, [
        'scope' => 'personal',
        'profile_json' => 'not json',
    ]);

    $response->assertHasErrors();
    $response->assertSee('profile_json');
});

test('save_onboarding_profile fails for unauthenticated request', function () {
    $response = SaveOnboardingProfileTestServer::tool(SaveOnboardingProfile::class, [
        'scope' => 'personal',
        'profile_json' => json_encode(['desk' => 'x']),
    ]);

    $response->assertHasErrors();
    $response->assertSee('authenticated');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest --filter='save_onboarding_profile|company profile|personal profile|scope is rejected|profile_json is rejected'`
Expected: FAIL — `Class "App\Mcp\Tools\SaveOnboardingProfile" not found`.

- [ ] **Step 3: Write the tool**

Create `/Users/eth0/Herd/360ai/app/Mcp/Tools/SaveOnboardingProfile.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\Agent\OnboardingProfile;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Request;
use Laravel\Mcp\Server\Tools\Response;
use Laravel\Mcp\Server\Tools\JsonSchema;

class SaveOnboardingProfile extends Tool
{
    protected string $name = 'save_onboarding_profile';

    protected string $description = 'Persists the structured onboarding profile for the current workspace. Use scope="company" (owner only — comprehensive company profile shared workspace-wide) or scope="personal" (this user). profile_json is a JSON object of known fields; tailored_prompts_json is an optional JSON array of personalized starter-prompt strings.';

    public function handle(Request $request): Response
    {
        try {
            $context = AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $scope = (string) $request->get('scope');
        if (! in_array($scope, ['company', 'personal'], true)) {
            return Response::error('Invalid scope. Use "company" or "personal".');
        }

        $profile = json_decode((string) $request->get('profile_json'), true);
        if (! is_array($profile) || array_is_list($profile)) {
            return Response::error('Invalid profile_json. Provide a JSON object of profile fields.');
        }

        $service = new OnboardingProfile();

        try {
            if ($scope === 'company') {
                $service->saveCompany($context->user, $context->client, $profile);
            } else {
                $service->savePersonal($context->user, $context->client, $profile);
            }
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $promptsRaw = $request->get('tailored_prompts_json');
        if (is_string($promptsRaw) && $promptsRaw !== '') {
            $prompts = json_decode($promptsRaw, true);
            if (is_array($prompts) && array_is_list($prompts)) {
                $service->cacheTailoredPrompts($context->user, $context->client, $prompts);
            }
        }

        return Response::json(['status' => 'saved', 'scope' => $scope, 'completed' => true]);
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'scope' => $schema->string()
                ->description('Which profile to save: "company" (owner only) or "personal".')
                ->required(),
            'profile_json' => $schema->string()
                ->description('JSON object of profile fields. Company keys: industry, recruits_for, target_roles, seniority, markets, hiring_volume, tooling, candidate_icp, employer_value_prop. Personal keys: desk, role, seniority_focus, geographies, workflow, copilot_goals.')
                ->required(),
            'tailored_prompts_json' => $schema->string()
                ->description('Optional JSON array of 4-6 short, personalized starter-prompt strings derived from the profile.'),
        ];
    }
}
```

- [ ] **Step 4: Register the tool**

In `/Users/eth0/Herd/360ai/app/Mcp/Servers/RecruitingServer.php`, add to `$tools`:

```php
        \App\Mcp\Tools\SaveOnboardingProfile::class,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./vendor/bin/pest --filter='company profile|personal profile|scope is rejected|profile_json is rejected|save_onboarding_profile fails'`
Expected: PASS (6 passed).

- [ ] **Step 6: Run the full onboarding suite + commit**

Run: `./vendor/bin/pest tests/Feature/Onboarding tests/Feature/Mcp/GetOnboardingToolTest.php tests/Feature/Mcp/SaveOnboardingProfileToolTest.php`
Expected: PASS (all).

```bash
git add app/Mcp/Tools/SaveOnboardingProfile.php app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/SaveOnboardingProfileToolTest.php
git commit -m "feat(onboarding): add save_onboarding_profile MCP tool"
```

---

## Self-Review

**Spec coverage (Plan 1's slice of the spec):**
- Company profile storage on `clients` → Task 1 ✓
- Personal profile + tailored-prompt cache table → Task 1 ✓
- `OnboardingProfile` service (owner-gated company write, per-user personal write, tailored-prompt cache, read scaffold) → Task 2 ✓
- OIDC claims `is_owner`/`role`/`client_id`/`client_name`/`company_onboarded`/`personal_onboarded` → Task 3 ✓
- `get_onboarding` MCP tool (read shape consumed by Plans 2/3) → Task 4 ✓
- `save_onboarding_profile` MCP tool (write, scope + JSON payloads + owner enforcement) → Task 5 ✓
- (Deferred to Plan 2/3, intentionally: chat-side detection, conversational interview/system-prompt augmentation, Memories distiller, NumberedCardList, tailored landing cards, Workspace-profile Settings tab.)

**Placeholder scan:** No TBD/TODO; every code step contains complete code. The one verification note (Task 4 Step 3) is a "confirm imports match WhoAmI" instruction, not a missing implementation.

**Type/name consistency:** `getFor`/`saveCompany`/`savePersonal`/`cacheTailoredPrompts` and consts `COMPANY_FIELDS`/`PERSONAL_FIELDS` are named identically across Tasks 2–5; the `getFor` return shape used in Task 4's test matches Task 2's definition; claim keys in Task 3 match the booleans read from `getFor`.

## Downstream (next plans, not part of this one)
- **Plan 2 — Chat integration:** read claims/`get_onboarding` for soft-gate detection; augment the agent system prompt with the company/personal interview scripts; wire the agent to call `save_onboarding_profile`; distill the saved profile into LibreChat Memories.
- **Plan 3 — Chat UI:** reusable `NumberedCardList`; tailored starter cards on `Landing.tsx` (sourced from `get_onboarding.tailored_prompts`); "Workspace profile" Settings tab editing via `get_onboarding`/`save_onboarding_profile`.
