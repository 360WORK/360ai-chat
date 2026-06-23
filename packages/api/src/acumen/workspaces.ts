import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';

export interface WorkspaceMeta {
  useCaseId: UseCaseId;
  label: string;
  kickoff: string;
}

// Kickoff strings are crafted to match router.ts KEYWORDS for their use-case
// and to not match an earlier-in-ORDER use-case.
const META: Record<UseCaseId, { label: string; kickoff: string }> = {
  'talent-mapping': {
    label: 'Talent Mapping',
    kickoff: "Help me map the talent for a role I'm working on.",
  },
  'market-mapping': {
    label: 'Market Mapping',
    kickoff: 'Map the market for a sector I want to understand.',
  },
  'skill-mapping': {
    label: 'Skill Mapping',
    kickoff: 'Map the skills landscape for a capability I care about.',
  },
  'workforce-planning': {
    label: 'Workforce Planning',
    kickoff: 'Help me build a workforce plan.',
  },
  prospecting: {
    label: 'Prospecting',
    kickoff: 'Build me a prospect list of companies to pitch.',
  },
  'signal-tracking': {
    label: 'Signal Tracking',
    kickoff: 'Set up a watch to track moves in my market.',
  },
  'recruitment-research': {
    label: 'Recruitment Research',
    kickoff: 'I have a research question about my market.',
  },
};

export const workspacesMetaFor = (businessType: BusinessType): WorkspaceMeta[] =>
  workspacesFor(businessType).map((useCaseId) => ({
    useCaseId,
    label: META[useCaseId].label,
    kickoff: META[useCaseId].kickoff,
  }));
