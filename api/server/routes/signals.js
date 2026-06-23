'use strict';

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { deliverSignalsForUser } = require('../services/SignalsDelivery');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * POST /signals/sync
 * Deliver any new signal-run digests into the authenticated user's dedicated
 * "Signals" conversation. Always returns `{ delivered }`; never throws — a
 * delivery failure reports 0 rather than breaking the client.
 */
router.post('/sync', async (req, res) => {
  try {
    const { delivered } = await deliverSignalsForUser(req.user);
    return res.json({ delivered });
  } catch (err) {
    return res.json({ delivered: 0 });
  }
});

module.exports = router;
