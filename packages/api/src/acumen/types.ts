export type LayerKind = 'foundations' | 'core' | 'profile' | 'lens';

export const BUSINESS_TYPES = [
  'enterprise-talent',
  'executive-search',
  'in-house-ta',
  'rpo-providers',
  'rec2rec',
  'recruitment-agencies',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const USE_CASE_IDS = [
  'talent-mapping',
  'market-mapping',
  'skill-mapping',
  'workforce-planning',
  'prospecting',
  'signal-tracking',
  'recruitment-research',
] as const;
export type UseCaseId = (typeof USE_CASE_IDS)[number];

export const isBusinessType = (v: string): v is BusinessType =>
  (BUSINESS_TYPES as readonly string[]).includes(v);
export const isUseCaseId = (v: string): v is UseCaseId =>
  (USE_CASE_IDS as readonly string[]).includes(v);

export interface TierSpec {
  name: string;
  definition: string;
}

export interface LayerFields {
  openingCopy?: string;
  starters?: string[];
  vocabulary?: string[];
  tiering?: TierSpec[];
  thresholds?: Record<string, number>;
  outputAdditions?: string[];
}

export interface HardConstraints {
  offLimits?: string[];
  guardrails?: string[];
}

export interface LayerRecord {
  id: string;
  kind: LayerKind;
  version: string;
  fields: LayerFields;
  hardConstraints?: HardConstraints;
  body?: string;
}

export interface GridCell {
  profile: BusinessType;
  useCase: UseCaseId;
  lensId: string;
}

export interface ComposeInput {
  businessType?: BusinessType;
  useCaseId?: UseCaseId;
  userContext?: string;
  brief?: string;
}

export interface ComposedPrompt {
  prompt: string;
  resolvedLayers: string[];
  selectedUseCase: UseCaseId | null;
  flags: string[];
}
