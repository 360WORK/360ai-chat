const { composeSystemPrompt, isBusinessType } = require('@librechat/api');

/**
 * Build the composed Acumen system prompt for the primary 360ai agent.
 *
 * This is a thin JS wrapper (per repo CLAUDE.md: `/api` changes are thin JS
 * wrappers only). The composition itself lives in `composeSystemPrompt` from
 * `@librechat/api` (Plan 3 Task 9).
 *
 * GUARD: returns null when `user.oidcClaims.businessType` is absent or not yet
 * a valid BusinessType (today's real case — the claim is promoted in a later
 * sub-project). This keeps the live agent path unchanged until the claim exists.
 *
 * @param {object | undefined} user - The authenticated request user (req.user).
 * @param {string | undefined} brief - The latest user message text for use-case routing.
 * @returns {string | null} The composed system prompt to append, or null to no-op.
 */
function acumenContextPart(user, brief) {
  const claims = user?.oidcClaims;
  if (!claims) {
    return null;
  }
  if (!isBusinessType(claims.businessType)) {
    return null;
  }
  const userContext = claims.onboardingSummary || undefined;
  const { prompt } = composeSystemPrompt({ businessType: claims.businessType, userContext, brief });
  return prompt || null;
}

module.exports = { acumenContextPart };
