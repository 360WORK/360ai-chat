'use strict';

const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { logger } = require('@librechat/data-schemas');
const {
  removePorts,
  limiterCache,
  workspacesMetaFor,
  composeSystemPrompt,
  normalizeBusinessType,
} = require('@librechat/api');
const { resolveProfile } = require('../controllers/agents/acumen');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const { ACUMEN_COMPOSE_WINDOW = 1, ACUMEN_COMPOSE_MAX = 30 } = process.env;
const composeLimiter = rateLimit({
  windowMs: ACUMEN_COMPOSE_WINDOW * 60 * 1000,
  max: ACUMEN_COMPOSE_MAX,
  keyGenerator: removePorts,
  store: limiterCache('acumen_compose_limiter'),
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many compose requests, please try again later.' }),
});

const MAX_TEXT_LENGTH = 10000;
const MAX_TYPE_LENGTH = 200;

function invalidText(value, max) {
  return value != null && (typeof value !== 'string' || value.length > max);
}

/**
 * Shared secret used by the Laravel signal worker to compose the Acumen prompt
 * for a signal run (service-to-service; Laravel has no chat user JWT). Set
 * ACUMEN_COMPOSE_TOKEN in both apps' .env. When unset, the endpoint 503s so it
 * fails closed rather than leaving an open prompt-composition endpoint.
 */
function tokensMatch(provided, expected) {
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function requireComposeToken(req, res, next) {
  const composeToken = process.env.ACUMEN_COMPOSE_TOKEN;
  if (!composeToken) {
    return res.status(503).json({ error: 'Compose endpoint not configured' });
  }
  const provided = req.get('x-acumen-token');
  if (!provided || !tokensMatch(provided, composeToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /acumen/compose  (shared-secret, NOT user JWT)
 * Compose the Acumen system prompt for a signal run. Pure function of inputs:
 *   { businessType?, userContext?, brief? } -> { prompt, useCaseId }
 * The Laravel signal agent calls this before its agent loop so the signal runs
 * with the SAME Acumen intelligence (foundations + routed core + profile + lens
 * + tool routing) as the chat agent — single source of truth, no duplication.
 * Fallbacks gracefully (any failure -> 200 with useCaseId:null) so the caller
 * can still proceed with a generic prompt.
 */
router.post('/compose', composeLimiter, requireComposeToken, async (req, res) => {
  try {
    const { businessType = null, userContext = null, brief = null } = req.body || {};
    if (!brief && !businessType) {
      return res.status(400).json({ error: 'brief or businessType required' });
    }
    if (
      invalidText(brief, MAX_TEXT_LENGTH) ||
      invalidText(userContext, MAX_TEXT_LENGTH) ||
      invalidText(businessType, MAX_TYPE_LENGTH)
    ) {
      return res
        .status(400)
        .json({ error: 'brief, userContext, and businessType must be strings within size limits' });
    }
    const composed = composeSystemPrompt({
      businessType: normalizeBusinessType(businessType) ?? businessType,
      userContext,
      brief,
    });
    return res.json({ prompt: composed.prompt, useCaseId: composed.selectedUseCase });
  } catch (err) {
    // Fail soft: return an empty prompt so the caller falls back gracefully.
    logger.warn('[POST /acumen/compose] Failed to compose system prompt:', err);
    return res.json({ prompt: null, useCaseId: null });
  }
});

// User-authenticated routes below.
router.use(requireJwtAuth);

/**
 * GET /acumen/workspaces
 * Returns the authenticated user's business type and their available AI workspaces.
 */
router.get('/workspaces', async (req, res) => {
  try {
    const { businessType } = await resolveProfile(req.user);
    if (!businessType) {
      return res.json({ businessType: null, workspaces: [] });
    }
    return res.json({ businessType, workspaces: workspacesMetaFor(businessType) });
  } catch (err) {
    logger.warn('[GET /acumen/workspaces] Failed to resolve workspaces:', err);
    return res.json({ businessType: null, workspaces: [] });
  }
});

module.exports = router;
