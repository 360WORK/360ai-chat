import { useLocalize } from '~/hooks';
import { useAcumenWorkspacesQuery } from '~/data-provider';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { workspaceCardsFor } from './workspaceCards';

interface AcumenWorkspacesProps {
  businessTypeOverride?: string | null;
}

export default function AcumenWorkspaces({ businessTypeOverride }: AcumenWorkspacesProps) {
  const localize = useLocalize();
  const { data } = useAcumenWorkspacesQuery();
  const { submitMessage } = useSubmitMessage();
  const businessType =
    businessTypeOverride !== undefined ? businessTypeOverride : data?.businessType;
  const cards = workspaceCardsFor(businessType);

  if (!cards.length) {
    return null;
  }

  return (
    <div className="mx-auto mb-4 flex w-full flex-col gap-3 px-2 md:max-w-3xl xl:max-w-4xl">
      <p className="text-sm font-medium text-text-secondary">
        {localize('com_acumen_workspaces_header')}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              aria-label={localize(card.labelKey)}
              onClick={() => submitMessage({ text: card.kickoff })}
              className="group flex flex-col gap-3 rounded-2xl border border-border-light bg-surface-primary p-4 text-left transition hover:border-border-medium hover:bg-surface-secondary"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-text-primary">
                  {localize(card.labelKey)}
                </span>
                <span className="text-sm text-text-secondary">{localize(card.descKey)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
