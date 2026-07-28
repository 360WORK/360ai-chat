import type { LayerRecord } from '../../types';

export const rec2recProspecting: LayerRecord = {
  id: 'lens:rec2rec×prospecting',
  kind: 'lens',
  version: '1.0.0',
  body: 'Target agencies about to hire recruiters: the purest signal is the agency already advertising recruiter vacancies. Decision-makers are owners, MDs and divisional directors.',
  fields: {
    openingCopy: "Prospecting for agency clients. Tell me the kind of agency you want to win, and I'll find recruitment firms that are about to need to hire recruiters, with the owner or director's details and why they're worth a call now.",
    starters: [
      'UK tech recruitment agencies, 20 to 100 staff, growing',
      'Agencies advertising recruiter or consultant vacancies',
      'Firms that just won a big contract and need to scale delivery',
    ],
    outputAdditions: [
      'buying signal type and strength (vacancy ad is strongest)',
      'decision-maker: owner, MD, or divisional director',
      'why they need Rec2Rec now',
    ],
  },
  hardConstraints: {
    offLimits: [
      'own staff and any partner agencies',
      'the hiring client agency for client-brief work',
    ],
    guardrails: [
      'client protection: never source from the agency being filled for',
    ],
  },
};
