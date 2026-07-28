import type { LayerRecord } from '../../types';

export const rpoProvidersTalentMapping: LayerRecord = {
  id: 'lens:rpo-providers×talent-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: "Volume pipeline for the client's reqs, kept clean of the client's own people and cross-client pools. Depth tiers (ready now, near-term, longer-term) rather than a single ranked list.",
  fields: {
    openingCopy: "Talent mapping for your client's reqs. Tell me the client and the roles, and I'll build a pipeline, kept clean of the client's own people and your other clients' pools.",
    starters: [
      'Pipeline of customer support agents for [client] across three hubs',
      'Map software engineers for [client], mid to senior',
      'Build a sales pipeline for [client] in DACH',
    ],
    thresholds: { longlist: 40 },
    outputAdditions: [
      'fit to the client req',
      'availability and pipeline-readiness',
      'off-limits flag (client protection + cross-client separation)',
    ],
  },
  hardConstraints: {
    offLimits: [
      'the client being served and their protected companies',
      "candidates intended for one client must not cross to another client pool",
    ],
    guardrails: [
      "keep candidate-facing framing professional — provider represents client brand",
    ],
  },
};
