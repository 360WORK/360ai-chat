'use strict';

jest.mock('../../../services/Onboarding', () => ({
  getOnboardingStatus: jest.fn(),
}));

const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({ messages: { create: mockAnthropicCreate } })),
);

const { getOnboardingStatus } = require('../../../services/Onboarding');
const {
  acumenContextPart,
  resolveProfile,
  invalidateAcumenProfile,
  resetAcumenProfileCache,
  getActiveUseCase,
  resetAcumenStickyCache,
} = require('../acumen');

const SIGNAL_TRACKING_MARKER = 'Method for monitoring chosen subjects for events worth acting on';
const PROSPECTING_MARKER = 'Method for finding and qualifying prospective clients';

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

describe('acumen use-case routing', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    resetAcumenProfileCache();
    resetAcumenStickyCache();
    getOnboardingStatus.mockReset();
    mockAnthropicCreate.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ACUMEN_CLASSIFIER;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('routes via regex and stickies the use case for the rest of the conversation', async () => {
    getOnboardingStatus.mockResolvedValue(statusWith('executive_search'));
    const conversationId = 'conv-regex-sticky';

    const first = await acumenContextPart(
      user,
      'alert me when these CFOs change roles',
      conversationId,
    );
    expect(first).toEqual(expect.stringContaining(SIGNAL_TRACKING_MARKER));
    expect(getActiveUseCase(conversationId)?.useCaseId).toBe('signal-tracking');

    const second = await acumenContextPart(user, 'yes', conversationId);
    expect(second).toEqual(expect.stringContaining(SIGNAL_TRACKING_MARKER));
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('drops a sticky use case the new business type grid does not allow', async () => {
    const conversationId = 'conv-invalidate';
    getOnboardingStatus.mockResolvedValueOnce(statusWith('executive_search'));
    await acumenContextPart(user, 'alert me when these CFOs change roles', conversationId);
    expect(getActiveUseCase(conversationId)?.useCaseId).toBe('signal-tracking');

    const otherUser = { id: 'user-2' };
    getOnboardingStatus.mockResolvedValueOnce(statusWith('in_house_ta'));
    const result = await acumenContextPart(otherUser, 'yes', conversationId);

    expect(result).toEqual(expect.not.stringContaining(SIGNAL_TRACKING_MARKER));
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('calls the classifier only when regex and sticky miss and the brief has enough words', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    getOnboardingStatus.mockResolvedValue(statusWith('executive_search'));
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ useCaseId: 'prospecting' }) }],
    });

    await acumenContextPart(user, 'yes', 'conv-classifier-short');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();

    const result = await acumenContextPart(
      user,
      'help me understand the pricing structure of a rival vendor',
      'conv-classifier-long',
    );
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.stringContaining(PROSPECTING_MARKER));
    expect(getActiveUseCase('conv-classifier-long')?.useCaseId).toBe('prospecting');
  });

  it('proceeds without a use case when the classifier call fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    getOnboardingStatus.mockResolvedValue(statusWith('executive_search'));
    mockAnthropicCreate.mockRejectedValue(new Error('timeout'));

    const result = await acumenContextPart(
      user,
      'help me understand the pricing structure of a rival vendor',
      'conv-classifier-fail',
    );
    expect(result).not.toBeNull();
    expect(result).toEqual(expect.not.stringContaining(PROSPECTING_MARKER));
    expect(getActiveUseCase('conv-classifier-fail')).toBeNull();
  });

  describe('sticky cache TTL', () => {
    let nowSpy;
    let now;

    beforeEach(() => {
      now = 1_000_000;
      nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('expires the sticky use case after the 6h TTL', async () => {
      getOnboardingStatus.mockResolvedValue(statusWith('executive_search'));
      const conversationId = 'conv-ttl';
      await acumenContextPart(user, 'alert me when these CFOs change roles', conversationId);
      expect(getActiveUseCase(conversationId)?.useCaseId).toBe('signal-tracking');

      now += 6 * 60 * 60 * 1000 + 1000;
      expect(getActiveUseCase(conversationId)).toBeNull();
    });

    it('resetAcumenStickyCache clears all sticky entries', async () => {
      getOnboardingStatus.mockResolvedValue(statusWith('executive_search'));
      const conversationId = 'conv-reset';
      await acumenContextPart(user, 'alert me when these CFOs change roles', conversationId);
      expect(getActiveUseCase(conversationId)).not.toBeNull();

      resetAcumenStickyCache();
      expect(getActiveUseCase(conversationId)).toBeNull();
    });
  });
});
