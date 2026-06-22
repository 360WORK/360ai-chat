'use strict';

const express = require('express');
const request = require('supertest');

const mockGetOnboardingStatus = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('~/models', () => ({
  updateUser: (...args) => mockUpdateUser(...args),
}));

jest.mock('../../services/Onboarding', () => {
  const { updateUser } = require('~/models');
  return {
    getOnboardingStatus: (...args) => mockGetOnboardingStatus(...args),
    refreshUserClaims: jest.fn(async (user, status) => {
      const oidcClaims = {
        isOwner: !!status.is_owner,
        role: status.is_owner ? 'owner' : 'member',
        clientId: status.client?.id != null ? String(status.client.id) : null,
        clientName: status.client?.name ?? null,
        companyOnboarded: !!status.company?.completed,
        personalOnboarded: !!status.personal?.completed,
      };
      await updateUser(user.id, { oidcClaims });
      return oidcClaims;
    }),
  };
});

jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => next());

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (_req, _res, next) => next(),
}));

const MOCK_STATUS = {
  is_owner: true,
  client: { id: 42, name: 'Acme Corp' },
  company: { completed: true, profile: { name: 'Acme Corp' } },
  personal: { completed: false, profile: {} },
  tailored_prompts: ['Find senior engineers', 'Screen for culture fit'],
};

describe('Onboarding Routes', () => {
  let app;

  beforeAll(() => {
    const onboardingRouter = require('../onboarding');

    app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      req.user = { id: 'test-user-123' };
      next();
    });

    app.use('/api/onboarding', onboardingRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /status', () => {
    it('returns 200 with the onboarding status payload', async () => {
      mockGetOnboardingStatus.mockResolvedValue(MOCK_STATUS);
      mockUpdateUser.mockResolvedValue({});

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ onboarding: MOCK_STATUS });
    });

    it('returns tailored_prompts verbatim from the MCP result', async () => {
      mockGetOnboardingStatus.mockResolvedValue(MOCK_STATUS);
      mockUpdateUser.mockResolvedValue({});

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(200);
      expect(response.body.onboarding.tailored_prompts).toEqual(MOCK_STATUS.tailored_prompts);
    });

    it('calls updateUser with camelCase oidcClaims including companyOnboarded', async () => {
      mockGetOnboardingStatus.mockResolvedValue(MOCK_STATUS);
      mockUpdateUser.mockResolvedValue({});

      await request(app).get('/api/onboarding/status');

      expect(mockUpdateUser).toHaveBeenCalledTimes(1);
      const [userId, updateData] = mockUpdateUser.mock.calls[0];
      expect(userId).toBe('test-user-123');
      expect(updateData.oidcClaims.companyOnboarded).toBe(true);
      expect(updateData.oidcClaims.personalOnboarded).toBe(false);
      expect(updateData.oidcClaims.isOwner).toBe(true);
      expect(updateData.oidcClaims.role).toBe('owner');
      expect(updateData.oidcClaims.clientId).toBe('42');
      expect(updateData.oidcClaims.clientName).toBe('Acme Corp');
    });

    it('returns 502 when getOnboardingStatus throws', async () => {
      mockGetOnboardingStatus.mockRejectedValue(new Error('OpenID token expired'));

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ error: 'Failed to load onboarding status.' });
    });
  });
});
