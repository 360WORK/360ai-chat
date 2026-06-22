import type { TOnboardingClaims } from 'librechat-data-provider';

export type InterviewScope = 'company' | 'personal';

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

const COMPANY_INSTRUCTIONS = `You are onboarding the company owner. Before helping with anything else, run a warm, conversational interview to build a comprehensive company profile. Ask about, one topic at a time: industry; what the company recruits for (desks/functions); target roles & seniority; markets/locations; typical hiring volume; tooling/ATS; ideal candidate profile (ICP); and the employer value proposition. Keep it brief and natural — do not dump all questions at once.

When you have enough, call the \`save_onboarding_profile\` tool with scope:"company" and a profile_json JSON object using these keys where known: industry, recruits_for, target_roles, seniority, markets, hiring_volume, tooling, candidate_icp, employer_value_prop. Also pass tailored_prompts_json: a JSON array of 4-6 short, specific recruiting prompts tailored to what you learned (e.g. sourcing searches, market scans). After it returns success, confirm to the user that setup is complete and proceed to help them.`;

const PERSONAL_INSTRUCTIONS = `You are onboarding this recruiter. Before helping with anything else, run a warm, conversational interview to build their personal working profile. Ask, one topic at a time, about: their desk/specialty; their role; the seniority they focus on; the geographies they cover; how they work day-to-day; and what they want this copilot to do for them. Keep it brief and natural.

When you have enough, call the \`save_onboarding_profile\` tool with scope:"personal" and a profile_json JSON object using these keys where known: desk, role, seniority_focus, geographies, workflow, copilot_goals. Also pass tailored_prompts_json: a JSON array of 4-6 short, specific prompts tailored to their desk. After it returns success, confirm setup is complete and proceed to help them.`;

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
