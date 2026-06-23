import type { LayerRecord } from '../../types';

export const recruitmentAgenciesProspecting: LayerRecord = {
  id: 'lens:recruitment-agencies×prospecting',
  kind: 'lens',
  version: '1.0.0',
  body: "Companies about to need the agency's services: live job postings in the agency's sectors are the most direct buying signal. Prioritise prospects whose hiring need maps to roles the agency can fill.",
  fields: {
    openingCopy: "Prospecting for new clients. Describe your ideal customer, the signals you care about, and the roles you'd fill, and I'll find companies that are about to need you, with the hiring manager's details and why they're worth a call now.",
    starters: [
      'Find Series A to C UK fintechs hiring engineers',
      'Companies that just raised funding and are scaling sales teams',
      'Manufacturers opening a new UK site this year',
    ],
    outputAdditions: [
      'buying signal type and strength',
      'decision-maker with contact route',
      "fit to agency's desk and sector",
    ],
  },
  hardConstraints: {
    offLimits: ['existing clients and do-not-contact accounts as new prospects'],
    guardrails: [
      'surface existing clients as upsell or relationship notes, not cold prospects',
    ],
  },
};
