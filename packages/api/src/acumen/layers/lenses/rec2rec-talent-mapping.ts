import type { LayerRecord } from '../../types';

export const rec2recTalentMapping: LayerRecord = {
  id: 'lens:rec2rec×talent-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'Map recruiters agency-first: target agencies by tier, then extract the right billers and managers. Weight freshness heavily — recruiter churn is fast. Value = billings and desk maturity, not years served.',
  fields: {
    openingCopy: "Talent mapping for Rec2Rec. Tell me who you want to map and I'll build it agency-first, so we catch the right recruiters even when their own profiles don't name the niche.",
    starters: [
      'Senior perm recruiters at semiconductor-specialist agencies, UK and Ireland',
      'Contract recruiters with a fintech desk in London',
      'Billing managers at boutique exec-search firms in DACH',
    ],
    outputAdditions: [
      'perm vs contract read',
      'biller vs manager read',
      'desk maturity and transferable network',
      'movement hook (comp ceiling / lost autonomy / agency wobble)',
    ],
  },
};
