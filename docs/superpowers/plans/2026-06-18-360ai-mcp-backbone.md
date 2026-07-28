# 360AI MCP Backbone Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing 360AI recruiting capabilities the agent suite needs as MCP tools — activate the 6 written-but-dormant read tools, and add AI Headhunter's `enrich_contact` (read) and `send_outreach` (write, preview→confirm) tools.

**Architecture:** All work is in the Laravel app `hire-suite` (`/Users/eth0/Herd/360ai`). MCP tools subclass `Laravel\Mcp\Server\Tool` (`name`, `description`, `schema()`, `handle()`), are registered in `App\Mcp\Servers\RecruitingServer`, and resolve the caller via `App\Mcp\AgentContext::fromRequest()`. Read tools are annotated `#[IsReadOnly]`/`#[IsIdempotent]`; the write tool is neither and enforces a preview→confirm contract so no outbound side effect happens without an explicit second call carrying `confirm: true`.

**Tech Stack:** PHP 8.x, Laravel, `laravel/mcp`, Pest test framework. Vendor services: `App\Services\ContactOut\ContactOutService`, `App\Services\Unipile\UnipileService`.

## Global Constraints

- All new PHP files start with `<?php` then `declare(strict_types=1);`. (verbatim, matches every existing tool)
- MCP tool classes live in `app/Mcp/Tools/`, namespace `App\Mcp\Tools`.
- Every tool's `handle()` MUST guard with `AgentContext::fromRequest($request)` inside a `try/catch (ResourceForbiddenException $e)` returning `Response::error($e->getMessage())`. (matches every existing tool)
- Never use `any`-equivalent untyped arrays where a shape is known; type service returns as `array`.
- Tests are Pest, under `tests/Feature/Mcp/Tools/`, one file per tool.
- Run the full suite from the Laravel root: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest`.
- The write tool MUST NOT perform any send when `confirm` is absent or false.

---

## File Structure

**Create:**
- `app/Mcp/Tools/EnrichContact.php` — read tool wrapping ContactOut.
- `app/Mcp/Tools/SendOutreach.php` — write tool wrapping Unipile, preview→confirm.
- `tests/Feature/Mcp/Tools/EnrichContactTest.php`
- `tests/Feature/Mcp/Tools/SendOutreachTest.php`

**Modify:**
- `app/Mcp/Servers/RecruitingServer.php` — uncomment 6 read tools; register the 2 new tools; update the `#[Instructions]` block (it currently claims "All tools are read-only" — no longer true).

**Reference (read, do not change):**
- `app/Mcp/Tools/SearchCompanies.php` — the canonical tool pattern.
- `tests/Feature/Mcp/Tools/SearchCompaniesTest.php` — the canonical test pattern.
- `app/Services/ContactOut/Resources/PeopleResource.php` — `contactFromLinkedin()`.
- `app/Services/Unipile/Resources/MessageResource.php`, `EmailResource.php`.

---

## Task 1: Activate the 6 dormant read tools

**Files:**
- Modify: `app/Mcp/Servers/RecruitingServer.php`
- Test: `tests/Feature/Mcp/RecruitingServerTest.php` (exists — extend it)

**Interfaces:**
- Produces: a `RecruitingServer` whose `$tools` array includes `SearchCandidates`, `GetCandidate`, `GetJob`, `PipelineStages`, `StageCandidates`, `GetUsage` in addition to the current 5.

- [ ] **Step 1: Write the failing test**

Append to `tests/Feature/Mcp/RecruitingServerTest.php`:

```php
test('recruiting server registers the full read toolset', function () {
    $server = new App\Mcp\Servers\RecruitingServer();

    $tools = (new ReflectionClass($server))->getProperty('tools');
    $tools->setAccessible(true);
    $registered = $tools->getValue($server);

    expect($registered)->toContain(
        App\Mcp\Tools\SearchCandidates::class,
        App\Mcp\Tools\GetCandidate::class,
        App\Mcp\Tools\GetJob::class,
        App\Mcp\Tools\PipelineStages::class,
        App\Mcp\Tools\StageCandidates::class,
        App\Mcp\Tools\GetUsage::class,
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest --filter='full read toolset'`
Expected: FAIL — `Failed asserting that array contains App\Mcp\Tools\SearchCandidates`.

- [ ] **Step 3: Uncomment the 6 tools**

In `app/Mcp/Servers/RecruitingServer.php`, change the `$tools` array to:

```php
    protected array $tools = [
        WhoAmI::class,
        SearchTalents::class,
        SearchCompanies::class,
        SearchJobs::class,
        SearchCandidates::class,
        GetCandidate::class,
        ListJobs::class,
        GetJob::class,
        PipelineStages::class,
        StageCandidates::class,
        GetUsage::class,
    ];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest --filter='full read toolset'`
Expected: PASS.

- [ ] **Step 5: Run the existing MCP suite to confirm no regression**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp`
Expected: PASS (all existing tool tests green).

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/RecruitingServerTest.php
git commit -m "feat(mcp): activate dormant read tools (candidates, job, pipeline, usage)"
```

---

## Task 2: `enrich_contact` read tool

**Files:**
- Create: `app/Mcp/Tools/EnrichContact.php`
- Test: `tests/Feature/Mcp/Tools/EnrichContactTest.php`

**Interfaces:**
- Consumes: `App\Services\ContactOut\ContactOutService` (resolved from the container), `->people()->contactFromLinkedin(string $username, array $options = []): array`.
- Produces: tool `name = 'enrich_contact'`; input `{ linkedin_username: string (required) }`; output = JSON of the ContactOut people result.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Mcp/Tools/EnrichContactTest.php`:

```php
<?php

declare(strict_types=1);

use App\Mcp\Tools\EnrichContact;
use App\Models\Client;
use App\Models\User;
use App\Services\ContactOut\ContactOutService;
use App\Services\ContactOut\Resources\PeopleResource;
use Laravel\Mcp\Server;

class EnrichContactTestServer extends Server
{
    protected string $name = 'enrich-contact-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [
        EnrichContact::class,
    ];
}

test('enrich_contact returns verified contact details for a linkedin username', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    $people = Mockery::mock(PeopleResource::class);
    $people->shouldReceive('contactFromLinkedin')
        ->once()
        ->with('jane-doe')
        ->andReturn([
            'work_emails' => ['jane@acme.com'],
            'phones' => ['+15551234567'],
        ]);

    $this->mock(ContactOutService::class, function ($mock) use ($people) {
        $mock->shouldReceive('people')->once()->andReturn($people);
    });

    $response = $this->actingAs($user)
        ->postJson('/mcp/api', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => 'tools/call',
            'params' => ['name' => 'enrich_contact', 'arguments' => ['linkedin_username' => 'jane-doe']],
        ]);

    $response->assertOk();
    expect($response->json())->toContain('jane@acme.com');
})->skip('enable once /mcp/api test routing is confirmed; otherwise invoke the tool unit-style');
```

> Note: the existing `SearchCompaniesTest` invokes through the MCP server harness — mirror whichever invocation style that file uses (server-harness vs HTTP). Remove the `->skip(...)` and adapt the invocation to match `SearchCompaniesTest` before Step 2.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/EnrichContactTest.php`
Expected: FAIL — `Class "App\Mcp\Tools\EnrichContact" not found`.

- [ ] **Step 3: Write the tool**

Create `app/Mcp/Tools/EnrichContact.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\ContactOut\ContactOutService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
#[IsIdempotent]
class EnrichContact extends Tool
{
    protected string $name = 'enrich_contact';

    protected string $description = <<<'TXT'
Return verified contact details (work/personal emails, phone numbers,
social profiles) for a single person, given their LinkedIn username — the
slug from their LinkedIn URL, e.g. "jane-doe" for linkedin.com/in/jane-doe.
Use the LinkedIn URL returned by search_talents / get_candidate to derive
the slug. Consumes one enrichment credit per successful lookup.
TXT;

    public function handle(Request $request, ContactOutService $contactOut): Response
    {
        try {
            AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $username = trim((string) $request->get('linkedin_username'));

        if ($username === '') {
            return Response::error('linkedin_username is required (the slug from the candidate\'s LinkedIn URL).');
        }

        try {
            $contact = $contactOut->people()->contactFromLinkedin($username);
        } catch (\Throwable $e) {
            report($e);

            return Response::error('Contact enrichment failed for "'.$username.'". The profile may be unavailable.');
        }

        return Response::json($contact);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'linkedin_username' => $schema->string()
                ->description('LinkedIn slug, e.g. "jane-doe" from linkedin.com/in/jane-doe.')
                ->required(),
        ];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/EnrichContactTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Tools/EnrichContact.php tests/Feature/Mcp/Tools/EnrichContactTest.php
git commit -m "feat(mcp): add enrich_contact tool (ContactOut)"
```

---

## Task 3: `send_outreach` — preview mode (no side effect)

This task builds the tool and its **preview** behavior only. The actual send (`confirm: true`) is Task 4, so this task is independently shippable: the tool exists, validates input, and returns a preview without ever sending.

**Files:**
- Create: `app/Mcp/Tools/SendOutreach.php`
- Test: `tests/Feature/Mcp/Tools/SendOutreachTest.php`

**Interfaces:**
- Produces: tool `name = 'send_outreach'`; input `{ channel: 'email'|'linkedin'|'whatsapp', recipient: string, subject?: string, body: string, confirm?: bool }`. Without `confirm: true` returns `{ status: 'preview', channel, recipient, subject, body }` and performs no send.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Mcp/Tools/SendOutreachTest.php`:

```php
<?php

declare(strict_types=1);

use App\Mcp\Tools\SendOutreach;
use App\Models\Client;
use App\Models\User;
use App\Services\Unipile\UnipileService;
use Laravel\Mcp\Server;

class SendOutreachTestServer extends Server
{
    protected string $name = 'send-outreach-test';

    protected string $version = '1.0.0';

    /** @var array<int, class-string<\Laravel\Mcp\Server\Tool>> */
    protected array $tools = [
        SendOutreach::class,
    ];
}

test('send_outreach without confirm returns a preview and never calls Unipile', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);

    // If Unipile is touched, fail loudly.
    $this->mock(UnipileService::class, function ($mock) {
        $mock->shouldNotReceive('messages');
        $mock->shouldNotReceive('emails');
    });

    $result = (new SendOutreach())->handle(
        makeMcpRequest($user, [
            'channel' => 'email',
            'recipient' => 'jane@acme.com',
            'subject' => 'Opportunity',
            'body' => 'Hi Jane, are you open to a chat?',
        ]),
        app(UnipileService::class),
    );

    expect($result->content())->toContain('preview', 'jane@acme.com', 'Opportunity');
});
```

> `makeMcpRequest($user, $args)` is a helper that builds a `Laravel\Mcp\Request` with the authenticated user and arguments. If `SearchCompaniesTest` already invokes via the server harness instead of calling `handle()` directly, mirror that style and drop the helper. Add the helper to `tests/Pest.php` only if no equivalent exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/SendOutreachTest.php`
Expected: FAIL — `Class "App\Mcp\Tools\SendOutreach" not found`.

- [ ] **Step 3: Write the tool (preview path only; confirm path stubbed to error)**

Create `app/Mcp/Tools/SendOutreach.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Mcp\AgentContext;
use App\Mcp\Exceptions\ResourceForbiddenException;
use App\Services\Unipile\UnipileService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;

class SendOutreach extends Tool
{
    private const CHANNELS = ['email', 'linkedin', 'whatsapp'];

    protected string $name = 'send_outreach';

    protected string $description = <<<'TXT'
Send a personalized outreach message to a candidate via email, LinkedIn,
or WhatsApp.

TWO-STEP SAFETY CONTRACT — read carefully:
1. Call WITHOUT `confirm` (or confirm:false) to get a PREVIEW. This sends
   nothing; it returns the drafted message for the user to review.
2. Surface that preview to the user. Only after the user explicitly
   approves, call again with the SAME fields plus `confirm: true` to send.
Never set confirm:true on the first call. Never set it unless the user
has approved the exact message in the preview.
TXT;

    public function handle(Request $request, UnipileService $unipile): Response
    {
        try {
            AgentContext::fromRequest($request);
        } catch (ResourceForbiddenException $e) {
            return Response::error($e->getMessage());
        }

        $channel = trim((string) $request->get('channel'));
        $recipient = trim((string) $request->get('recipient'));
        $subject = trim((string) $request->get('subject', ''));
        $body = trim((string) $request->get('body'));
        $confirm = (bool) $request->get('confirm', false);

        if (! in_array($channel, self::CHANNELS, true)) {
            return Response::error('channel must be one of: '.implode(', ', self::CHANNELS).'.');
        }

        if ($recipient === '' || $body === '') {
            return Response::error('recipient and body are required.');
        }

        if (! $confirm) {
            return Response::json([
                'status' => 'preview',
                'channel' => $channel,
                'recipient' => $recipient,
                'subject' => $subject,
                'body' => $body,
                'note' => 'Nothing was sent. Re-call with confirm:true after the user approves.',
            ]);
        }

        return Response::error('Sending is not yet enabled (Task 4).');
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'channel' => $schema->string()
                ->description('One of: email, linkedin, whatsapp.')
                ->required(),
            'recipient' => $schema->string()
                ->description('Email address (email) or LinkedIn username/profile id (linkedin/whatsapp).')
                ->required(),
            'subject' => $schema->string()
                ->description('Subject line (email only). Empty for none.'),
            'body' => $schema->string()
                ->description('The message body. Personalize to the candidate.')
                ->required(),
            'confirm' => $schema->boolean()
                ->description('Leave false/absent for a preview. Only true after the user approves the preview.'),
        ];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/SendOutreachTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Tools/SendOutreach.php tests/Feature/Mcp/Tools/SendOutreachTest.php
git commit -m "feat(mcp): add send_outreach tool with preview-only safety contract"
```

---

## Task 4: `send_outreach` — confirmed send via Unipile

**Files:**
- Modify: `app/Mcp/Tools/SendOutreach.php` (replace the Task-3 stub `return Response::error('Sending is not yet enabled (Task 4).');`)
- Modify: `tests/Feature/Mcp/Tools/SendOutreachTest.php` (add the confirmed-send test)

**Interfaces:**
- Consumes: `UnipileService::emails()->send(string|int $accountId, array $data): array` for email; `UnipileService::messages()->newChat(string|int $accountId, ?string $message, array $attendees): array` for linkedin/whatsapp.
- Produces: when `confirm: true`, returns `{ status: 'sent', channel, recipient, provider_response }`.

- [ ] **Step 1: Determine how the workspace's Unipile account id is resolved.** Read `app/Models/ConnectedAccount.php`, `app/Models/UserIntegration.php`, and `app/Models/LinkedinAccount.php`; find how an existing feature obtains the Unipile `account_id` for the current user/client (grep `account_id` under `app/` for callers of `UnipileService`). Record the exact accessor (e.g. `$user->connectedAccounts()->where('provider','unipile')->value('external_id')`). This is the one integration detail not yet pinned; everything below uses the resolved value as `$accountId`.

- [ ] **Step 2: Write the failing test**

Add to `tests/Feature/Mcp/Tools/SendOutreachTest.php`:

```php
test('send_outreach with confirm sends an email via Unipile', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);
    // Arrange whatever connected-account fixture Step 1 identified, e.g.:
    // ConnectedAccount::factory()->create([... 'external_id' => 'acct_123' ...]);

    $emails = Mockery::mock();
    $emails->shouldReceive('send')->once()->andReturn(['id' => 'msg_1', 'status' => 'queued']);

    $this->mock(UnipileService::class, function ($mock) use ($emails) {
        $mock->shouldReceive('emails')->once()->andReturn($emails);
    });

    $result = (new SendOutreach())->handle(
        makeMcpRequest($user, [
            'channel' => 'email',
            'recipient' => 'jane@acme.com',
            'subject' => 'Opportunity',
            'body' => 'Hi Jane.',
            'confirm' => true,
        ]),
        app(UnipileService::class),
    );

    expect($result->content())->toContain('sent', 'msg_1');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/SendOutreachTest.php --filter='with confirm'`
Expected: FAIL — current stub returns the "not yet enabled" error.

- [ ] **Step 4: Implement the confirmed-send path**

In `app/Mcp/Tools/SendOutreach.php`, replace the stub line with a private dispatch. Add a `use App\Mcp\AgentContext;`-derived context (capture it from the guard) and:

```php
        $accountId = $this->resolveAccountId($context); // from Step 1's accessor

        if ($accountId === null) {
            return Response::error('No connected '.$channel.' account for this workspace. Connect one in settings first.');
        }

        try {
            $providerResponse = $channel === 'email'
                ? $unipile->emails()->send($accountId, [
                    'to' => [['identifier' => $recipient]],
                    'subject' => $subject,
                    'body' => $body,
                ])
                : $unipile->messages()->newChat($accountId, $body, [$recipient]);
        } catch (\Throwable $e) {
            report($e);

            return Response::error('Send failed via '.$channel.'. The message was not delivered.');
        }

        return Response::json([
            'status' => 'sent',
            'channel' => $channel,
            'recipient' => $recipient,
            'provider_response' => $providerResponse,
        ]);
```

Change the guard to keep the context: `$context = AgentContext::fromRequest($request);`. Add the private helper `resolveAccountId(AgentContext $context): string|int|null` using the accessor recorded in Step 1, and confirm the `emails()->send` payload key names (`to`/`subject`/`body`) against `EmailResource::send()`'s body assembly (read it; adjust keys to match what that method expects).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/SendOutreachTest.php`
Expected: PASS (both preview and confirmed-send tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Tools/SendOutreach.php tests/Feature/Mcp/Tools/SendOutreachTest.php
git commit -m "feat(mcp): send_outreach confirmed send via Unipile email/messaging"
```

---

## Task 5: Register the two new tools + update server instructions

**Files:**
- Modify: `app/Mcp/Servers/RecruitingServer.php`
- Test: `tests/Feature/Mcp/RecruitingServerTest.php`

**Interfaces:**
- Consumes: `EnrichContact`, `SendOutreach` from Tasks 2–4.
- Produces: both tools registered; `#[Instructions]` no longer claims read-only-only.

- [ ] **Step 1: Write the failing test**

Add to `tests/Feature/Mcp/RecruitingServerTest.php`:

```php
test('recruiting server registers the headhunter action tools', function () {
    $server = new App\Mcp\Servers\RecruitingServer();
    $tools = (new ReflectionClass($server))->getProperty('tools');
    $tools->setAccessible(true);

    expect($tools->getValue($server))->toContain(
        App\Mcp\Tools\EnrichContact::class,
        App\Mcp\Tools\SendOutreach::class,
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/RecruitingServerTest.php --filter='headhunter action tools'`
Expected: FAIL.

- [ ] **Step 3: Register the tools and fix the instructions**

In `app/Mcp/Servers/RecruitingServer.php` add `EnrichContact::class` and `SendOutreach::class` to `$tools` and `use` them at the top. Replace the final instruction line `All tools are read-only.` with:

```
Most tools are read-only. `send_outreach` performs an action: it ALWAYS
returns a preview first and only sends after you re-call it with
confirm:true, which you must not do until the user approves the message.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/RecruitingServerTest.php`
Expected: PASS.

- [ ] **Step 5: Run the full MCP suite**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Servers/RecruitingServer.php tests/Feature/Mcp/RecruitingServerTest.php
git commit -m "feat(mcp): register enrich_contact and send_outreach in RecruitingServer"
```

---

## Task 6: Credit gating for enrich + outreach

**Files:**
- Modify: `app/Mcp/Tools/EnrichContact.php`, `app/Mcp/Tools/SendOutreach.php`
- Test: extend both tool tests.

**Interfaces:**
- Consumes: `ClientFeatureCredit::useCredits(int $amount): bool` (instance method, confirmed to exist).

- [ ] **Step 1: Pin the credit lookup.** Read `app/Models/ClientFeatureCredit.php` fully — confirm the feature-slug column name and how to fetch the row for a client (the `client()` belongsTo exists; find the inverse, e.g. `Client::featureCredits()` or a query on `client_id` + the slug column). Identify the slug used for enrichment (the `get_usage` tool / `UsageService` reports "enrichment credits" — reuse that exact slug). Record the exact fetch expression.

- [ ] **Step 2: Write the failing test (enrich blocked with no credits)**

Add to `EnrichContactTest.php`:

```php
test('enrich_contact errors when the workspace has no enrichment credits', function () {
    $client = Client::factory()->create();
    $user = User::factory()->create(['current_client_id' => $client->id]);
    // No ClientFeatureCredit row / zero balance for the enrichment slug.

    $this->mock(ContactOutService::class, function ($mock) {
        $mock->shouldNotReceive('people'); // never reached when credits are exhausted
    });

    $result = (new EnrichContact())->handle(
        makeMcpRequest($user, ['linkedin_username' => 'jane-doe']),
        app(ContactOutService::class),
    );

    expect($result->content())->toContain('credit');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools/EnrichContactTest.php --filter='no enrichment credits'`
Expected: FAIL (tool currently calls ContactOut regardless of credits).

- [ ] **Step 4: Add the credit gate**

In `EnrichContact::handle()`, after the context guard and before the ContactOut call, fetch the credit row (Step 1 expression), and:

```php
        $credit = $context->client->featureCredits()
            ->where('feature_slug', 'enrichment')->first(); // adjust to Step 1 findings

        if (! $credit || ! $credit->useCredits(1)) {
            return Response::error('No enrichment credits remaining for this workspace.');
        }
```

(Capture `$context` from the guard: `$context = AgentContext::fromRequest($request);`.) Apply the equivalent gate to `SendOutreach`'s confirmed-send path (charge only on `confirm: true`, before the Unipile call) using the outreach credit slug confirmed in Step 1.

- [ ] **Step 5: Run to verify it passes (and re-run prior tests)**

Run: `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp/Tools`
Expected: PASS — earlier success tests must seed a credit row so they still pass; update their `beforeEach`/arrange blocks to grant credits via `ClientFeatureCredit::addCredits($client->id, 'enrichment', 10)`.

- [ ] **Step 6: Commit**

```bash
cd /Users/eth0/Herd/360ai
git add app/Mcp/Tools/EnrichContact.php app/Mcp/Tools/SendOutreach.php tests/Feature/Mcp/Tools/EnrichContactTest.php tests/Feature/Mcp/Tools/SendOutreachTest.php
git commit -m "feat(mcp): gate enrich_contact and send_outreach on feature credits"
```

---

## Done criteria

- `cd /Users/eth0/Herd/360ai && ./vendor/bin/pest tests/Feature/Mcp` is green.
- `enrich_contact` returns ContactOut data and is credit-gated.
- `send_outreach` returns a preview without `confirm`, sends via Unipile only with `confirm: true`, and is credit-gated on send.
- `RecruitingServer` exposes all 11 read tools + the 2 action tools.

## Next plan

**Plan 2 — chat-side agent surface** (`chat.360ai`): card-renderer registry refactor (`tools.ts` + `index.tsx`), `ContactCard` + `OutreachPreviewCard`, the 6 `librechat.yaml` model specs, admin Agent-record seeding, and locale keys. Requires a short recon of how this fork stores/seeds Agent records (Mongo) and wires model specs before it can be written without placeholders.
