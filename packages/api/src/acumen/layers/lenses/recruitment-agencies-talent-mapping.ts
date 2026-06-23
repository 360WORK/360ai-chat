import type { LayerRecord } from '../../types';

export const recruitmentAgenciesTalentMapping: LayerRecord = {
  id: 'lens:recruitment-agencies×talent-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'Candidates ordered by who you can actually place: fit to brief, availability, and client-conflict screen. Tune depth by desk model — contingent rewards speed (smaller shortlist), retained rewards a fuller map.',
  fields: {
    openingCopy: "Talent mapping for your desk. Tell me the brief, or the client and role, and I'll map the right candidates, screen out anyone off-limits, and order them by who you can actually place.",
    starters: [
      'Mid-level backend engineers for a fintech client in London',
      'Map BD targets: who\'s hiring sales leaders in UK SaaS',
      'Contract data engineers available in the next month',
    ],
    thresholds: { shortlist: 8 },
    outputAdditions: [
      'fit to brief',
      'availability and notice or rate',
      'client-conflict or off-limits flag',
    ],
  },
};
