import type { LayerRecord } from '../../types';

export const signalTracking: LayerRecord = {
  id: 'core:signal-tracking',
  kind: 'core',
  version: '1.0.0',
  body: 'Method for monitoring chosen subjects for events worth acting on, and surfacing them ranked when they happen. Watch subjects: people (talent), companies, and live jobs — each with its own signal vocabulary. Set a sensitivity floor, deduplicate within the cadence window, apply a volume cap per digest, and drop signals past the staleness threshold. Each digest ends with watch controls, not a one-off handoff.',
  fields: {
    thresholds: { volumeCap: 20, dedupeWindowDays: 7 },
  },
};
