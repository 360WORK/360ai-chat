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

/** Coerce to a trimmed string, preserving null/undefined as null. */
const toNullableStr = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const str = typeof value === 'string' ? value : String(value);
  const trimmed = str.trim();
  return trimmed === '' ? null : trimmed;
};

/** Coerce a role claim to the persisted union. Anything not 'owner' becomes 'member'. */
const toRole = (value: unknown): 'owner' | 'member' => (value === 'owner' ? 'owner' : 'member');

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
    role: toRole(userinfo.role),
    clientId: toNullableStr(userinfo.client_id),
    clientName: toNullableStr(userinfo.client_name),
    companyOnboarded: toBool(userinfo.company_onboarded),
    personalOnboarded: toBool(userinfo.personal_onboarded),
  };
};
