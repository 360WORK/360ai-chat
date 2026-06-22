import { selectInterviewScope, buildInterviewInstructions, getOnboardingInjection } from './interview';
import type { TOnboardingClaims } from 'librechat-data-provider';

const base: TOnboardingClaims = {
  isOwner: false,
  role: 'member',
  clientId: '1',
  clientName: 'Acme',
  companyOnboarded: false,
  personalOnboarded: false,
};

describe('selectInterviewScope', () => {
  it('owner without company profile → company', () => {
    expect(selectInterviewScope({ ...base, isOwner: true, role: 'owner' })).toBe('company');
  });
  it('owner with company done but personal not → personal', () => {
    expect(
      selectInterviewScope({ ...base, isOwner: true, role: 'owner', companyOnboarded: true }),
    ).toBe('personal');
  });
  it('member without personal profile → personal', () => {
    expect(selectInterviewScope(base)).toBe('personal');
  });
  it('member with personal done → null', () => {
    expect(selectInterviewScope({ ...base, personalOnboarded: true })).toBeNull();
  });
  it('owner with both done → null', () => {
    expect(
      selectInterviewScope({
        ...base,
        isOwner: true,
        role: 'owner',
        companyOnboarded: true,
        personalOnboarded: true,
      }),
    ).toBeNull();
  });
});

describe('buildInterviewInstructions', () => {
  it('company script names the company fields and the save tool', () => {
    const s = buildInterviewInstructions('company');
    expect(s).toContain('save_onboarding_profile');
    expect(s).toContain('company');
    expect(s).toContain('industry');
  });
  it('personal script names the personal fields and the save tool', () => {
    const s = buildInterviewInstructions('personal');
    expect(s).toContain('save_onboarding_profile');
    expect(s).toContain('desk');
  });
});

describe('getOnboardingInjection', () => {
  it('returns null when nothing to onboard', () => {
    expect(getOnboardingInjection({ ...base, personalOnboarded: true })).toBeNull();
  });
  it('returns the script when onboarding is pending', () => {
    expect(getOnboardingInjection(base)).toContain('save_onboarding_profile');
  });
});
