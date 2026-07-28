import type { Talent } from '../types';
import { useLocalize } from '~/hooks';
import { safeHref } from '../href';
import { Avatar, CardShell } from '../Bits';

export default function TalentCard({ talent }: { talent: Talent }) {
  const localize = useLocalize();
  const meta = [talent.title, talent.current_company, talent.location].filter(Boolean).join(' · ');
  const href = safeHref(talent.profile_url) ?? safeHref(talent.linkedin_url);
  return (
    <CardShell href={href}>
      <Avatar src={talent.avatar} name={talent.name} />
      <div className="min-w-0 flex-1">
        {talent.name && (
          <p className="truncate text-sm font-semibold capitalize text-text-primary">
            {talent.name}
          </p>
        )}
        {meta && <p className="truncate text-xs text-text-secondary">{meta}</p>}
      </div>
      {talent.open_to_work === true && (
        <span className="shrink-0 rounded-full bg-ai360-positive-bg px-2.5 py-1 text-xs font-medium text-ai360-positive">
          {localize('com_ui_360_open_to_work')}
        </span>
      )}
    </CardShell>
  );
}
