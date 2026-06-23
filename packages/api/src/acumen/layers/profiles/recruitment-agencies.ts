import type { LayerRecord } from '../../types';

export const recruitmentAgencies: LayerRecord = {
  id: 'profile:recruitment-agencies',
  kind: 'profile',
  version: '1.0.0',
  body: "Audience: recruitment and staffing agencies fulfilling client briefs. Target entity is an employer company used either as a talent source (where candidates work) or as a client prospect (likely to need services) — which sense applies is set by the use case and lens. The work serves the agency's own desks. Resolve early whether a task is candidate-side or client-side, because it changes targets and output. Off-limits is client protection: never source from an agency client or any hands-off account.",
  fields: {
    vocabulary: [
      'desk',
      'brief',
      'contingent',
      'retained',
      'temp',
      'perm',
      'contract',
      'client protection',
      'candidate ownership',
      'hands-off',
    ],
    tiering: [
      { name: 'tier-1-direct', definition: 'companies squarely in the target sector and role profile' },
      { name: 'tier-2-adjacent', definition: 'companies in neighbouring sectors or with transferable talent' },
      { name: 'tier-3-peripheral', definition: 'companies with occasional relevance' },
    ],
  },
  hardConstraints: {
    offLimits: [
      "the agency's own clients",
      'accounts on a hands-off or do-not-approach list',
      'candidates within off-limits ownership or placement windows',
    ],
    guardrails: [
      'client-protection breach is a hard-constraint conflict — surface it, never resolve silently',
      'resolve candidate-side vs client-side early',
    ],
  },
};
