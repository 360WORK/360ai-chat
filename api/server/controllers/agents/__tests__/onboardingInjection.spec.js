const { onboardingContextPart } = require('../onboarding');

/**
 * Pins the thin wrapper that decides whether to inject the onboarding
 * interview script into the primary agent's run context.
 *
 * The wrapper delegates the script generation to `getOnboardingInjection`
 * (from `@librechat/api`, Task 2) and is only responsible for the null-guard
 * on `oidcClaims`: users without OIDC claims (local users, existing tests)
 * must be unaffected.
 *
 * Field names match the real `TOnboardingClaims` type from
 * `librechat-data-provider` (camelCase): `isOwner`, `role`, `clientId`,
 * `clientName`, `companyOnboarded`, `personalOnboarded`.
 */
describe('onboardingContextPart', () => {
  it('returns the interview script for a member who has not onboarded', () => {
    const part = onboardingContextPart({
      isOwner: false,
      role: 'member',
      clientId: '1',
      clientName: 'Acme',
      companyOnboarded: false,
      personalOnboarded: false,
    });
    expect(part).toContain('save_onboarding_profile');
  });

  it('returns null when claims are missing', () => {
    expect(onboardingContextPart(undefined)).toBeNull();
  });

  it('returns null for an empty object (legacy doc materialized by an old schema default)', () => {
    // An empty `{}` is truthy and would slip past a bare `!oidcClaims` guard;
    // the shape guard must reject it because `isOwner` is not a boolean.
    expect(onboardingContextPart({})).toBeNull();
  });

  it('returns null for a partial object missing a boolean isOwner', () => {
    // Partial object with no boolean `isOwner` is ambiguous and must
    // short-circuit rather than route into the interview.
    expect(onboardingContextPart({ role: 'member' })).toBeNull();
    expect(onboardingContextPart({ isOwner: 'yes' })).toBeNull();
  });

  it('returns null when onboarding is complete', () => {
    expect(
      onboardingContextPart({
        isOwner: false,
        role: 'member',
        clientId: '1',
        clientName: 'Acme',
        companyOnboarded: false,
        personalOnboarded: true,
      }),
    ).toBeNull();
  });

  it('returns the company script for an owner who has not onboarded the company', () => {
    const part = onboardingContextPart({
      isOwner: true,
      role: 'owner',
      clientId: '1',
      clientName: 'Acme',
      companyOnboarded: false,
      personalOnboarded: false,
    });
    expect(part).toContain('save_onboarding_profile');
    expect(part).toContain('company');
  });
});
