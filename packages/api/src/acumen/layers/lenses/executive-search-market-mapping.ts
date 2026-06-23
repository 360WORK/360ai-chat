import type { LayerRecord } from '../../types';

export const executiveSearchMarketMapping: LayerRecord = {
  id: 'lens:executive-search×market-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'The leadership market for a function and level: which companies hold the relevant leaders, how that talent is structured and moves at the top. Handle confidentially where work relates to a live mandate.',
  fields: {
    openingCopy: "Market mapping for the leadership market. Tell me the function, level and sector, and I'll map where the leaders sit, how they move, and how much of the market is open to you.",
    starters: [
      'Map the CFO market for European fintech',
      "Leadership landscape across our client's direct competitors",
      'Where do consumer-health CMOs come from',
    ],
    outputAdditions: [
      'leadership landscape by company',
      'exec-level talent flows',
      'comp and diversity at leadership level',
      'feeder firms',
      'off-limits coverage of the market',
    ],
  },
};
