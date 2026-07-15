import { UserPlus, Bell, BarChart3, Search } from 'lucide-react';
import { ACUMEN_CARD_META } from 'librechat-data-provider';
import type { AcumenUseCaseId } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';

export type AcumenCard = {
  id: AcumenUseCaseId;
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
  kickoff: string;
};

/**
 * Curated landing entry-points (scope B): decoupled from the composer grid in
 * `packages/api/src/acumen`. The kickoff strings come from the shared
 * ACUMEN_CARD_META (librechat-data-provider) — the same source the composer's
 * workspaces META reads — so the agent's router always maps each card to the
 * right use-case.
 */
const CARDS: AcumenCard[] = [
  {
    id: 'talent-mapping',
    icon: UserPlus,
    labelKey: 'com_acumen_card_talent_label',
    descKey: 'com_acumen_card_talent_desc',
    kickoff: ACUMEN_CARD_META['talent-mapping'].kickoff,
  },
  {
    id: 'signal-tracking',
    icon: Bell,
    labelKey: 'com_acumen_card_signal_label',
    descKey: 'com_acumen_card_signal_desc',
    kickoff: ACUMEN_CARD_META['signal-tracking'].kickoff,
  },
  {
    id: 'market-mapping',
    icon: BarChart3,
    labelKey: 'com_acumen_card_market_label',
    descKey: 'com_acumen_card_market_desc',
    kickoff: ACUMEN_CARD_META['market-mapping'].kickoff,
  },
  {
    id: 'recruitment-research',
    icon: Search,
    labelKey: 'com_acumen_card_research_label',
    descKey: 'com_acumen_card_research_desc',
    kickoff: ACUMEN_CARD_META['recruitment-research'].kickoff,
  },
];

/** Per-business-type description overrides keyed by card id. */
const DESC_OVERRIDES: Record<string, Record<string, string>> = {
  rec2rec: {
    'talent-mapping': 'com_acumen_card_talent_desc_rec2rec',
    'signal-tracking': 'com_acumen_card_signal_desc_rec2rec',
    'market-mapping': 'com_acumen_card_market_desc_rec2rec',
  },
};

export const workspaceCardsFor = (businessType: string | null | undefined): AcumenCard[] => {
  if (!businessType) {
    return [];
  }
  const overrides = DESC_OVERRIDES[businessType];
  if (!overrides) {
    return CARDS;
  }
  return CARDS.map((card) =>
    overrides[card.id] ? { ...card, descKey: overrides[card.id] } : card,
  );
};
