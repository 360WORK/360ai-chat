import type { LayerRecord } from '../../types';

export const inHouseTaTalentMapping: LayerRecord = {
  id: 'lens:in-house-ta×talent-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'Candidates who fit the role and are likely to actually join: screened against own pipeline and no-poach lists, with employer-brand draw notes and a diverse slate.',
  fields: {
    openingCopy: "Talent mapping for your roles. Tell me the role, and I'll map the right people at competitor and peer companies, screened against our own pipeline and any no-poach lists, with a diverse slate.",
    starters: [
      'Senior PM for our payments team',
      'Map staff engineers at our direct competitors',
      'Where do our best-fit data scientists come from',
    ],
    outputAdditions: [
      'fit to role and level',
      'off-limits flag (own staff, no-poach, or in-process)',
      'draw note (why they would join, employer-brand fit)',
      'diversity dimension where relevant',
    ],
  },
};
