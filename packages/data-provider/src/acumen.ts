/**
 * Shared AI Acumen use-case card metadata — the single source of truth for the
 * {useCaseId, label, kickoff} contract consumed by BOTH the composer engine
 * (`packages/api/src/acumen`) and the client landing cards
 * (`client/src/components/Acumen/workspaceCards.ts`).
 *
 * Kickoff strings are crafted to match the composer router's KEYWORDS for
 * their use-case (and to not match an earlier-in-ORDER use-case), so a
 * mis-edit here breaks routing on both sides at once — never fork these
 * strings into a local copy.
 */

export const ACUMEN_USE_CASE_IDS = [
  'talent-mapping',
  'market-mapping',
  'skill-mapping',
  'workforce-planning',
  'prospecting',
  'signal-tracking',
  'recruitment-research',
] as const;

export type AcumenUseCaseId = (typeof ACUMEN_USE_CASE_IDS)[number];

export interface AcumenCardMeta {
  label: string;
  kickoff: string;
}

export const ACUMEN_CARD_META: Record<AcumenUseCaseId, AcumenCardMeta> = {
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
    kickoff: 'Map the skills gap for a capability I care about.',
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
