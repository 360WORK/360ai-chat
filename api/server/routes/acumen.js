'use strict';

const express = require('express');
const { workspacesMetaFor } = require('@librechat/api');
const { resolveProfile } = require('../controllers/agents/acumen');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
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
