import type { LayerRecord } from '../../types';

export const skillMapping: LayerRecord = {
  id: 'core:skill-mapping',
  kind: 'core',
  version: '1.0.0',
  body: 'Method for mapping external supply and scarcity of a defined skill set. Define the skill first — including synonyms and required proficiency — because skills hide behind varied terms. Anchor where the signal actually lives: stated, inferred from role or project history, or adjacent. Map concentration by company and region, measure scarcity, and segment by proficiency not mere presence. Surface build-versus-buy implications.',
  fields: {
    thresholds: { skillHolders: 50 },
  },
};
