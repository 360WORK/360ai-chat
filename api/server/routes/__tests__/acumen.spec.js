'use strict';

const express = require('express');
const request = require('supertest');

const mockGetOnboardingStatus = jest.fn();

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    ...actual,
    composeSystemPrompt: jest.fn(actual.composeSystemPrompt),
  };
});

jest.mock('~/server/services/Onboarding', () => ({
  getOnboardingStatus: (...args) => mockGetOnboardingStatus(...args),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'test-user-123' };
    next();
  },
}));

const { composeSystemPrompt, workspacesMetaFor } = require('@librechat/api');
const {
  resetAcumenProfileCache,
  resetAcumenStickyCache,
  acumenContextPart,
} = require('~/server/controllers/agents/acumen');

const TOKEN = 'test-compose-secret';

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

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/acumen', router);
  return app;
}

describe('Acumen Routes', () => {
  let app;
  let savedToken;

  beforeAll(() => {
    savedToken = process.env.ACUMEN_COMPOSE_TOKEN;
    app = buildApp(require('../acumen'));
  });

  afterAll(() => {
    if (savedToken === undefined) {
      delete process.env.ACUMEN_COMPOSE_TOKEN;
    } else {
      process.env.ACUMEN_COMPOSE_TOKEN = savedToken;
    }
  });

  beforeEach(() => {
    process.env.ACUMEN_COMPOSE_TOKEN = TOKEN;
    resetAcumenProfileCache();
    resetAcumenStickyCache();
  });

  describe('POST /compose — requireComposeToken', () => {
    it('returns 503 (fails closed) when ACUMEN_COMPOSE_TOKEN is not configured', async () => {
      delete process.env.ACUMEN_COMPOSE_TOKEN;

      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ businessType: 'recruitment_agency' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Compose endpoint not configured' });
      expect(composeSystemPrompt).not.toHaveBeenCalled();
    });

    it('returns 401 when the x-acumen-token header is missing', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .send({ businessType: 'recruitment_agency' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
      expect(composeSystemPrompt).not.toHaveBeenCalled();
    });

    it('returns 401 for a wrong token', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', 'not-the-secret')
        .send({ businessType: 'recruitment_agency' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
      expect(composeSystemPrompt).not.toHaveBeenCalled();
    });

    it('returns 200 with the correct token (timing-safe compare path)', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ businessType: 'recruitment_agency' });

      expect(response.status).toBe(200);
      expect(typeof response.body.prompt).toBe('string');
      expect(response.body.prompt.length).toBeGreaterThan(0);
    });
  });

  describe('POST /compose — validation', () => {
    it('returns 400 when both brief and businessType are absent', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ userContext: 'some context' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'brief or businessType required' });
      expect(composeSystemPrompt).not.toHaveBeenCalled();
    });

    it('returns 400 for an oversize brief (>10k chars)', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ brief: 'x'.repeat(10001) });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'brief, userContext, and businessType must be strings within size limits',
      });
      expect(composeSystemPrompt).not.toHaveBeenCalled();
    });

    it('returns 400 for a non-string userContext', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ brief: 'map the talent', userContext: 42 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'brief, userContext, and businessType must be strings within size limits',
      });
      expect(composeSystemPrompt).not.toHaveBeenCalled();
    });
  });

  describe('POST /compose — composition', () => {
    it('normalizes a snake_case businessType to kebab-case and resolves a use case', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({
          businessType: 'recruitment_agency',
          brief: "Help me map the talent for a role I'm working on.",
        });

      expect(response.status).toBe(200);
      expect(composeSystemPrompt).toHaveBeenCalledTimes(1);
      expect(composeSystemPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ businessType: 'recruitment-agencies' }),
      );
      expect(typeof response.body.prompt).toBe('string');
      expect(response.body.prompt.length).toBeGreaterThan(0);
      expect(response.body.useCaseId).toBeTruthy();
    });

    it('passes an already-kebab businessType through unchanged', async () => {
      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ businessType: 'recruitment-agencies' });

      expect(response.status).toBe(200);
      expect(composeSystemPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ businessType: 'recruitment-agencies' }),
      );
      expect(typeof response.body.prompt).toBe('string');
      expect(response.body.prompt.length).toBeGreaterThan(0);
    });

    it('fails soft with 200 {prompt:null, useCaseId:null} when composeSystemPrompt throws', async () => {
      composeSystemPrompt.mockImplementationOnce(() => {
        throw new Error('layer store corrupted');
      });

      const response = await request(app)
        .post('/api/acumen/compose')
        .set('x-acumen-token', TOKEN)
        .send({ businessType: 'recruitment_agency' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ prompt: null, useCaseId: null });
    });
  });

  describe('POST /compose — rate limiter', () => {
    it('mounts the compose limiter and returns 429 after the configured max (default 30/min)', async () => {
      let isolatedRouter;
      jest.isolateModules(() => {
        isolatedRouter = require('../acumen');
      });
      const limitedApp = buildApp(isolatedRouter);

      const statuses = [];
      let lastResponse;
      for (let i = 0; i < 31; i++) {
        lastResponse = await request(limitedApp)
          .post('/api/acumen/compose')
          .set('x-acumen-token', TOKEN)
          .send({});
        statuses.push(lastResponse.status);
      }

      expect(statuses.slice(0, 30).every((status) => status === 400)).toBe(true);
      expect(statuses[30]).toBe(429);
      expect(lastResponse.body).toEqual({
        error: 'Too many compose requests, please try again later.',
      });
    });
  });

  describe('GET /workspaces', () => {
    it('returns {businessType:null, workspaces:[]} when the profile resolves without a business type', async () => {
      mockGetOnboardingStatus.mockResolvedValue(statusWith(null));

      const response = await request(app).get('/api/acumen/workspaces');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ businessType: null, workspaces: [] });
    });

    it('returns the normalized business type and its mapped workspaces on success', async () => {
      mockGetOnboardingStatus.mockResolvedValue(statusWith('recruitment_agency'));

      const response = await request(app).get('/api/acumen/workspaces');

      expect(response.status).toBe(200);
      expect(mockGetOnboardingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-user-123' }),
      );
      expect(response.body.businessType).toBe('recruitment-agencies');
      expect(response.body.workspaces).toEqual(workspacesMetaFor('recruitment-agencies'));
      expect(response.body.workspaces.length).toBeGreaterThan(0);
      for (const workspace of response.body.workspaces) {
        expect(typeof workspace.useCaseId).toBe('string');
        expect(typeof workspace.label).toBe('string');
        expect(typeof workspace.kickoff).toBe('string');
      }
    });

    it('fails soft with {businessType:null, workspaces:[]} when the profile lookup throws', async () => {
      mockGetOnboardingStatus.mockRejectedValue(new Error('MCP unreachable'));

      const response = await request(app).get('/api/acumen/workspaces');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ businessType: null, workspaces: [] });
    });
  });

  describe('GET /active', () => {
    const conversationId = 'conv-active-lens';

    it('returns the sticky use case for the conversation after it has been set', async () => {
      mockGetOnboardingStatus.mockResolvedValue(statusWith('executive_search'));
      await acumenContextPart(
        { id: 'test-user-123' },
        'alert me when these CFOs change roles',
        conversationId,
      );

      const response = await request(app)
        .get('/api/acumen/active')
        .query({ conversationId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        businessType: 'executive-search',
        useCaseId: 'signal-tracking',
      });
    });

    it('returns useCaseId:null when nothing is sticky for the conversation', async () => {
      mockGetOnboardingStatus.mockResolvedValue(statusWith('recruitment_agency'));

      const response = await request(app)
        .get('/api/acumen/active')
        .query({ conversationId: 'conv-with-no-sticky-entry' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ businessType: 'recruitment-agencies', useCaseId: null });
    });

    it('returns useCaseId:null when conversationId is missing from the query', async () => {
      mockGetOnboardingStatus.mockResolvedValue(statusWith('recruitment_agency'));

      const response = await request(app).get('/api/acumen/active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ businessType: 'recruitment-agencies', useCaseId: null });
    });

    it('fails soft with {businessType:null, useCaseId:null} when profile resolution throws', async () => {
      mockGetOnboardingStatus.mockRejectedValue(new Error('MCP unreachable'));

      const response = await request(app)
        .get('/api/acumen/active')
        .query({ conversationId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ businessType: null, useCaseId: null });
    });
  });
});
