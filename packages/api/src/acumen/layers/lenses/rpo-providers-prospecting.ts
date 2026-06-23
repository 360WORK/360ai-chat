import type { LayerRecord } from '../../types';

export const rpoProvidersProspecting: LayerRecord = {
  id: 'lens:rpo-providers×prospecting',
  kind: 'lens',
  version: '1.0.0',
  body: "Companies whose hiring demand outstrips their in-house TA capacity: the capacity gap is the distinctive read for RPO prospecting, not hiring need alone.",
  fields: {
    openingCopy: "Prospecting for RPO clients. Tell me your ideal customer, and I'll find companies whose hiring volume is outpacing their internal TA capacity, with the right buyer's details.",
    starters: [
      'Fast-scaling Series C+ SaaS companies with thin TA teams',
      'Companies with 50+ live roles and no head of TA',
      'Pre-IPO firms scaling across multiple functions simultaneously',
    ],
    outputAdditions: [
      'capacity-gap read (hiring intensity vs TA headcount)',
      'buying signals (volume, speed, TA gap)',
      'decision-maker and contact route',
      'predicted why they need RPO now',
    ],
  },
  hardConstraints: {
    offLimits: ['existing RPO clients and do-not-contact accounts as new prospects'],
    guardrails: [
      "do not prospect in a way that exposes one client's plans to another — flag a cross-client conflict",
    ],
  },
};
