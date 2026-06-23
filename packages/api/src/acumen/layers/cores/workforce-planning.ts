import type { LayerRecord } from '../../types';

export const workforcePlanning: LayerRecord = {
  id: 'core:workforce-planning',
  kind: 'core',
  version: '1.0.0',
  body: 'Method for forecasting future hiring need and turning it into a phased, feasible plan. Start from demand (growth targets, attrition, current headcount), net against internal supply through mobility and promotion, split the gap into build/buy/borrow, then test feasibility against the external market. Model scenarios — at minimum conservative, expected and stretch — never a single false-precision figure. Flag risk and sequencing so hiring starts early on the hardest roles.',
  fields: {
    thresholds: { scenarioCount: 3 },
  },
};
