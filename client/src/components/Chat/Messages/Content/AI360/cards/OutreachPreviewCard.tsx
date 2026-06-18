import { CheckCircle } from 'lucide-react';
import type { OutreachPreview } from '../types';
import { useLocalize } from '~/hooks';
import { ExpandableText, Pill } from '../Bits';

export default function OutreachPreviewCard({ outreach }: { outreach: OutreachPreview }) {
  const localize = useLocalize();

  if (outreach.status === 'sent') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ai360-card-border bg-ai360-card px-3 py-2.5">
        <CheckCircle className="size-4 shrink-0 text-ai360-positive" aria-hidden="true" />
        <p className="text-sm font-medium text-text-primary">{localize('com_ui_360_outreach_sent')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ai360-card-border bg-ai360-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        {outreach.channel && <Pill>{outreach.channel}</Pill>}
        {outreach.recipient && (
          <p className="text-sm font-medium text-text-primary">{outreach.recipient}</p>
        )}
      </div>
      {outreach.subject && (
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 text-xs text-text-secondary">
            {localize('com_ui_360_outreach_subject')}
          </span>
          <span className="truncate text-xs font-medium text-text-primary">{outreach.subject}</span>
        </div>
      )}
      <ExpandableText text={outreach.body} clamp={3} />
      <p className="text-xs italic text-text-secondary">{localize('com_ui_360_outreach_awaiting')}</p>
    </div>
  );
}
