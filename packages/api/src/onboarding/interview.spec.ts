import {
  selectInterviewScope,
  buildInterviewInstructions,
  getOnboardingInjection,
} from './interview';
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
  it('company script uses the shared pill tree, the marker, and the save tool', () => {
    const s = buildInterviewInstructions('company');
    expect(s).toContain('save_onboarding_profile');
    expect(s).toContain('company');
    // The shared pill tree is now used for both scopes (owners and members see
    // the same pills), so the company script must reference the root step and
    // the marker rule — not the old free-text 'industry' interview.
    expect(s).toContain('business_type');
    expect(s).toContain('onboarding-step:');
  });
  it('company script persists BOTH scopes so the owner is never asked twice', () => {
    const s = buildInterviewInstructions('company');
    expect(s).toContain('scope:"company"');
    expect(s).toContain('scope:"personal"');
  });
  it('personal script names the personal fields and the save tool', () => {
    const s = buildInterviewInstructions('personal');
    expect(s).toContain('save_onboarding_profile');
    expect(s).toContain('desk');
    expect(s).toContain('scope:"personal"');
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
