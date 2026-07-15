import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import type {
  OnboardingOptionGroup,
  OnboardingSelection,
  OnboardingStep,
} from './onboardingSchema';
import { formatSelection, isSelectionComplete } from './onboardingSchema';
import { useLocalize } from '~/hooks';

export type PillOptionsProps = {
  /** The active onboarding step to render pills for. */
  step: OnboardingStep;
  /** Called with the formatted selection text when the user submits. */
  onSubmit: (text: string) => void;
  /** Disable the submit button (e.g. while the agent is responding). */
  submitting?: boolean;
};

const pillBase =
  'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

const pillDeselected =
  'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium hover:bg-surface-secondary hover:text-text-primary';

const pillSelected =
  'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90';

/**
 * Renders a single option group's pills (single- or multi-select), plus an
 * optional "+ add your own" inline entry for groups with `allowCustom`.
 */
function GroupPills({
  group,
  selected,
  onToggle,
  disabled = false,
}: {
  group: OnboardingOptionGroup;
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  const localize = useLocalize();
  const [customDraft, setCustomDraft] = useState('');
  const draftId = useRef<HTMLInputElement>(null);

  const addCustom = () => {
    const value = customDraft.trim();
    if (!value) {
      return;
    }
    onToggle(value);
    setCustomDraft('');
    draftId.current?.focus();
  };

  const onCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustom();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {group.options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onToggle(opt.value)}
            className={`${pillBase} ${isSelected ? pillSelected : pillDeselected}`}
          >
            {opt.label}
          </button>
        );
      })}

      {/* Custom entries the user added (not in the predefined options). */}
      {selected
        .filter((v) => !group.options.some((o) => o.value === v))
        .map((v) => (
          <button
            key={`custom-${v}`}
            type="button"
            disabled={disabled}
            aria-pressed={true}
            onClick={() => onToggle(v)}
            className={`${pillBase} ${pillSelected}`}
          >
            {v}
            <X className="size-3 opacity-70" aria-hidden="true" />
          </button>
        ))}

      {group.allowCustom && (
        <span className="inline-flex items-center gap-1">
          <input
            ref={draftId}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            onKeyDown={onCustomKeyDown}
            disabled={disabled}
            placeholder={localize('com_onboarding_add_your_own')}
            aria-label={localize('com_onboarding_add_your_own')}
            className="w-32 rounded-full border border-dashed border-border-light bg-transparent px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          />
          {customDraft.trim() && (
            <button
              type="button"
              disabled={disabled}
              onClick={addCustom}
              aria-label={localize('com_onboarding_add')}
              className="inline-flex size-7 items-center justify-center rounded-full bg-surface-secondary text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Generic onboarding pill selector. Renders the prompt + one or more option
 * groups (with sub-labels for compound questions), supports single- and
 * multi-select, "+ add your own", and a Submit button gated on completion.
 *
 * Source-agnostic: works identically for predefined steps (looked up by id in
 * the schema) and for dynamic/inline steps emitted ad-hoc by the agent.
 */
function PillOptions({ step, onSubmit, submitting = false }: PillOptionsProps) {
  const localize = useLocalize();
  const [selection, setSelection] = useState<OnboardingSelection>({});

  // Reset the selection whenever the question changes. We key on BOTH the step
  // id and the prompt because two consecutive dynamic (inline) questions share
  // the synthesised id 'inline' — the prompt distinguishes them. Predefined
  // steps have unique ids so this also resets correctly between them.
  useEffect(() => {
    setSelection({});
  }, [step.id, step.prompt]);

  const isSingleSelect =
    step.groups.length === 1 && !step.groups[0].multi && !step.groups[0].allowCustom;

  const toggle = (groupId: string, value: string) => {
    const group = step.groups.find((g) => g.id === groupId);
    const current = selection[groupId] ?? [];
    const isMulti = group?.multi === true;
    let next: string[];
    if (current.includes(value)) {
      next = isMulti ? current.filter((v) => v !== value) : [];
    } else {
      next = isMulti ? [...current, value] : [value];
    }
    const newSelection = { ...selection, [groupId]: next };
    setSelection(newSelection);
    if (isSingleSelect && !submitting && next.length > 0) {
      onSubmit(formatSelection(step, newSelection));
    }
  };

  const complete = useMemo(() => isSelectionComplete(step, selection), [step, selection]);

  const handleSubmit = () => {
    if (!complete) {
      return;
    }
    onSubmit(formatSelection(step, selection));
  };

  const compound = step.groups.length > 1;

  return (
    <div className="animate-fadeIn w-full">
      <div className="mb-3">
        <div className="text-base font-medium text-text-primary">{step.prompt}</div>
        {step.helper && <div className="mt-0.5 text-sm text-text-secondary">{step.helper}</div>}
      </div>
      <div className={compound ? 'flex flex-col gap-4' : 'flex flex-col gap-3'}>
        {step.groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            {group.label && (
              <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {group.label}
              </div>
            )}
            <GroupPills
              group={group}
              selected={selection[group.id] ?? []}
              onToggle={(value) => toggle(group.id, value)}
              disabled={submitting}
            />
          </div>
        ))}
      </div>
      {!isSingleSelect && complete && (
        <div className="animate-fadeIn mt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={`${pillBase} ${pillSelected}`}
          >
            {localize('com_onboarding_continue')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(PillOptions);
