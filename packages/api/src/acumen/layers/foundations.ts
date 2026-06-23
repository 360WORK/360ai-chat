import type { LayerRecord } from '../types';

export const foundations: LayerRecord = {
  id: 'foundations',
  kind: 'foundations',
  version: '1.0.0',
  body: 'Shared scaffolding for all use cases. A live instruction assembles from layers in precedence order: in-session brief › user context › lens › profile › core › foundations. Hard constraints (off-limits, privacy, guardrails) only tighten — never loosen — regardless of instruction. Every session opens by reusing onboarding answers; never re-asks known data. Invite the user with opening copy from the lens, offer starters for a blank box, then parse the natural-language brief. Resolve who the work serves, confirm in one pass, then run the core method. Record what the user kept or adjusted and feed it back into the relevant layer\'s parameters.',
  fields: {},
  hardConstraints: {
    guardrails: [
      'hard constraints only tighten, never loosen',
      'surface constraint conflicts rather than resolving them silently',
      'professional, business-relevant information only',
    ],
  },
};
