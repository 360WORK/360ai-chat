import type { LayerRecord } from '../../types';

export const enterpriseTalent: LayerRecord = {
  id: 'profile:enterprise-talent',
  kind: 'profile',
  version: '1.0.0',
  body: 'Audience: enterprise talent teams inside large organisations. Target entity: competitor or peer organisations and labour markets, used for both sourcing and intelligence. Intent varies widely — analytical (benchmarking, planning, location strategy) or live sourcing — and must be resolved at the brief because it reshapes constraints. For sourcing intent, off-limits follows the in-house pattern. For intelligence intent, the concern shifts to data sensitivity and competitive-intelligence ethics.',
  fields: {
    vocabulary: [
      'headcount',
      'attrition',
      'workforce planning',
      'talent intelligence',
      'employer brand',
      'succession',
      'build/buy/borrow',
    ],
    tiering: [
      { name: 'tier-1-direct-competitors', definition: "the organisation's closest rivals for talent and market" },
      { name: 'tier-2-sector-peers', definition: 'comparable organisations in the same space' },
      { name: 'tier-3-aspirational', definition: 'organisations watched for talent, practice or signal — feeder or cross-industry' },
    ],
  },
  hardConstraints: {
    offLimits: [
      'own current employees for sourcing intent',
      'no-poach and partner agreements',
      'candidates already in process',
    ],
    guardrails: [
      'resolve intent (sourcing vs intelligence) before applying off-limits',
      'analysis must be defensible and use professional business-relevant information only',
    ],
  },
};
