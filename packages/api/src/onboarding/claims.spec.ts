import { extractOnboardingClaims } from './claims';
import type { TOnboardingClaims } from 'librechat-data-provider';

describe('extractOnboardingClaims', () => {
  it('returns undefined when userinfo is null/undefined', () => {
    expect(extractOnboardingClaims(undefined)).toBeUndefined();
    expect(extractOnboardingClaims(null)).toBeUndefined();
  });

  it('maps a fully-populated claim set', () => {
    const userinfo = {
      sub: 'abc',
      email: 'owner@example.com',
      is_owner: true,
      role: 'owner',
      client_id: 'cli-1',
      client_name: 'Acme',
      company_onboarded: true,
      personal_onboarded: false,
    };

    const expected: TOnboardingClaims = {
      isOwner: true,
      role: 'owner',
      clientId: 'cli-1',
      clientName: 'Acme',
      companyOnboarded: true,
      personalOnboarded: false,
    };

    expect(extractOnboardingClaims(userinfo)).toEqual(expected);
  });

  it('coerces truthy non-boolean claim values to booleans', () => {
    const userinfo = {
      is_owner: 1,
      company_onboarded: 'true',
      personal_onboarded: 0,
      client_id: 'cli-2',
      client_name: 'Globex',
      role: 'member',
    };

    expect(extractOnboardingClaims(userinfo)).toEqual({
      isOwner: true,
      role: 'member',
      clientId: 'cli-2',
      clientName: 'Globex',
      companyOnboarded: true,
      personalOnboarded: false,
    });
  });

  it('normalizes missing optional fields to safe defaults', () => {
    expect(extractOnboardingClaims({ sub: 'x' })).toEqual({
      isOwner: false,
      role: '',
      clientId: '',
      clientName: '',
      companyOnboarded: false,
      personalOnboarded: false,
    });
  });

  it('treats empty/null client_id as absent', () => {
    expect(extractOnboardingClaims({ client_id: '' })?.clientId).toBe('');
    expect(extractOnboardingClaims({ client_id: null })?.clientId).toBe('');
  });

  it('returns a fresh object each call (no shared references)', () => {
    const a = extractOnboardingClaims({ client_id: 'c1' });
    const b = extractOnboardingClaims({ client_id: 'c2' });
    expect(a).not.toBe(b);
    expect(a?.clientId).toBe('c1');
    expect(b?.clientId).toBe('c2');
  });
});
