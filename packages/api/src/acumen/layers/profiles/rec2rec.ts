import type { LayerRecord } from '../../types';

export const rec2rec: LayerRecord = {
  id: 'profile:rec2rec',
  kind: 'profile',
  version: '1.0.0',
  body: 'Audience: rec2rec firms that recruit recruiters. Candidates are recruitment professionals; target employers are other recruitment and staffing agencies. Resolve early whether the work is own-growth (competitor agencies are fair game) or a client brief (the hiring client is the first and most important off-limits entry). Speak the desk: billings, book, perm and contract, 360 and 180, biller and manager, draw and commission threshold, desk, patch.',
  fields: {
    vocabulary: [
      'billings',
      'book',
      'perm',
      'contract',
      '360',
      '180',
      'biller',
      'manager',
      'draw',
      'commission threshold',
      'desk',
      'patch',
    ],
    tiering: [
      { name: 'tier-1-pure-play', definition: 'the agency exists for this niche' },
      { name: 'tier-2-dedicated-desk', definition: 'a broader agency with a named team for the niche' },
      { name: 'tier-3-occasional', definition: 'a generalist with the odd placement in the niche' },
    ],
  },
  hardConstraints: {
    offLimits: [
      'own staff',
      'partner agencies (for own-growth work)',
      'the hiring client agency (for client brief work — never source from the agency being filled for)',
    ],
    guardrails: [
      'client protection is the defining constraint — surface a breach, never resolve silently',
      'resolve own-growth vs client-brief early as it reshapes targets and constraints',
    ],
  },
};
