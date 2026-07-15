import { ACUMEN_CARD_META } from 'librechat-data-provider';
import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';

export interface WorkspaceMeta {
  useCaseId: UseCaseId;
  label: string;
  kickoff: string;
}

/**
 * Card labels/kickoffs come from the shared ACUMEN_CARD_META in
 * librechat-data-provider — the same constants the client landing cards render
 * — so the kickoff strings the user sends always match router.ts KEYWORDS.
 */
export const workspacesMetaFor = (businessType: BusinessType): WorkspaceMeta[] =>
  workspacesFor(businessType).map((useCaseId) => ({
    useCaseId,
    label: ACUMEN_CARD_META[useCaseId].label,
    kickoff: ACUMEN_CARD_META[useCaseId].kickoff,
  }));
