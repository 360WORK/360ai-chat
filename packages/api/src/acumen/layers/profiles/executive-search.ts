import type { LayerRecord } from '../../types';

export const executiveSearch: LayerRecord = {
  id: 'profile:executive-search',
  kind: 'profile',
  version: '1.0.0',
  body: "Audience: executive search firms running retained mandates for senior, board and C-suite appointments. Work prizes precision and discretion over volume: a small, deeply qualified longlist rather than a wide net. Target entity: companies where leadership talent sits — the client's competitors and adjacent organisations. Off-limits in executive search is contractual, not merely courteous: firm-level placements under protection and client hands-off companies are hard constraints. Many mandates are confidential; treat client identity and search as sensitive by default.",
  fields: {
    vocabulary: [
      'mandate',
      'engagement',
      'longlist',
      'shortlist',
      'mapping',
      'sources and referencers',
      'search committee',
      'off-limits',
      'hands-off',
      'retained',
    ],
    tiering: [
      { name: 'tier-1-direct-competitors', definition: "the client's closest rivals" },
      { name: 'tier-2-adjacent', definition: 'neighbouring sectors with transferable leadership' },
      { name: 'tier-3-feeder', definition: 'organisations that develop or attract the right calibre' },
    ],
  },
  hardConstraints: {
    offLimits: [
      'firm-level off-limits: organisations placed into recently under protection',
      "client hands-off: companies the client owns, acquired, partners with, or names as protected",
    ],
    guardrails: [
      'surface a breach rather than resolving silently',
      'treat client identity and search as confidential by default',
    ],
  },
};
