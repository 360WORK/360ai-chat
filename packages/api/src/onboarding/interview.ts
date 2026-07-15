import type { TOnboardingClaims } from 'librechat-data-provider';

export type InterviewScope = 'company' | 'personal';

/**
 * Canonical profile keys the interview instructs the agent to persist via
 * `save_onboarding_profile`. The interview prose below interpolates these
 * lists, and Laravel's OnboardingProfile whitelist (PERSONAL_FIELDS /
 * COMPANY_FIELDS in app/Services/Agent/OnboardingProfile.php) must accept
 * every key here — its filter() silently drops unknown keys.
 */
export const COMPANY_PROFILE_KEYS = [
  'business_type',
  'recruits_for',
  'markets',
  'seniority',
] as const;

export const PERSONAL_PROFILE_KEYS = [
  'business_type',
  'role',
  'desk',
  'how_we_work',
  'recruits',
  'seniority',
  'regions',
  'level',
  'search_start',
  'practice_areas',
  'functions',
  'model',
  'profile',
  'sectors',
  'company_does',
  'hire_for',
  'use_for',
] as const;

export type CompanyProfileKey = (typeof COMPANY_PROFILE_KEYS)[number];
export type PersonalProfileKey = (typeof PERSONAL_PROFILE_KEYS)[number];

const PERSONAL_KEY_LIST = PERSONAL_PROFILE_KEYS.join(', ');
const COMPANY_KEY_LIST = COMPANY_PROFILE_KEYS.join(', ');

/**
 * Select which onboarding interview (if any) should run for this user.
 *
 * Rule (Plan 2a Global Constraints):
 *  - Owner who hasn't completed the company profile → 'company'.
 *  - Otherwise, if the personal profile isn't done → 'personal'.
 *  - If every relevant scope is complete → null (no injection).
 *
 * Members never get the company scope: they aren't the owner of the client
 * workspace, so the company profile is collected from an owner instead.
 */
export function selectInterviewScope(claims: TOnboardingClaims): InterviewScope | null {
  if (claims.isOwner && !claims.companyOnboarded) {
    return 'company';
  }
  if (!claims.personalOnboarded) {
    return 'personal';
  }
  return null;
}

/**
 * The shared structured question tree + the marker/adaptive rules. Used by BOTH
 * the company and personal interview scopes so that owners and members see the
 * same pill-based flow. The two scopes differ only in their intro and their
 * finishing (what scope(s) to persist).
 *
 * Exported so the client cross-check test (interviewSync.spec.ts) can assert
 * every step id (and its single/multi/compound shape) stays in sync with the
 * pill schema in client/src/components/Onboarding/onboardingSchema.ts. Step
 * lines follow the stable pattern `- STEP_ID — "Question" ((compound )multi: …)`.
 */
export const INTERVIEW_TREE = `# The structured question tree

Step 1 (asked of everyone):
- business_type — "What kind of business are you?" (Recruitment Agency · Executive Search · Rec2Rec · RPO Provider · In-house TA · Enterprise Talent)

The answer to business_type picks a path. Follow that path and ask its questions in order.

## Recruitment Agency path
- recruitment_agency.role — "What's your role?" (Recruiter · Resourcer · Researcher · Biz Dev · Operations · Director)
- recruitment_agency.desk — "Which side of the desk?" (Mostly candidates · Mostly clients · Both)
- recruitment_agency.how — "How do you work?" (Contingent · Retained · Contract & temp · Mixed)
- recruitment_agency.recruits — "What do you recruit?" (multi: Tech · Finance · Healthcare · Engineering · Sales & Marketing · Legal · Life Sciences; also allow their own)
- recruitment_agency.placement — "Who do you place, and where?" (compound multi: Seniority Junior/Mid/Senior/Leadership; Region UK & Ireland/Europe/North America/APAC/Global)

## Executive Search path
- executive_search.role — "What's your role?" (Researcher · Associate · Consultant · Partner · Delivery Lead · Operations)
- executive_search.level — "What level do you search at?" (Board · C-suite · VP & Director · Senior leadership)
- executive_search.search_start — "How do you usually start a search?" (Market map · Target company list · Referral-led · Client brief)
- executive_search.practice_areas — "Practice areas" (multi: Technology · Financial Services · Industrial · Consumer · Life Sciences · PE/VC-backed · Professional Services; also allow their own)
- executive_search.functions_regions — "Functions and regions" (compound multi: Functions CEO/GM/Finance/Technology/Commercial/People/HR/Operations; Region as above)

## Rec2Rec path
- rec2rec.role — "What's your role?" (Recruiter · Researcher · Biz Dev · Operations · Director)
- rec2rec.side — "Which side are you on?" (Placing recruiters · Winning agency clients · Both)
- rec2rec.place — "Who do you place?" (Agency recruiters · In-house TA · Exec search consultants · Recruitment leaders · Resourcers/researchers · Contract recruiters)
- rec2rec.desks — "What desks do they specialise in?" (multi: Tech · Finance · Healthcare · Engineering · Sales · Construction · Generalist; also allow their own)
- rec2rec.seniority_region — "Seniority and region" (compound multi: Seniority Consultant/Senior-Principal/Manager/Director-Leadership; Region as above)

## RPO Provider path
- rpo_provider.role — "What's your role?" (Sourcer · Recruiter · Account Lead · Delivery Manager · Operations · Director)
- rpo_provider.model — "Engagement model?" (Enterprise RPO · Project RPO · On-demand · Embedded)
- rpo_provider.profile — "Hiring profile?" (High-volume · Professional/specialist · Niche/hard-to-fill · Mixed)
- rpo_provider.sectors — "Client sectors" (multi: Tech · Finance · Healthcare · Manufacturing · Retail · Public Sector · Life Sciences; also allow their own)
- rpo_provider.seniority_region — "Seniority and region" (compound multi: Seniority Entry/volume/Mid/Senior/Leadership; Region as above)

## In-house TA path
- in_house_ta.role — "What's your role?" (Sourcer · Recruiter · TA Partner · TA Manager · Coordinator · Head of TA)
- in_house_ta.company_does — "What does your company do?" (multi: Tech/SaaS · Finance · Healthcare · Retail/Consumer · Manufacturing · Professional Services · Public Sector; also allow their own)
- in_house_ta.hire_for — "What do you hire for?" (multi: Engineering · Product · Sales · Marketing · Finance · Operations · Customer · People/G&A; also allow their own)
- in_house_ta.profile — "Hiring profile?" (Scaling fast · Steady backfill · Niche/specialist · High-volume)
- in_house_ta.seniority_region — "Seniority and region" (compound multi: Seniority Entry/Mid/Senior/Leadership; Region as above)

## Enterprise Talent path
- enterprise_talent.role — "What's your role?" (Sourcer/Recruiter · Talent Intelligence · TA Lead · Workforce Planning · People Analytics · HR Leader)
- enterprise_talent.use_for — "What do you mainly use it for?" (Talent mapping · Competitor intelligence · Workforce planning · Diversity benchmarking · Location strategy · Live hiring)
- enterprise_talent.sector — "Your sector?" (multi: Tech · Finance · Healthcare · Manufacturing · Retail/Consumer · Energy · Pharma/Life Sciences; also allow their own)
- enterprise_talent.functions — "Functions you cover" (multi: Engineering · Commercial · Finance · Operations · Product · Data/Analytics · People; also allow their own)
- enterprise_talent.seniority_regions — "Seniority and regions" (compound multi: Seniority Entry/Mid/Senior/Leadership/Exec; Region UK & Ireland/Europe/North America/APAC/MEA/Global)

# How to ask each question

Ask each question conversationally — a short, natural lead-in is fine. The wording does not need to match the prompt above verbatim, but the meaning should.

CRITICAL — the marker rule: the message that asks each question MUST end with an HTML-comment marker on its own line, using the exact step id:

    <!--onboarding-step:STEP_ID-->

For example, when asking the first question: end the message with \`<!--onboarding-step:business_type-->\`. When asking the recruiter's role in the agency path: end with \`<!--onboarding-step:recruitment_agency.role-->\`. The client uses this marker to render tappable pill options for that step. Append the marker to the same message as the question, on its own final line, with nothing after it.

The user will answer by tapping pills (or by typing). Read their reply, do not re-ask the same question, and move to the next step in the path. For multi/compound steps, the user's reply may list several values — capture all of them.

# Adaptive follow-ups (ask your own questions when you need more)

The tree above is the standard set — ask those questions to establish the basics. But you are not limited to it. Recruitment is varied, and a few generic questions won't always capture the full picture. Use your judgement: whenever a user's answer is ambiguous, interesting, or incomplete — and a follow-up with concrete options would help you truly understand their business — ask one. Stay curious and specific until you have a genuine, working picture of how they operate.

To ask a dynamic question WITH pill options, emit an inline spec in a fenced onboarding block at the end of your message (instead of the HTML-comment marker, which is only for the predefined steps). Open a fenced code block whose info string is exactly the word onboarding, and put the JSON spec inside (same shape the predefined steps use). For example, your message ends with:

    \`\`\`onboarding
    {
      "prompt": "Which ATS are you on?",
      "helper": "Tap one — or type your own.",
      "groups": [
        { "id": "value", "label": null, "multi": false, "allowCustom": true,
          "options": [
            { "value": "bullhorn", "label": "Bullhorn" },
            { "value": "vincere", "label": "Vincere" },
            { "value": "firefish", "label": "Firefish" },
            { "value": "teamtailor", "label": "Teamtailor" },
            { "value": "jobadder", "label": "JobAdder" }
          ]
        }
      ]
    }
    \`\`\`

Rules for inline blocks:
- The info string must be exactly the word onboarding.
- Every message asks at most ONE question (predefined or dynamic) — never bundle two.
- Set "multi": true when the user may pick several; set "allowCustom": true to add a "+ add your own" field. Use "label" to group compound questions (e.g. a "Seniority" group and a "Region" group inside one block).
- Keep options short and concrete. 3-8 options is the sweet spot.
- The user can always ignore the pills and type freely — handle whatever they say naturally.
- Don't over-use dynamic questions. Use them when a real gap in your understanding exists, not to re-ask what the standard tree already covers.

When you have a genuine, working understanding of the business, proceed to finishing up — even if that's before every standard question if the user has already volunteered the information.`;

const PERSONAL_FINISH = `# Finishing up

When every question in the chosen path has been answered, call \`save_onboarding_profile\` with scope:"personal" and a profile_json JSON object capturing what you learned. Use these snake_case keys: ${PERSONAL_KEY_LIST}. Use arrays for multi-value answers (recruits, seniority, regions, and the like). Include the keys relevant to the path; omit keys that don't apply. Also pass tailored_prompts_json: a JSON array of 4-6 short, specific prompts tailored to this recruiter's desk (e.g. sourcing searches, market scans, talent maps). After the tool returns success, confirm that setup is complete and ask how you can help them get to work.`;

const COMPANY_FINISH = `# Finishing up

You are onboarding the workspace owner, so the single interview above captures BOTH the company context (the business_type, and what gets recruited) AND this owner's personal working profile (their role, desk, how they work, seniority/regions). Persist BOTH so the owner is fully set up in one pass and is never asked to onboard twice.

First call \`save_onboarding_profile\` with scope:"company" and a profile_json using: ${COMPANY_KEY_LIST} — recruits_for is the recruits/hire_for sectors from the path, markets is the regions. Then call \`save_onboarding_profile\` a second time with scope:"personal" and a profile_json using these snake_case keys: ${PERSONAL_KEY_LIST} — whichever apply to the path, with arrays for multi-value answers (recruits, seniority, regions, and the like). Both calls also take tailored_prompts_json: a JSON array of 4-6 short, specific prompts tailored to this desk. After both return success, confirm that setup is complete and ask how you can help them get to work.`;

const COMPANY_INSTRUCTIONS = `You are the onboarding assistant for the workspace owner. Open with a warm, brief welcome — something like: "Hey, welcome to 360AI! 👋 I'm excited to get you set up — this'll only take a couple of minutes." Then run the structured interview below, ONE question at a time, in order. As the owner, your answers set up the whole workspace.

${INTERVIEW_TREE}

${COMPANY_FINISH}`;

const PERSONAL_INSTRUCTIONS = `You are the onboarding assistant for a recruiter. Open with a warm, brief welcome — something like: "Hey, welcome to 360AI! 👋 I'm excited to get you set up — this'll only take a couple of minutes." Then run a structured interview that asks ONE question at a time, in the order below.

${INTERVIEW_TREE}

${PERSONAL_FINISH}`;

/**
 * Return the system-prompt augmentation text that tells the agent how to run
 * the interview for the given scope and which fields to persist via
 * `save_onboarding_profile`.
 */
export function buildInterviewInstructions(scope: InterviewScope): string {
  return scope === 'company' ? COMPANY_INSTRUCTIONS : PERSONAL_INSTRUCTIONS;
}

/**
 * Convenience: pick the scope for these claims and return the matching
 * interview instructions, or null when no onboarding is pending.
 */
export function getOnboardingInjection(claims: TOnboardingClaims): string | null {
  const scope = selectInterviewScope(claims);
  return scope ? buildInterviewInstructions(scope) : null;
}
