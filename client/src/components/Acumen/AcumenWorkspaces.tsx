import { useLocalize } from '~/hooks';
import { useAcumenWorkspacesQuery } from '~/data-provider';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import type { TAcumenWorkspace } from 'librechat-data-provider';

interface AcumenWorkspacesProps {
  workspacesOverride?: TAcumenWorkspace[];
}

export default function AcumenWorkspaces({ workspacesOverride }: AcumenWorkspacesProps) {
  const localize = useLocalize();
  const { data } = useAcumenWorkspacesQuery();
  const { submitMessage } = useSubmitMessage();
  const workspaces = workspacesOverride ?? data?.workspaces ?? [];

  if (!workspaces.length) {
    return null;
  }

  return (
    <div className="mx-auto mb-4 flex w-full max-w-3xl flex-col gap-3">
      <p className="text-sm font-medium text-text-secondary">
        {localize('com_acumen_workspaces_header')}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {workspaces.map((w) => (
          <button
            key={w.useCaseId}
            type="button"
            aria-label={w.label}
            onClick={() => submitMessage({ text: w.kickoff })}
            className="rounded-xl border border-border-light bg-surface-secondary p-3 text-left text-sm font-medium text-text-primary transition hover:border-border-medium hover:bg-surface-tertiary"
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}
