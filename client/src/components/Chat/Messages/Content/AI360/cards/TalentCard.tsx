import { Linkedin, UserRound, MapPin } from 'lucide-react';
import type { Talent } from '../types';
import { useLocalize } from '~/hooks';
import { Avatar, SkillChips, LinkButton, CopyButton, ExpandableText } from '../Bits';

export default function TalentCard({ talent }: { talent: Talent }) {
  const localize = useLocalize();
  const subtitle = [talent.title, talent.current_company].filter(Boolean).join(' @ ');
  const copyText = [talent.name, talent.title, talent.linkedin_url].filter(Boolean).join(' — ');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-medium bg-surface-primary p-3">
      <div className="flex items-start gap-2.5">
        <Avatar src={talent.avatar} name={talent.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-text-primary">{talent.name}</h4>
            {talent.open_to_work === true && (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                {localize('com_ui_360_open_to_work')}
              </span>
            )}
          </div>
          {subtitle && <p className="truncate text-xs text-text-secondary">{subtitle}</p>}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
            {talent.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {talent.location}
              </span>
            )}
            {typeof talent.years_experience === 'number' && (
              <span>{localize('com_ui_360_years_exp', { 0: talent.years_experience })}</span>
            )}
          </div>
        </div>
      </div>
      <SkillChips skills={talent.skills} />
      <ExpandableText text={talent.summary} />
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <LinkButton
          href={talent.profile_url}
          label={localize('com_ui_360_view_profile')}
          icon={<UserRound />}
        />
        <LinkButton
          href={talent.linkedin_url}
          label={localize('com_ui_360_linkedin')}
          icon={<Linkedin />}
        />
        {copyText && <CopyButton text={copyText} />}
      </div>
    </div>
  );
}
