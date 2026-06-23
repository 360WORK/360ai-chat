import type { LayerRecord } from '../types';
import { foundations } from './foundations';
import { enterpriseTalent } from './profiles/enterprise-talent';
import { executiveSearch } from './profiles/executive-search';
import { inHouseTa } from './profiles/in-house-ta';
import { rpoProviders } from './profiles/rpo-providers';
import { rec2rec } from './profiles/rec2rec';
import { recruitmentAgencies } from './profiles/recruitment-agencies';
import { talentMapping } from './cores/talent-mapping';
import { marketMapping } from './cores/market-mapping';
import { skillMapping } from './cores/skill-mapping';
import { workforcePlanning } from './cores/workforce-planning';
import { prospecting } from './cores/prospecting';
import { signalTracking } from './cores/signal-tracking';
import { recruitmentResearch } from './cores/recruitment-research';
import { enterpriseTalentMarketMapping } from './lenses/enterprise-talent-market-mapping';
import { enterpriseTalentSkillMapping } from './lenses/enterprise-talent-skill-mapping';
import { enterpriseTalentWorkforcePlanning } from './lenses/enterprise-talent-workforce-planning';
import { executiveSearchMarketMapping } from './lenses/executive-search-market-mapping';
import { executiveSearchTalentMapping } from './lenses/executive-search-talent-mapping';
import { executiveSearchProspecting } from './lenses/executive-search-prospecting';
import { executiveSearchSignalTracking } from './lenses/executive-search-signal-tracking';
import { inHouseTaTalentMapping } from './lenses/in-house-ta-talent-mapping';
import { rpoProvidersTalentMapping } from './lenses/rpo-providers-talent-mapping';
import { rpoProvidersProspecting } from './lenses/rpo-providers-prospecting';
import { rec2recTalentMapping } from './lenses/rec2rec-talent-mapping';
import { rec2recProspecting } from './lenses/rec2rec-prospecting';
import { recruitmentAgenciesTalentMapping } from './lenses/recruitment-agencies-talent-mapping';
import { recruitmentAgenciesProspecting } from './lenses/recruitment-agencies-prospecting';

export const ALL_LAYERS: LayerRecord[] = [
  foundations,
  enterpriseTalent,
  executiveSearch,
  inHouseTa,
  rpoProviders,
  rec2rec,
  recruitmentAgencies,
  talentMapping,
  marketMapping,
  skillMapping,
  workforcePlanning,
  prospecting,
  signalTracking,
  recruitmentResearch,
  enterpriseTalentMarketMapping,
  enterpriseTalentSkillMapping,
  enterpriseTalentWorkforcePlanning,
  executiveSearchMarketMapping,
  executiveSearchTalentMapping,
  executiveSearchProspecting,
  executiveSearchSignalTracking,
  inHouseTaTalentMapping,
  rpoProvidersTalentMapping,
  rpoProvidersProspecting,
  rec2recTalentMapping,
  rec2recProspecting,
  recruitmentAgenciesTalentMapping,
  recruitmentAgenciesProspecting,
];
