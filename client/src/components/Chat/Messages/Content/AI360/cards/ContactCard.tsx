import { Linkedin, Twitter, Github, Phone, Mail } from 'lucide-react';
import type { Contact } from '../types';
import { useLocalize } from '~/hooks';
import { Avatar, CopyButton, LinkButton } from '../Bits';

export default function ContactCard({ contact }: { contact: Contact }) {
  const localize = useLocalize();
  const allEmails = [
    ...new Set([...(contact.work_emails ?? []), ...(contact.personal_emails ?? [])]),
  ];
  const hasSocials = contact.linkedin_url || contact.twitter_url || contact.github_url;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ai360-card-border bg-ai360-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Avatar src={null} name={contact.full_name} />
        <div className="min-w-0 flex-1">
          {contact.full_name && (
            <p className="truncate text-sm font-semibold capitalize text-text-primary">
              {contact.full_name}
            </p>
          )}
          {contact.headline && (
            <p className="truncate text-xs text-text-secondary">{contact.headline}</p>
          )}
        </div>
      </div>

      {allEmails.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-secondary">
            {localize('com_ui_360_contact_emails')}
          </p>
          {allEmails.map((email) => (
            <div key={email} className="flex items-center gap-2">
              <Mail className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs text-text-primary">{email}</span>
              <CopyButton text={email} label={localize('com_ui_360_copy')} />
            </div>
          ))}
        </div>
      )}

      {contact.phones && contact.phones.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-secondary">
            {localize('com_ui_360_contact_phones')}
          </p>
          {contact.phones.map((phone) => (
            <div key={phone} className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs text-text-primary">{phone}</span>
              <CopyButton text={phone} label={localize('com_ui_360_copy')} />
            </div>
          ))}
        </div>
      )}

      {hasSocials && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-secondary">
            {localize('com_ui_360_contact_socials')}
          </p>
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={contact.linkedin_url}
              label={localize('com_ui_360_linkedin')}
              icon={<Linkedin />}
            />
            <LinkButton
              href={contact.twitter_url}
              label={localize('com_ui_360_twitter')}
              icon={<Twitter />}
            />
            <LinkButton
              href={contact.github_url}
              label={localize('com_ui_360_github')}
              icon={<Github />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
