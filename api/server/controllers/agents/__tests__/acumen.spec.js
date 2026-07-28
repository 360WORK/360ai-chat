'use strict';

jest.mock('../../../services/Onboarding', () => ({
  getOnboardingStatus: jest.fn(),
}));

const { getOnboardingStatus } = require('../../../services/Onboarding');
const {
  acumenContextPart,
  resolveProfile,
  invalidateAcumenProfile,
  resetAcumenProfileCache,
} = require('../acumen');

const user = { id: 'user-1' };

function statusWith(businessType) {
  return {
    is_owner: true,
    company: {
      completed: !!businessType,
      profile: businessType ? { business_type: businessType } : null,
    },
    personal: { completed: false, profile: null },
  };
}

describe('resolveProfile cache', () => {
  let nowSpy;
  let now;

  beforeEach(() => {
    resetAcumenProfileCache();
    getOnboardingStatus.mockReset();
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('shares one in-flight MCP call between concurrent misses', async () => {
    let release;
    getOnboardingStatus.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(statusWith('recruitment_agency')))),
    );
    const [first, second] = [resolveProfile(user), resolveProfile(user)];
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(getOnboardingStatus).toHaveBeenCalledTimes(1);
    expect(a.businessType).toBe('recruitment-agencies');
    expect(b).toEqual(a);
  });

  it('serves a resolved profile from cache within the 5-minute TTL', async () => {
    getOnboardingStatus.mockResolvedValue(statusWith('recruitment_agency'));
    await resolveProfile(user);
    now += 4 * 60 * 1000;
    const profile = await resolveProfile(user);
    expect(getOnboardingStatus).toHaveBeenCalledTimes(1);
    expect(profile.businessType).toBe('recruitment-agencies');
  });

  it('expires a businessType:null result after the short negative TTL', async () => {
    getOnboardingStatus.mockResolvedValue(statusWith(null));
    const first = await resolveProfile(user);
    expect(first.businessType).toBeNull();

    now += 30 * 1000;
    await resolveProfile(user);
    expect(getOnboardingStatus).toHaveBeenCalledTimes(1);

    now += 16 * 1000;
    await resolveProfile(user);
    expect(getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('refetches after invalidateAcumenProfile', async () => {
    getOnboardingStatus.mockResolvedValue(statusWith('recruitment_agency'));
    await resolveProfile(user);
    invalidateAcumenProfile(user.id);
    await resolveProfile(user);
    expect(getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejected lookups', async () => {
    getOnboardingStatus.mockRejectedValueOnce(new Error('MCP down'));
    await expect(resolveProfile(user)).rejects.toThrow('MCP down');
    getOnboardingStatus.mockResolvedValue(statusWith('recruitment_agency'));
    const profile = await resolveProfile(user);
    expect(profile.businessType).toBe('recruitment-agencies');
    expect(getOnboardingStatus).toHaveBeenCalledTimes(2);
  });
});

describe('acumenContextPart timeout', () => {
  beforeEach(() => {
    resetAcumenProfileCache();
    getOnboardingStatus.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when profile resolution exceeds the hot-path timeout', async () => {
    getOnboardingStatus.mockImplementation(() => new Promise(() => {}));
    const pending = acumenContextPart(user, null);
    jest.advanceTimersByTime(2600);
    await expect(pending).resolves.toBeNull();
  });

  it('returns null (not a rejection) when the profile lookup fails', async () => {
    getOnboardingStatus.mockRejectedValue(new Error('MCP down'));
    await expect(acumenContextPart(user, null)).resolves.toBeNull();
  });
});
