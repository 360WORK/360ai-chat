'use strict';

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { deliverSignalsForUser, callSignalTool } = require('../services/SignalsDelivery');

const router = express.Router();
router.use(requireJwtAuth);

/** Map a snake_case signal (from get_signal_runs) to the camelCase TSignal. */
function toSignal(s) {
  if (!s) {
    return null;
  }
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    isActive: !!s.is_active,
    nextRunAt: s.next_run_at ?? null,
    lastRunAt: s.last_run_at ?? null,
  };
}

/**
 * POST /signals/sync
 * Deliver any new signal-run digests into the authenticated user's dedicated
 * "Signals" conversation. Always returns `{ delivered }`; never throws.
 */
router.post('/sync', async (req, res) => {
  try {
    const { delivered } = await deliverSignalsForUser(req.user);
    return res.json({ delivered });
  } catch (err) {
    return res.json({ delivered: 0 });
  }
});

/**
 * GET /signals
 * List the authenticated user's signals (owned + subscribed).
 */
router.get('/', async (req, res) => {
  try {
    const raw = await callSignalTool(req.user, 'get_signal_runs', {});
    const signals = Array.isArray(raw?.signals) ? raw.signals.map(toSignal).filter(Boolean) : [];
    return res.json({ signals });
  } catch (err) {
    return res.json({ signals: [] });
  }
});

/**
 * POST /signals
 * Create a signal. Body is the TSignalCreateInput; forwarded as signal_json.
 */
router.post('/', async (req, res) => {
  try {
    const created = await callSignalTool(req.user, 'create_signal', {
      signal_json: JSON.stringify(req.body ?? {}),
    });
    if (!created || !created.id) {
      return res.status(422).json({
        error: typeof created === 'string' ? created : 'Could not create signal.',
      });
    }
    return res.status(201).json({
      id: created.id,
      name: created.name,
      type: created.type,
      nextRunAt: created.next_run_at ?? null,
      isActive: !!created.is_active,
    });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'Could not create signal.' });
  }
});

/**
 * POST /signals/:id/run
 * Run a signal now (manual).
 */
router.post('/:id/run', async (req, res) => {
  try {
    const raw = await callSignalTool(req.user, 'run_signal_now', {
      signal_id: req.params.id,
    });
    if (!raw || !raw.signal_id) {
      return res.status(422).json({
        error: typeof raw === 'string' ? raw : 'Could not run signal.',
      });
    }
    return res.json({
      signalId: raw.signal_id,
      signalRunId: raw.signal_run_id ?? null,
      status: raw.status ?? null,
      summaryExcerpt: raw.summary_excerpt ?? null,
    });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'Could not run signal.' });
  }
});

/**
 * DELETE /signals/:id
 * Delete a signal the user owns.
 */
router.delete('/:id', async (req, res) => {
  try {
    await callSignalTool(req.user, 'delete_signal', { signal_id: req.params.id });
    return res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    return res.status(422).json({ error: err?.message || 'Could not delete signal.' });
  }
});

module.exports = router;
