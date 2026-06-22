'use strict';

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { getOnboardingStatus, refreshUserClaims } = require('~/server/services/Onboarding');

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
    res.status(502).json({ error: 'Failed to load onboarding status.' });
  }
});

module.exports = router;
