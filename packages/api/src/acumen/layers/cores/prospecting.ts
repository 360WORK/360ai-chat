import type { LayerRecord } from '../../types';

export const prospecting: LayerRecord = {
  id: 'core:prospecting',
  kind: 'core',
  version: '1.0.0',
  body: 'Method for finding and qualifying prospective clients: map companies matching an ideal customer profile, evidence the buying signals that make them relevant now, identify the decision-makers with contact routes, predict why each will need the service, and present in three tiers. Tier 1 roughly 10–15, Tier 2 roughly 20–30, Tier 3 capped. Signal floor: at least one strong evidenced signal to qualify; Tier 1 needs several.',
  fields: {
    thresholds: { tier1: 12, tier2: 25, tier3: 40 },
  },
};
