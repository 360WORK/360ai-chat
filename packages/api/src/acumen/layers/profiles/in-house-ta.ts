import type { LayerRecord } from '../../types';

export const inHouseTa: LayerRecord = {
  id: 'profile:in-house-ta',
  kind: 'profile',
  version: '1.0.0',
  body: "Audience: in-house talent acquisition teams hiring for their own organisation. Target entity: employer companies where target talent currently works — the company's competitors, peers and feeder organisations. The work serves the user's own company only. Employer brand at stake is the user's own reputation. Diversity goals are frequently explicit and central to the brief.",
  fields: {
    vocabulary: [
      'req',
      'pipeline',
      'ATS',
      'sourcing',
      'employer brand',
      'no-poach',
      'in-process',
      'internal mobility',
      'diverse slate',
    ],
    tiering: [
      { name: 'tier-1-direct-competitors', definition: 'companies hiring for and holding the same talent' },
      { name: 'tier-2-adjacent', definition: 'neighbouring sectors with transferable skills' },
      { name: 'tier-3-feeder', definition: 'organisations that train or develop the right talent' },
    ],
  },
  hardConstraints: {
    offLimits: [
      'own current employees (handled through internal mobility)',
      'no-poach and partner agreements',
      'candidates already in process for the company',
    ],
    guardrails: [
      'surface a breach rather than resolving silently',
      "employer brand is the user's own — handle with care",
    ],
  },
};
