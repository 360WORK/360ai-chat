const { getOnboardingInjection } = require('@librechat/api');

/**
 * Decide whether to inject the onboarding interview script into the primary
 * agent's run context, and return that script (or null).
 *
 * This is a thin JS wrapper (per repo CLAUDE.md: `/api` changes are thin JS
 * wrappers only). The interview-script generation itself lives in
 * `getOnboardingInjection` from `@librechat/api` (Plan 2a Task 2); this
 * helper only adds the null-guard so that users without OIDC claims (local
 * users, existing tests) are unaffected.
 *
 * @param {import('librechat-data-provider').TOnboardingClaims | undefined} oidcClaims
 *   The claims populated at OIDC login (Plan 2a Task 1). `undefined` for
 *   users who did not log in via OIDC.
 * @returns {string | null} The interview instructions to append to the
 *   primary agent's `sharedRunContext`, or `null` when onboarding is
 *   complete (or claims are absent) and behavior should be unchanged.
 */
function onboardingContextPart(oidcClaims) {
  if (!oidcClaims) {
    return null;
  }
  return getOnboardingInjection(oidcClaims);
}

module.exports = { onboardingContextPart };
