import type { TOnboardingClaims } from 'librechat-data-provider';

/**
 * Raw userinfo shape returned by the 360AI OIDC provider. Only the onboarding
 * claims we persist are declared here; the rest of the userinfo object is
 * intentionally untyped (it varies by provider).
 */
type OidcUserinfo = Record<string, unknown> & {
  is_owner?: unknown;
  role?: unknown;
  client_id?: unknown;
  client_name?: unknown;
  company_onboarded?: unknown;
  personal_onboarded?: unknown;
};

/** Coerce arbitrary claim values to a boolean (PHP `bool` ↔ JSON truthiness). */
const toBool = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

/** Coerce to a trimmed string, normalizing null/undefined to ''. */
const toStr = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const str = typeof value === 'string' ? value : String(value);
  return str.trim();
};

/**
 * Extract the 360AI onboarding claims from an OIDC userinfo object and return
 * the camelCase shape persisted on `IUser.oidcClaims`. Mirrors
 * `App\Support\Oidc\OidcClaims::forUser` in the parent Laravel app.
 *
 * Returns `undefined` when `userinfo` is absent so the field can be omitted
 * from the user document on non-OIDC logins (local, google, etc.) and so
 * `extractOnboardingClaims(undefined)` is a no-op for callers that don't have
 * a userinfo object.
 */
export const extractOnboardingClaims = (
  userinfo: OidcUserinfo | null | undefined,
): TOnboardingClaims | undefined => {
  if (userinfo === null || userinfo === undefined) {
    return undefined;
  }

  return {
    isOwner: toBool(userinfo.is_owner),
    role: toStr(userinfo.role),
    clientId: toStr(userinfo.client_id),
    clientName: toStr(userinfo.client_name),
    companyOnboarded: toBool(userinfo.company_onboarded),
    personalOnboarded: toBool(userinfo.personal_onboarded),
  };
};
