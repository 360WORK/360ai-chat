import type { LayerRecord } from '../../types';

export const talentMapping: LayerRecord = {
  id: 'core:talent-mapping',
  kind: 'core',
  version: '1.0.0',
  body: 'Method for building a qualified, ranked list of people for a role or mandate. Work entity-first: define the target companies and tiers before extracting people from them. Score on fit, value and seniority, and movement likelihood. Apply tiering from the profile. Confirm the working set at a mid-point steer before scoring people. End with a ranked, off-limits-clean list ready for outreach.',
  fields: {
    thresholds: { longlist: 20, shortlist: 8 },
  },
};
