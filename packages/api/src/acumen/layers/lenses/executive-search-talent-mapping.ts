import type { LayerRecord } from '../../types';

export const executiveSearchTalentMapping: LayerRecord = {
  id: 'lens:executive-search×talent-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'Tight, qualified longlist for a retained mandate: calibre and board-readiness over volume, off-limits-clean, diverse slate, handled discreetly.',
  fields: {
    openingCopy: "Talent mapping for the mandate. Give me the role and the client, and I'll map a tight, qualified longlist of leaders, clean of off-limits, with a diverse slate.",
    starters: [
      'CFO longlist for a PE-backed SaaS scale-up, confidential',
      "Map the CPO market across our client's direct competitors",
      'Board-ready CMOs in European consumer health',
    ],
    thresholds: { longlist: 12, shortlist: 7 },
    outputAdditions: [
      'calibre read (scope, track record)',
      'board-readiness',
      'off-limits status',
      'diversity dimension where relevant',
      'discreet approach note',
    ],
  },
  hardConstraints: {
    offLimits: [
      'firm-level off-limits companies (recent placements under protection)',
      'client hands-off companies',
    ],
    guardrails: [
      'treat the search as confidential by default',
      'surface the conflict — do not expose the mandate unless the user confirms it is open',
    ],
  },
};
