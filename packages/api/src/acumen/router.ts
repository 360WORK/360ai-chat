import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';

const KEYWORDS: Record<UseCaseId, RegExp> = {
  'market-mapping': /\b(map the market|market map|landscape|who(?:'s| is) hiring|players in)\b/i,
  'skill-mapping': /\b(skill map|skills? (?:map|landscape)|who has|capability)\b/i,
  'workforce-planning': /\b(workforce plan|headcount|build.?buy.?borrow|attrition|hiring plan)\b/i,
  'talent-mapping': /\b(talent map|map (?:the )?talent|shortlist|longlist|candidates? (?:for|in))\b/i,
  'prospecting': /\b(prospect|pitch|business development|bd list|win(?:ning)? clients|leads)\b/i,
  'signal-tracking': /\b(alert me|watch|track|notify|monitor|when .* (?:change|move|raise))\b/i,
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
