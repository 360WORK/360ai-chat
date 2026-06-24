'use strict';

const express = require('express');
const { workspacesMetaFor, composeSystemPrompt } = require('@librechat/api');
const { resolveProfile } = require('../controllers/agents/acumen');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

/**
 * Shared secret used by the Laravel signal worker to compose the Acumen prompt
 * for a signal run (service-to-service; Laravel has no chat user JWT). Set
 * ACUMEN_COMPOSE_TOKEN in both apps' .env. When unset, the endpoint 503s so it
 * fails closed rather than leaving an open prompt-composition endpoint.
 */
const COMPOSE_TOKEN = process.env.ACUMEN_COMPOSE_TOKEN;
function requireComposeToken(req, res, next) {
  const provided = req.get('x-acumen-token');
  if (!COMPOSE_TOKEN || provided !== COMPOSE_TOKEN) {
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
router.post('/compose', requireComposeToken, async (req, res) => {
  try {
    const { businessType = null, userContext = null, brief = null } = req.body || {};
    if (!brief && !businessType) {
      return res.status(400).json({ error: 'brief or businessType required' });
    }
    const composed = composeSystemPrompt({ businessType, userContext, brief });
    return res.json({ prompt: composed.prompt, useCaseId: composed.selectedUseCase });
  } catch (err) {
    // Fail soft: return an empty prompt so the caller falls back gracefully.
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
    return res.json({ businessType: null, workspaces: [] });
  }
});

module.exports = router;
