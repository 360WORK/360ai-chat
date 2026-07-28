import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';

const KEYWORDS: Record<UseCaseId, RegExp> = {
  'market-mapping':
    /\b(map the market|market map|landscape|who(?:'s| is) hiring|players in|market (?:overview|intel(?:ligence)?|scan)|key players|competitor landscape)\b/i,
  'skill-mapping':
    /\b(skill map|skills? (?:map|landscape|gap|audit|shortage|lack)|who has|capability|what skills)\b/i,
  'workforce-planning':
    /\b(workforce plan|headcount|build.?buy.?borrow|attrition|hiring plan|headcount plan(?:ning)?|plan .*headcount|org (?:design|structure)|capacity plan)\b/i,
  'talent-mapping':
    /\b(talent map|map (?:the )?talent|shortlist|longlist|candidates? (?:for|in)|talent pool|source (?:a |me )?(?:a )?(?:shortlist|list|candidates?)|find (?:me )?.*(?:candidates?|engineers?|developers?|talent))\b/i,
  prospecting:
    /\b(prospect|pitch|business development|bd list|win(?:ning)? clients|leads|target (?:account|client|company) list|target accounts?|companies .*pitch|pitch .*companies|new (?:clients?|business))\b/i,
  'signal-tracking':
    /\b(alert me|watch|track|notify|monitor|when .* (?:change|move|raise)|digest|keep an eye|(?:weekly|daily) (?:digest|briefing|summary))\b/i,
  'recruitment-research': /\b(research|find out|what(?:'s| is) the|how many)\b/i,
};

const ORDER: UseCaseId[] = [
  'signal-tracking',
  'market-mapping',
  'skill-mapping',
  'workforce-planning',
  'prospecting',
  'talent-mapping',
  'recruitment-research',
];

export const selectUseCase = (
  brief: string | undefined,
  businessType: BusinessType | undefined,
): { useCaseId: UseCaseId; confidence: number } | null => {
  if (!brief || !brief.trim() || !businessType) {
    return null;
  }
  const allowed = new Set(workspacesFor(businessType));
  for (const useCaseId of ORDER) {
    if (allowed.has(useCaseId) && KEYWORDS[useCaseId].test(brief)) {
      return { useCaseId, confidence: 0.7 };
    }
  }
  return null;
};
