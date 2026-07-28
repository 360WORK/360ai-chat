import type { LayerRecord } from '../../types';

export const marketMapping: LayerRecord = {
  id: 'core:market-mapping',
  kind: 'core',
  version: '1.0.0',
  body: 'Method for building an analytical picture of a talent or competitive market: who the players are, how the market is structured, where talent concentrates, and where the opportunities and gaps lie. Market mapping studies a set of entities rather than extracting people from it, though it can drill down to people on request. Frame the market before measuring it, measure before concluding, and end with decision-ready insight.',
  fields: {
    thresholds: { entities: 30 },
  },
};
