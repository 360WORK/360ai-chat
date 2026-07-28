import type { LayerRecord } from '../../types';

export const executiveSearchProspecting: LayerRecord = {
  id: 'lens:executive-search×prospecting',
  kind: 'lens',
  version: '1.0.0',
  body: 'Prospects for retained mandates: companies likely to need a senior or board appointment soon. Note: an off-limits company (where sourcing is restricted) can still be a legitimate mandate prospect — these are separate constraints.',
  fields: {
    openingCopy: "Prospecting for mandates. Tell me the kind of business you want to win work from, and I'll find companies likely to need a senior or board appointment soon, with the right buyer's details and why a search is coming.",
    starters: [
      'PE-backed European SaaS likely to need a CFO',
      'Pre-IPO firms that will need NEDs and board build-out',
      'Companies whose CEO just departed',
    ],
    outputAdditions: [
      'mandate probability and rationale',
      'buying signals (funding, transition, vacancy)',
      'decision-maker with contact route',
      'why a search is coming now',
    ],
  },
  hardConstraints: {
    offLimits: ['existing clients and do-not-contact accounts as prospects'],
    guardrails: [
      'off-limits restricts candidate sourcing, not mandate pitching — distinguish the two',
      'handle confidential situations discreetly',
    ],
  },
};
