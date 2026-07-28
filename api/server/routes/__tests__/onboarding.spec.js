'use strict';

const express = require('express');
const request = require('supertest');

const mockUpdateUser = jest.fn();
const mockCallTool = jest.fn();
const mockGetServerConfig = jest.fn();

jest.mock('~/models', () => ({
  updateUser: (...args) => mockUpdateUser(...args),
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({ callTool: mockCallTool })),
  getMCPServersRegistry: jest.fn(() => ({ getServerConfig: mockGetServerConfig })),
  getFlowStateManager: jest.fn(() => ({})),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({})),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (_req, _res, next) => next(),
}));

const MOCK_MCP_PAYLOAD = {
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
    mockGetServerConfig.mockResolvedValue({});
    mockUpdateUser.mockResolvedValue({});
  });

  describe('GET /status', () => {
    it('returns 200 with the onboarding status payload', async () => {
      mockCallTool.mockResolvedValue(MOCK_MCP_PAYLOAD);

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(200);
      const expected = { ...MOCK_MCP_PAYLOAD, role: 'owner' };
      expect(response.body).toEqual({ onboarding: expected });
    });

    it('returns tailored_prompts verbatim from the MCP result', async () => {
      mockCallTool.mockResolvedValue(MOCK_MCP_PAYLOAD);

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(200);
      expect(response.body.onboarding.tailored_prompts).toEqual(MOCK_MCP_PAYLOAD.tailored_prompts);
    });

    it('calls updateUser with camelCase oidcClaims including companyOnboarded', async () => {
      mockCallTool.mockResolvedValue(MOCK_MCP_PAYLOAD);

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
      mockCallTool.mockRejectedValue(new Error('OpenID token expired'));

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ error: 'Failed to load onboarding status.' });
    });
  });

  describe('PUT /profile', () => {
    it('calls save_onboarding_profile with scope and profile_json and returns the saved tool result', async () => {
      mockCallTool.mockResolvedValue({ status: 'saved', scope: 'personal', completed: true });

      const response = await request(app)
        .put('/api/onboarding/profile')
        .send({ scope: 'personal', profile: { desk: 'AI' } });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'saved', scope: 'personal', completed: true });

      expect(mockCallTool).toHaveBeenCalledTimes(1);
      const callArg = mockCallTool.mock.calls[0][0];
      expect(callArg.toolName).toBe('save_onboarding_profile');
      expect(callArg.toolArguments.scope).toBe('personal');
      expect(callArg.toolArguments.profile_json).toBe('{"desk":"AI"}');
      expect(callArg.toolArguments.tailored_prompts_json).toBeUndefined();
    });

    it('includes tailored_prompts_json when tailored_prompts is provided', async () => {
      mockCallTool.mockResolvedValue({ status: 'saved', scope: 'company', completed: true });

      const response = await request(app)
        .put('/api/onboarding/profile')
        .send({ scope: 'company', profile: { industry: 'SaaS' }, tailored_prompts: ['a', 'b'] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'saved', scope: 'company', completed: true });

      const callArg = mockCallTool.mock.calls[0][0];
      expect(callArg.toolName).toBe('save_onboarding_profile');
      expect(callArg.toolArguments.scope).toBe('company');
      expect(callArg.toolArguments.profile_json).toBe('{"industry":"SaaS"}');
      expect(callArg.toolArguments.tailored_prompts_json).toBe('["a","b"]');
    });

    it('returns 400 when scope is invalid', async () => {
      const response = await request(app)
        .put('/api/onboarding/profile')
        .send({ scope: 'bogus', profile: {} });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid scope.' });
      expect(mockCallTool).not.toHaveBeenCalled();
    });

    it('returns 502 when the MCP tool throws', async () => {
      mockCallTool.mockRejectedValue(new Error('upstream failure'));

      const response = await request(app)
        .put('/api/onboarding/profile')
        .send({ scope: 'personal', profile: { desk: 'AI' } });

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ error: 'Failed to save onboarding profile.' });
    });
  });
});
