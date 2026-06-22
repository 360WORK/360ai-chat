import React, { useState, useEffect } from 'react';
import { useOnboardingStatusQuery, useUpdateOnboardingProfileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';

type ArrayField =
  | 'recruits_for'
  | 'target_roles'
  | 'seniority'
  | 'markets'
  | 'tooling'
  | 'seniority_focus'
  | 'geographies';

const ARRAY_FIELDS = new Set<string>([
  'recruits_for',
  'target_roles',
  'seniority',
  'markets',
  'tooling',
  'seniority_focus',
  'geographies',
]);

type CompanyFieldKey =
  | 'industry'
  | 'recruits_for'
  | 'target_roles'
  | 'seniority'
  | 'markets'
  | 'hiring_volume'
  | 'tooling'
  | 'candidate_icp'
  | 'employer_value_prop';

type PersonalFieldKey = 'desk' | 'role' | 'seniority_focus' | 'geographies' | 'workflow' | 'copilot_goals';

const COMPANY_FIELDS: { key: CompanyFieldKey; locKey: TranslationKeys }[] = [
  { key: 'industry', locKey: 'com_onboarding_field_industry' },
  { key: 'recruits_for', locKey: 'com_onboarding_field_recruits_for' },
  { key: 'target_roles', locKey: 'com_onboarding_field_target_roles' },
  { key: 'seniority', locKey: 'com_onboarding_field_seniority' },
  { key: 'markets', locKey: 'com_onboarding_field_markets' },
  { key: 'hiring_volume', locKey: 'com_onboarding_field_hiring_volume' },
  { key: 'tooling', locKey: 'com_onboarding_field_tooling' },
  { key: 'candidate_icp', locKey: 'com_onboarding_field_candidate_icp' },
  { key: 'employer_value_prop', locKey: 'com_onboarding_field_employer_value_prop' },
];

const PERSONAL_FIELDS: { key: PersonalFieldKey; locKey: TranslationKeys }[] = [
  { key: 'desk', locKey: 'com_onboarding_field_desk' },
  { key: 'role', locKey: 'com_onboarding_field_role' },
  { key: 'seniority_focus', locKey: 'com_onboarding_field_seniority_focus' },
  { key: 'geographies', locKey: 'com_onboarding_field_geographies' },
  { key: 'workflow', locKey: 'com_onboarding_field_workflow' },
  { key: 'copilot_goals', locKey: 'com_onboarding_field_copilot_goals' },
];

function profileToForm(profile: Record<string, unknown> | null): Record<string, string> {
  if (!profile) return {};
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

function formToProfile(
  form: Record<string, string>,
  fields: { key: string }[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const { key } of fields) {
    const raw = (form[key] ?? '').trim();
    if (ARRAY_FIELDS.has(key)) {
      result[key] = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else {
      result[key] = raw;
    }
  }
  return result;
}

type SectionProps = {
  title: string;
  fields: { key: string; locKey: TranslationKeys }[];
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  saveLabel: string;
};

function ProfileSection({ title, fields, form, onChange, onSave, isSaving, saveLabel }: SectionProps) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="flex flex-col gap-3">
        {fields.map(({ key, locKey }) => (
          <FieldRow key={key} fieldKey={key} locKey={locKey} form={form} onChange={onChange} />
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

type FieldRowProps = {
  fieldKey: string;
  locKey: TranslationKeys;
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

function FieldRow({ fieldKey, locKey, form, onChange }: FieldRowProps) {
  const localize = useLocalize();
  const value = form[fieldKey] ?? '';
  const isMultiline = fieldKey === 'candidate_icp' || fieldKey === 'employer_value_prop' || fieldKey === 'copilot_goals' || fieldKey === 'workflow';

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-text-secondary" htmlFor={`wp-field-${fieldKey}`}>
        {localize(locKey)}
      </label>
      {isMultiline ? (
        <textarea
          id={`wp-field-${fieldKey}`}
          className="rounded-md border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-heavy"
          rows={3}
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
        />
      ) : (
        <input
          id={`wp-field-${fieldKey}`}
          type="text"
          className="rounded-md border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-heavy"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
        />
      )}
    </div>
  );
}

function WorkspaceProfile() {
  const localize = useLocalize();
  const { data, isLoading } = useOnboardingStatusQuery();
  const { mutate, isLoading: isSaving } = useUpdateOnboardingProfileMutation();

  const onboarding = data?.onboarding;
  const isOwner = onboarding?.is_owner ?? false;

  const [companyForm, setCompanyForm] = useState<Record<string, string>>({});
  const [personalForm, setPersonalForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (onboarding) {
      setCompanyForm(profileToForm(onboarding.company.profile));
      setPersonalForm(profileToForm(onboarding.personal.profile));
    }
  }, [onboarding]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
        <p className="text-text-secondary">{localize('com_onboarding_loading')}</p>
      </div>
    );
  }

  const companyEmpty = !onboarding?.company.profile;
  const personalEmpty = !onboarding?.personal.profile;
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
