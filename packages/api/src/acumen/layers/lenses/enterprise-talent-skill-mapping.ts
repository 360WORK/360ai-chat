import type { LayerRecord } from '../../types';

export const enterpriseTalentSkillMapping: LayerRecord = {
  id: 'lens:enterprise-talent×skill-mapping',
  kind: 'lens',
  version: '1.0.0',
  body: 'Skill scarcity and supply framed for workforce strategy: build-versus-buy decisions, adjacency pools for reskilling, and links to Workforce Planning outputs.',
  fields: {
    openingCopy: "Skill mapping for workforce strategy. Tell me the capability, and I'll map external supply and scarcity, where it concentrates, and what you could build versus buy.",
    starters: [
      'Map availability of ML platform engineering skills vs our footprint',
      'How scarce is FPGA design talent, and who holds it',
      'What adjacent skills could we reskill into cloud security',
    ],
    outputAdditions: [
      'external supply and scarcity',
      'concentration by competitor and region',
      'adjacency pools framed for reskilling',
      'comp and location of the skill',
      'build-versus-buy implication',
    ],
  },
};
