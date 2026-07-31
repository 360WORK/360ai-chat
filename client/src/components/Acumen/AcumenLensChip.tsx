import { ACUMEN_CARD_META } from 'librechat-data-provider';
import type { AcumenUseCaseId } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useAcumenActiveQuery } from '~/data-provider';

interface AcumenLensChipProps {
  conversationId?: string;
  lastMessageId?: string;
}

function humanizeBusinessType(businessType: string): string {
  return businessType
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Small pill that surfaces the Acumen use-case (and business type) the agent
 * is currently routed to for this conversation, so the user can see which
 * lens is active. Renders nothing until both a use case and business type are
 * resolved for the conversation.
 */
export default function AcumenLensChip({ conversationId, lastMessageId }: AcumenLensChipProps) {
  const localize = useLocalize();
  const { data } = useAcumenActiveQuery(conversationId, lastMessageId);

  if (!data?.useCaseId || !data.businessType) {
    return null;
  }

  const useCaseLabel = ACUMEN_CARD_META[data.useCaseId as AcumenUseCaseId]?.label ?? data.useCaseId;
  const businessTypeLabel = humanizeBusinessType(data.businessType);

  return (
    <div className="mx-auto mb-2 flex w-full justify-center px-2 md:max-w-3xl xl:max-w-4xl">
      <span
        aria-label={localize('com_acumen_active_lens')}
        className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-3 py-1 text-xs font-medium text-text-secondary"
      >
        {useCaseLabel} · {businessTypeLabel}
      </span>
    </div>
  );
}
