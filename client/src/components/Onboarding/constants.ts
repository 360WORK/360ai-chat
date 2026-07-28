/**
 * Kickoff messages that start the onboarding interview. Shared by the hero
 * (fresh-user landing) and the starters nudge so the exact string the agent
 * receives never forks between the two entry points.
 */
export const COMPANY_KICKOFF = "Let's set up my company profile";
export const PERSONAL_KICKOFF = "Let's set up my profile";

export const onboardingKickoff = (isCompanyScope: boolean): string =>
  isCompanyScope ? COMPANY_KICKOFF : PERSONAL_KICKOFF;
