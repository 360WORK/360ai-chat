'use strict';

const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { deliverSignalsForUser, callSignalTool } = require('../services/SignalsDelivery');

const SIGNALS_UNREACHABLE_ERROR =
  'Could not reach the signals service. If this persists, try logging out and back in.';

const RUNS_CACHE_TTL_MS = 4000;
const RUNS_CACHE_MAX_USERS = 500;
/**
 * Tiny per-user cache for the upstream runs-list fetch used by the run-status
 * poll. The client polls GET /run/:runId on an interval; without this every
 * tick refetches the user's entire get_signal_runs list from the MCP server.
 * Caching the in-flight promise also coalesces concurrent ticks.
 *
 * @type {Map<string, { at: number; promise: Promise<object> }>}
 */
const runsListCache = new Map();

/** Fetch the user's runs list with a short-lived per-user cache. */
function fetchRunsList(user) {
  const now = Date.now();
  const cached = runsListCache.get(user.id);
  if (cached && now - cached.at < RUNS_CACHE_TTL_MS) {
    return cached.promise;
  }
  const entry = { at: now, promise: callSignalTool(user, 'get_signal_runs', {}) };
  entry.promise.catch(() => {
    if (runsListCache.get(user.id) === entry) {
      runsListCache.delete(user.id);
    }
  });
  runsListCache.set(user.id, entry);
  if (runsListCache.size > RUNS_CACHE_MAX_USERS) {
    const oldestKey = runsListCache.keys().next().value;
    runsListCache.delete(oldestKey);
  }
  return entry.promise;
}

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
    cadenceCron: s.cadence_cron ?? null,
    promptTemplate: s.prompt_template ?? null,
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
    logger.warn('[POST /signals/sync] Failed to deliver signal digests:', err);
    return res.json({ delivered: 0 });
  }
});

/**
 * GET /signals
 * List the authenticated user's signals (owned + subscribed).
 * Returns 502 (not an empty list) when the upstream MCP call fails, so the
 * client can surface a real error (e.g. expired OIDC token) instead of
 * silently looking empty.
 */
router.get('/', async (req, res) => {
  try {
    const raw = await callSignalTool(req.user, 'get_signal_runs', {});
    const signals = Array.isArray(raw?.signals) ? raw.signals.map(toSignal).filter(Boolean) : [];
    return res.json({ signals });
  } catch (err) {
    logger.warn('[GET /signals] Failed to list signals:', err);
    return res.status(502).json({ error: SIGNALS_UNREACHABLE_ERROR });
  }
});

/**
 * GET /signals/run/:runId
 * A specific run by id (status + summary). The client polls THIS run after
 * clicking Run now (the run id is returned synchronously by run_signal_now)
 * until it reaches a terminal status. Reuses get_signal_runs.
 */
router.get('/run/:runId', async (req, res) => {
  try {
    const raw = await fetchRunsList(req.user);
    const runs = Array.isArray(raw?.runs) ? raw.runs : [];
    const run = runs.find((r) => r && r.id === req.params.runId);
    if (!run) {
      // Run may not yet appear in the latest-25 window right after creation.
      return res.status(404).json({ error: 'Run not found.' });
    }
    return res.json({
      status: run.status,
      summary: run.summary ?? null,
      createdAt: run.created_at ?? null,
    });
  } catch (err) {
    logger.warn('[GET /signals/run/:runId] Failed to load signal run:', err);
    return res.status(502).json({ error: SIGNALS_UNREACHABLE_ERROR });
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
      logger.warn('[POST /signals] Unexpected create_signal result:', created);
      return res.status(422).json({ error: 'Could not create signal.' });
    }
    return res.status(201).json({
      id: created.id,
      name: created.name,
      type: created.type,
      nextRunAt: created.next_run_at ?? null,
      isActive: !!created.is_active,
    });
  } catch (err) {
    logger.warn('[POST /signals] Failed to create signal:', err);
    return res.status(422).json({ error: 'Could not create signal.' });
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
      logger.warn('[POST /signals/:id/run] Unexpected run_signal_now result:', raw);
      return res.status(422).json({ error: 'Could not run signal.' });
    }
    return res.json({
      signalId: raw.signal_id,
      signalRunId: raw.signal_run_id ?? null,
      status: raw.status ?? null,
      summaryExcerpt: raw.summary_excerpt ?? null,
    });
  } catch (err) {
    logger.warn('[POST /signals/:id/run] Failed to run signal:', err);
    return res.status(422).json({ error: 'Could not run signal.' });
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
    logger.warn('[DELETE /signals/:id] Failed to delete signal:', err);
    return res.status(422).json({ error: 'Could not delete signal.' });
  }
});

/**
 * PATCH /signals/:id
 * Partial update of a signal the user owns. Body is the TSignalUpdateInput.
 */
router.patch('/:id', async (req, res) => {
  try {
    const raw = await callSignalTool(req.user, 'update_signal', {
      signal_id: req.params.id,
      signal_json: JSON.stringify(req.body ?? {}),
    });
    if (!raw || !raw.id) {
      logger.warn('[PATCH /signals/:id] Unexpected update_signal result:', raw);
      return res.status(422).json({ error: 'Could not update signal.' });
    }
    return res.json({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      nextRunAt: raw.next_run_at ?? null,
      isActive: !!raw.is_active,
    });
  } catch (err) {
    logger.warn('[PATCH /signals/:id] Failed to update signal:', err);
    return res.status(422).json({ error: 'Could not update signal.' });
  }
});

module.exports = router;
