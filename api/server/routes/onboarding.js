'use strict';

const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { invalidateAcumenProfile } = require('~/server/controllers/agents/acumen');
const {
  getOnboardingStatus,
  refreshUserClaims,
  saveOnboardingProfile,
} = require('~/server/services/Onboarding');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * GET /onboarding/status
 * Returns the authenticated user's onboarding status from the 360ai MCP server
 * and refreshes their persisted oidcClaims.
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.user);
    await refreshUserClaims(req.user, status);
    res.json({ onboarding: status });
  } catch (error) {
    logger.warn('[GET /onboarding/status] Failed to load onboarding status:', error);
    res.status(502).json({ error: 'Failed to load onboarding status.' });
  }
});

const VALID_SCOPES = new Set(['company', 'personal']);

/**
 * PUT /onboarding/profile
 * Persists the user's onboarding profile via the 360ai MCP server.
 * Body: { scope: 'company'|'personal', profile: object, tailored_prompts?: unknown }
 */
router.put('/profile', async (req, res) => {
  const { scope, profile, tailored_prompts } = req.body;

  if (!VALID_SCOPES.has(scope)) {
    return res.status(400).json({ error: 'Invalid scope.' });
  }

  try {
    const result = await saveOnboardingProfile(req.user, {
      scope,
      profile,
      tailoredPrompts: tailored_prompts,
    });
    invalidateAcumenProfile(req.user.id);
    res.json(result);
  } catch (error) {
    logger.warn('[PUT /onboarding/profile] Failed to save onboarding profile:', error);
    res.status(502).json({ error: 'Failed to save onboarding profile.' });
  }
});

module.exports = router;
