'use strict';

const express = require('express');
const request = require('supertest');

const mockCallSignalTool = jest.fn();
const mockDeliverSignalsForUser = jest.fn();

jest.mock('~/server/services/SignalsDelivery', () => ({
  callSignalTool: (...args) => mockCallSignalTool(...args),
  deliverSignalsForUser: (...args) => mockDeliverSignalsForUser(...args),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (_req, _res, next) => next(),
}));

const SIGNALS_UNREACHABLE_ERROR =
  'Could not reach the signals service. If this persists, try logging out and back in.';

const RAW_SIGNAL = {
  id: 'sig-1',
  name: 'Fintech moves',
  type: 'market',
  is_active: 1,
  next_run_at: '2026-07-16T09:00:00Z',
  last_run_at: '2026-07-15T09:00:00Z',
  cadence_cron: '0 9 * * *',
  prompt_template: 'Track fintech leadership moves',
};

const MAPPED_SIGNAL = {
  id: 'sig-1',
  name: 'Fintech moves',
  type: 'market',
  isActive: true,
  nextRunAt: '2026-07-16T09:00:00Z',
  lastRunAt: '2026-07-15T09:00:00Z',
  cadenceCron: '0 9 * * *',
  promptTemplate: 'Track fintech leadership moves',
};

describe('Signals Routes', () => {
  let app;
  let currentUser;
  let userCounter = 0;

  beforeAll(() => {
    const signalsRouter = require('../signals');

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = currentUser;
      next();
    });
    app.use('/api/signals', signalsRouter);
  });

  beforeEach(() => {
    /** Unique user per test so the module-level 4s runs-list cache never bleeds between tests. */
    userCounter += 1;
    currentUser = { id: `test-user-${userCounter}` };
  });

  describe('GET /', () => {
    it('maps snake_case tool results to camelCase TSignal fields and filters null entries', async () => {
      mockCallSignalTool.mockResolvedValue({ signals: [RAW_SIGNAL, null] });

      const response = await request(app).get('/api/signals');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signals: [MAPPED_SIGNAL] });
      expect(mockCallSignalTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
        'get_signal_runs',
        {},
      );
    });

    it('returns an empty list when the tool result has no signals array', async () => {
      mockCallSignalTool.mockResolvedValue({ signals: 'unexpected' });

      const response = await request(app).get('/api/signals');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signals: [] });
    });

    it('returns 502 with the unreachable message (not an empty list) when the tool call throws', async () => {
      mockCallSignalTool.mockRejectedValue(new Error('OIDC token expired: internal detail'));

      const response = await request(app).get('/api/signals');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ error: SIGNALS_UNREACHABLE_ERROR });
      expect(JSON.stringify(response.body)).not.toContain('internal detail');
    });
  });

  describe('GET /run/:runId', () => {
    const RAW_RUN = {
      id: 'run-1',
      status: 'completed',
      summary: 'Found 3 moves',
      created_at: '2026-07-15T08:00:00Z',
    };

    it('returns the run status, summary, and createdAt when the run is present', async () => {
      mockCallSignalTool.mockResolvedValue({ runs: [{ id: 'other' }, RAW_RUN] });

      const response = await request(app).get('/api/signals/run/run-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'completed',
        summary: 'Found 3 moves',
        createdAt: '2026-07-15T08:00:00Z',
      });
      expect(mockCallSignalTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
        'get_signal_runs',
        {},
      );
    });

    it('returns 404 when the run is not in the runs list', async () => {
      mockCallSignalTool.mockResolvedValue({ runs: [{ id: 'other' }] });

      const response = await request(app).get('/api/signals/run/run-missing');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Run not found.' });
    });

    it('returns 502 with the unreachable message when the upstream fetch throws', async () => {
      mockCallSignalTool.mockRejectedValue(new Error('MCP transport closed'));

      const response = await request(app).get('/api/signals/run/run-1');

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ error: SIGNALS_UNREACHABLE_ERROR });
    });

    it('coalesces immediate polls through the 4s per-user cache (one upstream fetch)', async () => {
      mockCallSignalTool.mockResolvedValue({ runs: [RAW_RUN] });

      const first = await request(app).get('/api/signals/run/run-1');
      const second = await request(app).get('/api/signals/run/run-1');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(mockCallSignalTool).toHaveBeenCalledTimes(1);
    });

    it('does not cache upstream failures — the next poll refetches', async () => {
      mockCallSignalTool
        .mockRejectedValueOnce(new Error('transient failure'))
        .mockResolvedValueOnce({ runs: [RAW_RUN] });

      const failed = await request(app).get('/api/signals/run/run-1');
      const retried = await request(app).get('/api/signals/run/run-1');

      expect(failed.status).toBe(502);
      expect(retried.status).toBe(200);
      expect(mockCallSignalTool).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /', () => {
    const CREATE_BODY = { name: 'Fintech moves', type: 'market', prompt: 'Track moves' };

    it('returns 201 with the mapped signal on success', async () => {
      mockCallSignalTool.mockResolvedValue({
        id: 'sig-9',
        name: 'Fintech moves',
        type: 'market',
        next_run_at: '2026-07-16T09:00:00Z',
        is_active: true,
      });

      const response = await request(app).post('/api/signals').send(CREATE_BODY);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'sig-9',
        name: 'Fintech moves',
        type: 'market',
        nextRunAt: '2026-07-16T09:00:00Z',
        isActive: true,
      });
      expect(mockCallSignalTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
        'create_signal',
        { signal_json: JSON.stringify(CREATE_BODY) },
      );
    });

    it('returns a generic 422 when the tool returns an error string instead of a signal', async () => {
      mockCallSignalTool.mockResolvedValue('Error: quota exceeded for tenant 42');

      const response = await request(app).post('/api/signals').send(CREATE_BODY);

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: 'Could not create signal.' });
      expect(JSON.stringify(response.body)).not.toContain('quota exceeded');
    });

    it('returns a generic 422 without leaking the raw upstream error when the tool throws', async () => {
      mockCallSignalTool.mockRejectedValue(new Error('SECRET internal stack detail'));

      const response = await request(app).post('/api/signals').send(CREATE_BODY);

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: 'Could not create signal.' });
      expect(JSON.stringify(response.body)).not.toContain('SECRET');
    });
  });

  describe('POST /:id/run', () => {
    it('returns the mapped run info on success', async () => {
      mockCallSignalTool.mockResolvedValue({
        signal_id: 'sig-1',
        signal_run_id: 'run-7',
        status: 'queued',
        summary_excerpt: null,
      });

      const response = await request(app).post('/api/signals/sig-1/run');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        signalId: 'sig-1',
        signalRunId: 'run-7',
        status: 'queued',
        summaryExcerpt: null,
      });
      expect(mockCallSignalTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
        'run_signal_now',
        { signal_id: 'sig-1' },
      );
    });

    it('returns a generic 422 when the tool throws', async () => {
      mockCallSignalTool.mockRejectedValue(new Error('upstream exploded'));

      const response = await request(app).post('/api/signals/sig-1/run');

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: 'Could not run signal.' });
      expect(JSON.stringify(response.body)).not.toContain('upstream exploded');
    });
  });

  describe('POST /sync', () => {
    it('returns the delivered count on success', async () => {
      mockDeliverSignalsForUser.mockResolvedValue({ delivered: 3 });

      const response = await request(app).post('/api/signals/sync');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ delivered: 3 });
      expect(mockDeliverSignalsForUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
      );
    });

    it('returns 200 {delivered:0} (never throws) when delivery fails', async () => {
      mockDeliverSignalsForUser.mockRejectedValue(new Error('conversation claim conflict'));

      const response = await request(app).post('/api/signals/sync');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ delivered: 0 });
    });
  });

  describe('DELETE /:id', () => {
    it('returns {deleted:true, id} on success', async () => {
      mockCallSignalTool.mockResolvedValue({ status: 'deleted' });

      const response = await request(app).delete('/api/signals/sig-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: true, id: 'sig-1' });
      expect(mockCallSignalTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
        'delete_signal',
        { signal_id: 'sig-1' },
      );
    });

    it('returns a generic 422 when the tool throws', async () => {
      mockCallSignalTool.mockRejectedValue(new Error('not the owner: user 999'));

      const response = await request(app).delete('/api/signals/sig-1');

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: 'Could not delete signal.' });
      expect(JSON.stringify(response.body)).not.toContain('user 999');
    });
  });

  describe('PATCH /:id', () => {
    const UPDATE_BODY = { name: 'Renamed signal' };

    it('returns the mapped updated signal on success', async () => {
      mockCallSignalTool.mockResolvedValue({
        id: 'sig-1',
        name: 'Renamed signal',
        type: 'market',
        next_run_at: null,
        is_active: 0,
      });

      const response = await request(app).patch('/api/signals/sig-1').send(UPDATE_BODY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'sig-1',
        name: 'Renamed signal',
        type: 'market',
        nextRunAt: null,
        isActive: false,
      });
      expect(mockCallSignalTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: currentUser.id }),
        'update_signal',
        { signal_id: 'sig-1', signal_json: JSON.stringify(UPDATE_BODY) },
      );
    });

    it('returns a generic 422 when the tool result has no id', async () => {
      mockCallSignalTool.mockResolvedValue({ error: 'validation failed on cadence_cron' });

      const response = await request(app).patch('/api/signals/sig-1').send(UPDATE_BODY);

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: 'Could not update signal.' });
    });

    it('returns a generic 422 without leaking the raw error when the tool throws', async () => {
      mockCallSignalTool.mockRejectedValue(new Error('pdo exception: duplicate key'));

      const response = await request(app).patch('/api/signals/sig-1').send(UPDATE_BODY);

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: 'Could not update signal.' });
      expect(JSON.stringify(response.body)).not.toContain('pdo exception');
    });
  });
});
