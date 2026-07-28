import type { LayerRecord } from '../../types';

export const enterpriseTalentWorkforcePlanning: LayerRecord = {
  id: 'lens:enterprise-talent×workforce-planning',
  kind: 'lens',
  version: '1.0.0',
  body: 'Multi-year workforce strategy across functions and locations, connected to strategic and financial planning. The fullest form of the use case: multi-scenario, multi-location, multi-function.',
  fields: {
    openingCopy: "Workforce planning at enterprise scale. Tell me your planning horizon and scope, and I'll build a phased plan with market feasibility, build/buy/borrow splits, and location recommendations.",
    starters: [
      'Three-year plan for our engineering function in EMEA',
      'Build-buy-borrow across our data science capability',
      'Model our hiring plan under three growth scenarios',
    ],
    outputAdditions: [
      'multi-year multi-location phased plan',
      'build-buy-borrow at portfolio scale',
      'location-strategy recommendation',
      'diversity trajectory',
      'feasibility per location',
    ],
  },
};
