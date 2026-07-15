import {
  digestMessageId,
  formatDigest,
  deliverNewSignalRuns,
  type SignalsDeliveryDeps,
} from './delivery';
import type { TSignalRun, TSignalRunsToolResult } from './dto';

const run = (over: Partial<TSignalRun>): TSignalRun => ({
  id: 'run-1',
  signalId: 'sig-1',
  signalName: 'Weekly briefing',
  status: 'succeeded',
  summary: '## Open jobs\n3 new roles.',
  createdAt: '2026-06-23T10:00:00Z',
  ...over,
});

describe('formatDigest', () => {
  it('returns the summary as text and a deterministic messageId', () => {
    const out = formatDigest(run({ id: 'abc' }));
    expect(out).not.toBeNull();
    expect(out!.text).toBe('## Open jobs\n3 new roles.');
    expect(out!.messageId).toBe(digestMessageId('abc'));
  });

  it('produces a stable messageId for the same runId across calls', () => {
    expect(digestMessageId('run-x')).toBe(digestMessageId('run-x'));
    expect(digestMessageId('run-x')).not.toBe(digestMessageId('run-y'));
  });

  it('returns null for no_change and empty-summary runs (not deliverable)', () => {
    expect(formatDigest(run({ status: 'no_change', summary: null }))).toBeNull();
    expect(formatDigest(run({ summary: '   ' }))).toBeNull();
    expect(formatDigest(run({ summary: '' }))).toBeNull();
  });

  it('trims surrounding whitespace from the summary', () => {
    const out = formatDigest(run({ summary: '  hello  ' }));
    expect(out!.text).toBe('hello');
  });

  it('does not append a signal-digest marker to the stored text', () => {
    const out = formatDigest(run({ id: 'abc', summary: 'plain summary' }));
    expect(out!.text).not.toContain('<!--signal-digest');
  });
});

describe('deliverNewSignalRuns', () => {
  const makeDeps = (over: Partial<SignalsDeliveryDeps> = {}): SignalsDeliveryDeps => {
    const saved: Array<{ messageId: string; text: string }> = [];
    return {
      fetchRuns: async () => ({ signals: [], runs: [] }),
      resolveConversationId: async () => 'convo-signals',
      existingMessageIds: async () => new Set<string>(),
      saveMessage: async (_u, _c, message) => {
        saved.push(message);
        return message;
      },
      ...over,
    };
  };

  const toolResult = (runs: TSignalRun[]): TSignalRunsToolResult => ({
    signals: [],
    runs: runs.map((r) => ({
      id: r.id,
      signal_id: r.signalId,
      signal_name: r.signalName,
      status: r.status,
      summary: r.summary,
      created_at: r.createdAt,
    })),
  });

  it('saves one message per deliverable run', async () => {
    const saved: string[] = [];
    const deps = makeDeps({
      fetchRuns: async () =>
        toolResult([run({ id: 'r1', summary: 'first' }), run({ id: 'r2', summary: 'second' })]),
      saveMessage: async (_u, _c, m) => {
        saved.push(m.text);
      },
    });
    const res = await deliverNewSignalRuns({ id: 'u1' }, deps);
    expect(res).toEqual({ delivered: 2 });
    expect(saved).toHaveLength(2);
    expect(saved.some((t) => t.includes('first'))).toBe(true);
    expect(saved.some((t) => t.includes('second'))).toBe(true);
    expect(saved.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
  });

  it('skips runs already delivered (idempotent via messageId)', async () => {
    const deps = makeDeps({
      fetchRuns: async () =>
        toolResult([run({ id: 'r1', summary: 'first' }), run({ id: 'r2', summary: 'second' })]),
      existingMessageIds: async () => new Set([digestMessageId('r1')]),
    });
    const res = await deliverNewSignalRuns({ id: 'u1' }, deps);
    expect(res).toEqual({ delivered: 1 });
  });

  it('filters out non-deliverable runs before saving', async () => {
    const deps = makeDeps({
      fetchRuns: async () =>
        toolResult([
          run({ id: 'r1', summary: 'good' }),
          run({ id: 'r2', status: 'no_change', summary: null }),
          run({ id: 'r3', summary: '' }),
        ]),
    });
    const res = await deliverNewSignalRuns({ id: 'u1' }, deps);
    expect(res).toEqual({ delivered: 1 });
  });

  it('saves oldest-first so the thread is chronological', async () => {
    const order: string[] = [];
    const deps = makeDeps({
      fetchRuns: async () =>
        // tool returns latest-first (r2 newer than r1)
        toolResult([run({ id: 'r2', summary: 'newer' }), run({ id: 'r1', summary: 'older' })]),
      saveMessage: async (_u, _c, m) => {
        order.push(m.text);
      },
    });
    await deliverNewSignalRuns({ id: 'u1' }, deps);
    expect(order[0]).toContain('older');
    expect(order[1]).toContain('newer');
  });

  it('returns {delivered:0} and never throws when fetch fails', async () => {
    const deps = makeDeps({
      fetchRuns: async () => {
        throw new Error('MCP down');
      },
    });
    await expect(deliverNewSignalRuns({ id: 'u1' }, deps)).resolves.toEqual({
      delivered: 0,
    });
  });

  it('returns {delivered:0} when conversation resolution fails', async () => {
    const deps = makeDeps({
      fetchRuns: async () => toolResult([run({ id: 'r1', summary: 'x' })]),
      resolveConversationId: async () => {
        throw new Error('no convo');
      },
    });
    await expect(deliverNewSignalRuns({ id: 'u1' }, deps)).resolves.toEqual({
      delivered: 0,
    });
  });

  it('continues past a single failed save (best-effort)', async () => {
    const saved: string[] = [];
    const deps = makeDeps({
      fetchRuns: async () =>
        toolResult([run({ id: 'r1', summary: 'first' }), run({ id: 'r2', summary: 'second' })]),
      saveMessage: async (_u, _c, m) => {
        if (m.text.includes('first')) {
          throw new Error('persist failed');
        }
        saved.push(m.text);
      },
    });
    const res = await deliverNewSignalRuns({ id: 'u1' }, deps);
    expect(res).toEqual({ delivered: 1 });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain('second');
  });
});
