import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useOnboardingStatusQuery, useUpdateOnboardingProfileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';

type FieldType = 'text' | 'textarea' | 'tags' | 'select';

interface SelectOption {
  value: string;
  locKey: TranslationKeys;
}

interface FieldDef {
  key: string;
  locKey: TranslationKeys;
  type: FieldType;
  options?: SelectOption[];
}

/**
 * Business type is the single field that switches the entire Acumen profile/lens
 * stack. Values are the underscore form the platform stores (normalizeBusinessType
 * maps them to the hyphenated layer ids).
 */
const BUSINESS_TYPE_OPTIONS: SelectOption[] = [
  { value: 'recruitment_agency', locKey: 'com_onboarding_bt_recruitment_agency' },
  { value: 'executive_search', locKey: 'com_onboarding_bt_executive_search' },
  { value: 'in_house_ta', locKey: 'com_onboarding_bt_in_house_ta' },
  { value: 'rpo_provider', locKey: 'com_onboarding_bt_rpo_provider' },
  { value: 'rec2rec', locKey: 'com_onboarding_bt_rec2rec' },
  { value: 'enterprise_talent', locKey: 'com_onboarding_bt_enterprise_talent' },
];

const COMPANY_FIELDS: FieldDef[] = [
  {
    key: 'business_type',
    locKey: 'com_onboarding_field_business_type',
    type: 'select',
    options: BUSINESS_TYPE_OPTIONS,
  },
  { key: 'industry', locKey: 'com_onboarding_field_industry', type: 'text' },
  { key: 'recruits_for', locKey: 'com_onboarding_field_recruits_for', type: 'tags' },
  { key: 'target_roles', locKey: 'com_onboarding_field_target_roles', type: 'tags' },
  { key: 'seniority', locKey: 'com_onboarding_field_seniority', type: 'tags' },
  { key: 'markets', locKey: 'com_onboarding_field_markets', type: 'tags' },
  { key: 'hiring_volume', locKey: 'com_onboarding_field_hiring_volume', type: 'text' },
  { key: 'candidate_icp', locKey: 'com_onboarding_field_candidate_icp', type: 'textarea' },
  {
    key: 'employer_value_prop',
    locKey: 'com_onboarding_field_employer_value_prop',
    type: 'textarea',
  },
];

/**
 * Personal fields write the CANONICAL keys Acumen reads first (`seniority`,
 * `regions`, `how_we_work`) — not the legacy `seniority_focus`/`geographies`/
 * `workflow` — so edits here are no longer shadowed by interview-set values.
 */
const PERSONAL_FIELDS: FieldDef[] = [
  { key: 'role', locKey: 'com_onboarding_field_role', type: 'text' },
  { key: 'desk', locKey: 'com_onboarding_field_desk', type: 'text' },
  { key: 'seniority', locKey: 'com_onboarding_field_seniority_focus', type: 'tags' },
  { key: 'regions', locKey: 'com_onboarding_field_geographies', type: 'tags' },
  { key: 'how_we_work', locKey: 'com_onboarding_field_workflow', type: 'textarea' },
  { key: 'copilot_goals', locKey: 'com_onboarding_field_copilot_goals', type: 'textarea' },
];

const splitTags = (value: string): string[] =>
  value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

function profileToForm(profile: Record<string, unknown> | null): Record<string, string> {
  if (!profile) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (Array.isArray(v)) {
      result[k] = v.join(', ');
    } else {
      result[k] = v != null ? String(v) : '';
    }
  }
  return result;
}

function formToProfile(form: Record<string, string>, fields: FieldDef[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = (form[field.key] ?? '').trim();
    result[field.key] = field.type === 'tags' ? splitTags(raw) : raw;
  }
  return result;
}

function TagInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const localize = useLocalize();
  const [draft, setDraft] = useState('');
  const tags = splitTags(value);

  const commit = (next: string[]) => onChange(next.join(', '));

  const addDraft = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) {
      commit([...tags, v]);
    }
    setDraft('');
  };

  const removeAt = (index: number) => commit(tags.filter((_, i) => i !== index));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addDraft();
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      removeAt(tags.length - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border-medium bg-surface-secondary px-2 py-1.5 focus-within:ring-1 focus-within:ring-border-heavy">
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-surface-tertiary py-0.5 pl-2 pr-1 text-xs text-text-primary"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={localize('com_ui_delete')}
            className="rounded-full text-text-secondary transition-colors hover:text-text-primary"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={addDraft}
        placeholder={localize('com_onboarding_tags_placeholder')}
        className="min-w-[10ch] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
    </div>
  );
}

type FieldRowProps = {
  field: FieldDef;
  value: string;
  onChange: (key: string, value: string) => void;
};

const controlClass =
  'rounded-md border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-heavy';

function FieldControl({ field, id, value, onChange }: FieldRowProps & { id: string }) {
  const localize = useLocalize();
  const handle = (v: string) => onChange(field.key, v);

  if (field.type === 'select') {
    return (
      <select
        id={id}
        className={controlClass}
        value={value}
        onChange={(e) => handle(e.target.value)}
      >
        <option value="">{localize('com_onboarding_bt_unset')}</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {localize(opt.locKey)}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'tags') {
    return <TagInput id={id} value={value} onChange={handle} />;
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        className={controlClass}
        rows={3}
        value={value}
        onChange={(e) => handle(e.target.value)}
      />
    );
  }
  return (
    <input
      id={id}
      type="text"
      className={controlClass}
      value={value}
      onChange={(e) => handle(e.target.value)}
    />
  );
}

function FieldRow({ field, value, onChange }: FieldRowProps) {
  const localize = useLocalize();
  const id = `wp-field-${field.key}`;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary" htmlFor={id}>
        {localize(field.locKey)}
      </label>
      <FieldControl field={field} id={id} value={value} onChange={onChange} />
    </div>
  );
}

type SectionProps = {
  title: string;
  description: string;
  fields: FieldDef[];
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  saveLabel: string;
};

function ProfileSection({
  title,
  description,
  fields,
  form,
  onChange,
  onSave,
  isSaving,
  saveLabel,
}: SectionProps) {
  return (
    <section className="mb-6">
      <div className="mb-3 border-b border-border-light pb-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
      </div>
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={form[field.key] ?? ''}
            onChange={onChange}
          />
        ))}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-surface-tertiary px-4 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
        onClick={onSave}
        disabled={isSaving}
      >
        {saveLabel}
      </button>
    </section>
  );
}

function WorkspaceProfile() {
  const localize = useLocalize();
  const { data, isLoading, isError } = useOnboardingStatusQuery();
  const { mutate, isLoading: isSaving } = useUpdateOnboardingProfileMutation();

  const onboarding = data?.onboarding;
  const isOwner = onboarding?.is_owner ?? false;

  const [companyForm, setCompanyForm] = useState<Record<string, string>>({});
  const [personalForm, setPersonalForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (onboarding) {
      setCompanyForm(profileToForm(onboarding.company?.profile ?? null));
      setPersonalForm(profileToForm(onboarding.personal?.profile ?? null));
    }
  }, [onboarding]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
        <p className="text-text-secondary">{localize('com_onboarding_loading')}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
        <p className="text-text-secondary">{localize('com_onboarding_error')}</p>
      </div>
    );
  }

  const companyEmpty = !onboarding?.company?.profile;
  const personalEmpty = !onboarding?.personal?.profile;
  if (companyEmpty && personalEmpty) {
    return (
      <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
        <p className="text-text-secondary">{localize('com_onboarding_empty')}</p>
      </div>
    );
  }

  const handleCompanyFieldChange = (key: string, value: string) =>
    setCompanyForm((prev) => ({ ...prev, [key]: value }));

  const handlePersonalFieldChange = (key: string, value: string) =>
    setPersonalForm((prev) => ({ ...prev, [key]: value }));

  const handleCompanySave = () =>
    mutate({ scope: 'company', profile: formToProfile(companyForm, COMPANY_FIELDS) });

  const handlePersonalSave = () =>
    mutate({ scope: 'personal', profile: formToProfile(personalForm, PERSONAL_FIELDS) });

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      {isOwner && (
        <ProfileSection
          title={localize('com_onboarding_company_section')}
          description={localize('com_onboarding_company_desc')}
          fields={COMPANY_FIELDS}
          form={companyForm}
          onChange={handleCompanyFieldChange}
          onSave={handleCompanySave}
          isSaving={isSaving}
          saveLabel={localize('com_onboarding_save')}
        />
      )}
      <ProfileSection
        title={localize('com_onboarding_personal_section')}
        description={localize('com_onboarding_personal_desc')}
        fields={PERSONAL_FIELDS}
        form={personalForm}
        onChange={handlePersonalFieldChange}
        onSave={handlePersonalSave}
        isSaving={isSaving}
        saveLabel={localize('com_onboarding_save')}
      />
    </div>
  );
}

export default React.memo(WorkspaceProfile);
