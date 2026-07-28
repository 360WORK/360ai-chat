import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_MARKER,
  ONBOARDING_INLINE_BLOCK,
  stripOnboardingMarkers,
  extractOnboardingStepId,
  extractInlineOnboardingStep,
  formatSelection,
  isSelectionComplete,
  getOnboardingStep,
} from '../onboardingSchema';
import type { OnboardingSelection } from '../onboardingSchema';

describe('onboardingSchema', () => {
  describe('step registry', () => {
    it('contains the root business_type step', () => {
      expect(ONBOARDING_STEPS['business_type']).toBeDefined();
      expect(ONBOARDING_STEPS['business_type'].prompt).toBe('What kind of business are you?');
    });

    it('contains all six business paths with their steps', () => {
      const paths = [
        'recruitment_agency',
        'executive_search',
        'rec2rec',
        'rpo_provider',
        'in_house_ta',
        'enterprise_talent',
      ];
      for (const path of paths) {
        const steps = Object.keys(ONBOARDING_STEPS).filter((id) => id.startsWith(`${path}.`));
        expect(steps.length).toBeGreaterThanOrEqual(5);
      }
    });

    it('every step has at least one group with at least one option', () => {
      for (const step of Object.values(ONBOARDING_STEPS)) {
        expect(step.groups.length).toBeGreaterThan(0);
        for (const group of step.groups) {
          expect(group.options.length).toBeGreaterThan(0);
        }
      }
    });

    it('getOnboardingStep returns the step for a known id', () => {
      expect(getOnboardingStep('business_type')?.id).toBe('business_type');
    });

    it('getOnboardingStep returns undefined for an unknown id', () => {
      expect(getOnboardingStep('nope.nope')).toBeUndefined();
    });
  });

  describe('predefined step marker', () => {
    it('extracts the step id from an HTML-comment marker', () => {
      const text = "What's your role?\n<!--onboarding-step:recruitment_agency.role-->";
      expect(extractOnboardingStepId(text)).toBe('recruitment_agency.role');
    });

    it('returns null when no marker is present', () => {
      expect(extractOnboardingStepId('just a normal message')).toBeNull();
    });

    it('the marker regex has the global flag so .test() does not stick', () => {
      expect(ONBOARDING_STEP_MARKER.flags).toContain('g');
    });
  });

  describe('inline dynamic spec', () => {
    const inlineBlock = (spec: object) =>
      'Sure — one more thing.\n\n```onboarding\n' + JSON.stringify(spec, null, 2) + '\n```';

    it('parses a valid inline spec into an OnboardingStep', () => {
      const text = inlineBlock({
        prompt: 'Which ATS are you on?',
        helper: 'Tap one.',
        groups: [
          {
            id: 'value',
            label: null,
            multi: false,
            allowCustom: true,
            options: [
              { value: 'bullhorn', label: 'Bullhorn' },
              { value: 'vincere', label: 'Vincere' },
            ],
          },
        ],
      });
      const step = extractInlineOnboardingStep(text);
      expect(step).not.toBeNull();
      expect(step!.id).toBe('inline');
      expect(step!.prompt).toBe('Which ATS are you on?');
      expect(step!.helper).toBe('Tap one.');
      expect(step!.groups[0].options.length).toBe(2);
      expect(step!.groups[0].allowCustom).toBe(true);
    });

    it('synthesises option values from labels when value is missing', () => {
      const text = inlineBlock({
        prompt: 'Pick one',
        groups: [{ id: 'g', label: null, multi: false, options: [{ label: 'C-suite' }] }],
      });
      const step = extractInlineOnboardingStep(text)!;
      expect(step.groups[0].options[0]).toEqual({ value: 'c_suite', label: 'C-suite' });
    });

    it('returns null for malformed JSON', () => {
      const text = '```onboarding\n{ not valid json\n```';
      expect(extractInlineOnboardingStep(text)).toBeNull();
    });

    it('returns null when prompt is missing', () => {
      const text = inlineBlock({
        groups: [{ id: 'g', label: null, multi: false, options: [{ label: 'x' }] }],
      });
      expect(extractInlineOnboardingStep(text)).toBeNull();
    });

    it('returns null when groups is empty', () => {
      const text = inlineBlock({ prompt: 'Hi', groups: [] });
      expect(extractInlineOnboardingStep(text)).toBeNull();
    });

    it('returns null when a group has no options', () => {
      const text = inlineBlock({
        prompt: 'Hi',
        groups: [{ id: 'g', label: null, multi: false, options: [] }],
      });
      expect(extractInlineOnboardingStep(text)).toBeNull();
    });

    it('the inline regex has the global flag', () => {
      expect(ONBOARDING_INLINE_BLOCK.flags).toContain('g');
    });
  });

  describe('stripOnboardingMarkers', () => {
    it('strips a predefined step marker', () => {
      const text = "What's your role?\n<!--onboarding-step:recruitment_agency.role-->";
      expect(stripOnboardingMarkers(text)).toBe("What's your role?");
    });

    it('strips an inline onboarding block', () => {
      const text =
        'Which ATS?\n\n```onboarding\n' +
        JSON.stringify({
          prompt: 'x',
          groups: [{ id: 'g', label: null, multi: false, options: [{ label: 'a' }] }],
        }) +
        '\n```';
      const stripped = stripOnboardingMarkers(text);
      expect(stripped).toBe('Which ATS?');
      expect(stripped).not.toContain('```');
    });

    it('leaves normal markdown untouched', () => {
      const text = 'Here is **bold** and a [link](https://example.com).';
      expect(stripOnboardingMarkers(text)).toBe(text);
    });

    it('strips a mid-stream UNCLOSED inline fence (no closing ``` yet)', () => {
      const text = 'Which ATS?\n\n```onboarding\n{ "prompt": "Which ATS are you on?", "groups": [';
      expect(stripOnboardingMarkers(text)).toBe('Which ATS?');
    });

    it('strips an unclosed fence whose closing fence is only partial (``)', () => {
      const text = 'Which ATS?\n\n```onboarding\n{ "prompt": "x" }\n``';
      expect(stripOnboardingMarkers(text)).toBe('Which ATS?');
    });

    it('strips a partial trailing step marker with no closing -->', () => {
      const text = "What's your role?\n<!--onboarding-step:recruitment_agen";
      expect(stripOnboardingMarkers(text)).toBe("What's your role?");
    });

    it('still strips a complete block followed by an unclosed streaming one', () => {
      const complete =
        '```onboarding\n' +
        JSON.stringify({
          prompt: 'x',
          groups: [{ id: 'g', label: null, multi: false, options: [{ label: 'a' }] }],
        }) +
        '\n```';
      const text = `First.\n\n${complete}\n\nSecond.\n\n\`\`\`onboarding\n{ "prompt": "y"`;
      expect(stripOnboardingMarkers(text)).toBe('First.\n\nSecond.');
    });
  });

  describe('formatSelection', () => {
    it('formats a single-select unlabeled group as plain values', () => {
      const step = getOnboardingStep('business_type')!;
      const sel: OnboardingSelection = { value: ['recruitment_agency'] };
      expect(formatSelection(step, sel)).toBe('Recruitment Agency');
    });

    it('formats a multi-select unlabeled group as comma-separated values', () => {
      const step = getOnboardingStep('recruitment_agency.recruits')!;
      const sel: OnboardingSelection = { recruits: ['tech', 'finance'] };
      expect(formatSelection(step, sel)).toBe('Tech, Finance');
    });

    it('formats a compound step as "Label: values; Label: values"', () => {
      const step = getOnboardingStep('recruitment_agency.placement')!;
      const sel: OnboardingSelection = {
        seniority: ['senior', 'leadership'],
        region: ['uk_ireland', 'europe'],
      };
      expect(formatSelection(step, sel)).toBe(
        'Seniority: Senior, Leadership; Region: UK & Ireland, Europe',
      );
    });

    it('skips empty groups in compound output', () => {
      const step = getOnboardingStep('recruitment_agency.placement')!;
      const sel: OnboardingSelection = { seniority: ['mid'], region: [] };
      expect(formatSelection(step, sel)).toBe('Seniority: Mid');
    });

    it('falls back to the raw value for custom entries not in options', () => {
      const step = getOnboardingStep('recruitment_agency.recruits')!;
      const sel: OnboardingSelection = { recruits: ['tech', 'maritime'] };
      expect(formatSelection(step, sel)).toBe('Tech, maritime');
    });
  });

  describe('isSelectionComplete', () => {
    it('is true when every group has a selection', () => {
      const step = getOnboardingStep('recruitment_agency.placement')!;
      const sel: OnboardingSelection = { seniority: ['mid'], region: ['global'] };
      expect(isSelectionComplete(step, sel)).toBe(true);
    });

    it('is false when any group is empty', () => {
      const step = getOnboardingStep('recruitment_agency.placement')!;
      const sel: OnboardingSelection = { seniority: ['mid'], region: [] };
      expect(isSelectionComplete(step, sel)).toBe(false);
    });

    it('is false when selection is empty', () => {
      const step = getOnboardingStep('business_type')!;
      expect(isSelectionComplete(step, {})).toBe(false);
    });
  });
});
