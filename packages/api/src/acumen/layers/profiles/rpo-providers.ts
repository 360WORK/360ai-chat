import type { LayerRecord } from '../../types';

export const rpoProviders: LayerRecord = {
  id: 'profile:rpo-providers',
  kind: 'profile',
  version: '1.0.0',
  body: "Audience: RPO providers embedded with a client, operating under that client's brand. Target entity: employer companies that are talent sources — competitors and peers of the client being served. The work serves the embedded client. Where the provider serves several clients, keep talent pools and data strictly separated; the cross-client wall is the defining constraint specific to this audience.",
  fields: {
    vocabulary: [
      'embedded',
      'SLA',
      'client brand',
      'volume',
      'time-to-fill',
      'pipeline-readiness',
      'cross-client separation',
    ],
    tiering: [
      { name: 'tier-1-direct', definition: "companies squarely matching the client's roles and sector" },
      { name: 'tier-2-adjacent', definition: 'neighbouring sectors with transferable talent' },
      { name: 'tier-3-peripheral', definition: 'occasional or volume-fill sources' },
    ],
  },
  hardConstraints: {
    offLimits: [
      'the client being served',
      "companies the client names as protected (customers, partners, no-poach)",
    ],
    guardrails: [
      'cross-client separation: never source talent intended for one client into another',
      'surface a conflict rather than working around it',
      'operate under client brand — keep framing professional',
    ],
  },
};
