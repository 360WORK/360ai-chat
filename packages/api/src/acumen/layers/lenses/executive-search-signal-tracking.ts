import type { LayerRecord } from '../../types';

export const executiveSearchSignalTracking: LayerRecord = {
  id: 'lens:executive-search×signal-tracking',
  kind: 'lens',
  version: '1.0.0',
  body: 'Every leadership signal is read two ways: candidate signal (leader may be in motion) and mandate signal (company has a gap to fill). The off-limits flip: a signal at an off-limits firm suppresses the candidate side but preserves the mandate side.',
  fields: {
    openingCopy: "Signal tracking for leadership moves and mandate opportunities. Set a watch on companies or leaders, and I'll surface events that open candidates or create mandates.",
    starters: [
      'Watch our top 20 target companies for leadership moves',
      'Alert me when a CFO exits any PE-backed SaaS in Europe',
      "Track off-limits expiry on companies we've placed into",
    ],
    thresholds: { volumeCap: 10, dedupeWindowDays: 14 },
    outputAdditions: [
      'dual read: candidate signal + mandate signal',
      'off-limits flip flagged on each signal',
      'trigger type and source',
      'recommended action per signal',
    ],
  },
};
