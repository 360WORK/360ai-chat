import type { LayerRecord } from '../../types';

export const enterpriseTalentMarketMapping: LayerRecord = {
  id: 'lens:enterprise-talent×market-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'The competitive talent market for a function — where talent concentrates, what it costs by location, how the enterprise compares to peers. Intelligence for strategy, not a sourcing list.',
  fields: {
    openingCopy: "Market mapping for workforce strategy. Tell me the function and I'll map where talent concentrates, what it costs, and how your organisation compares to peers.",
    starters: [
      'Map the ML engineering market vs our footprint',
      'How does our employer brand compare to competitors in EMEA',
      'Where does senior product talent concentrate globally',
    ],
    outputAdditions: [
      'comp and location/cost distribution',
      'competitor growth and hiring intensity',
      'diversity benchmark versus peers',
      'concentration by region',
      'where to build — decision-ready framing',
    ],
  },
};
