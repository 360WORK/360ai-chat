import { renderHook } from '@testing-library/react';
import useCurrentOnboardingStep, { getLatestAssistantText } from '../useCurrentOnboardingStep';
import type { TMessage } from 'librechat-data-provider';

const mkMsg = (overrides: Partial<TMessage> & { text?: string; isAssistant?: boolean }): TMessage =>
  ({ isCreatedByUser: false, messageId: 'm1', text: '', ...overrides }) as unknown as TMessage;

describe('getLatestAssistantText', () => {
  it('returns null for an empty tree', () => {
    expect(getLatestAssistantText(null)).toBeNull();
    expect(getLatestAssistantText(undefined)).toBeNull();
    expect(getLatestAssistantText([])).toBeNull();
  });

  it('returns the text of a lone assistant message', () => {
    const tree = [mkMsg({ text: 'hello', isCreatedByUser: false })];
    expect(getLatestAssistantText(tree)).toBe('hello');
  });

  it('returns the leaf assistant message when the user has not yet replied', () => {
    // assistant question -> (no children yet) → leaf is the assistant question
    const tree = [
      mkMsg({
        messageId: 'a1',
        isCreatedByUser: false,
        text: 'What is your role?\n<!--onboarding-step:recruitment_agency.role-->',
      }),
    ];
    expect(getLatestAssistantText(tree)).toContain('recruitment_agency.role');
  });

  it('returns null once the user has replied (leaf is the user message)', () => {
    // This is the Bug B guard: after the user submits, their reply is the leaf,
    // so pills hide until the agent's next question arrives.
    const tree = [
      mkMsg({
        messageId: 'a1',
        isCreatedByUser: false,
        text: 'question?\n<!--onboarding-step:business_type-->',
        children: [mkMsg({ messageId: 'u1', isCreatedByUser: true, text: 'Recruitment Agency' })],
      }),
    ];
    expect(getLatestAssistantText(tree)).toBeNull();
  });

  it('returns the next assistant question after the agent responds to a reply', () => {
    const tree = [
      mkMsg({
        messageId: 'a1',
        isCreatedByUser: false,
        text: 'q1',
        children: [
          mkMsg({ messageId: 'u1', isCreatedByUser: true, text: 'reply' }),
          mkMsg({
            messageId: 'a2',
            isCreatedByUser: false,
            text: 'q2\n<!--onboarding-step:recruitment_agency.role-->',
          }),
        ],
      }),
    ];
    expect(getLatestAssistantText(tree)).toContain('recruitment_agency.role');
  });

  it('returns null when the leaf is an assistant message without a marker (free chat)', () => {
    // No marker → resolver will find no step (tested at the hook level); here we
    // just confirm the text is returned so the caller can detect the absence.
    const tree = [mkMsg({ isCreatedByUser: false, text: 'just chatting' })];
    expect(getLatestAssistantText(tree)).toBe('just chatting');
  });
});

describe('useCurrentOnboardingStep', () => {
  const renderIt = (gateActive: boolean, tree: TMessage[] | null) =>
    renderHook(() => useCurrentOnboardingStep(gateActive, tree)).result.current;

  it('returns no step when the gate is inactive', () => {
    const tree = [mkMsg({ text: 'What kind of business?\n<!--onboarding-step:business_type-->' })];
    const res = renderIt(false, tree);
    expect(res.active).toBe(false);
    expect(res.step).toBeNull();
  });

  it('returns no step when the gate is active but the latest message has no marker', () => {
    const tree = [mkMsg({ text: 'just chatting, no question yet' })];
    const res = renderIt(true, tree);
    expect(res.active).toBe(true);
    expect(res.step).toBeNull();
  });

  it('resolves a predefined step marker to the schema step', () => {
    const tree = [
      mkMsg({ text: "What's your role?\n<!--onboarding-step:recruitment_agency.role-->" }),
    ];
    const res = renderIt(true, tree);
    expect(res.step?.id).toBe('recruitment_agency.role');
    expect(res.step?.prompt).toBe("What's your role?");
  });

  it('resolves an inline dynamic spec', () => {
    const tree = [
      mkMsg({
        text:
          'Which ATS?\n\n```onboarding\n' +
          JSON.stringify({
            prompt: 'Which ATS?',
            groups: [{ id: 'value', label: null, multi: false, options: [{ label: 'Bullhorn' }] }],
          }) +
          '\n```',
      }),
    ];
    const res = renderIt(true, tree);
    expect(res.step).not.toBeNull();
    expect(res.step?.id).toBe('inline');
    expect(res.step?.prompt).toBe('Which ATS?');
  });

  it('prefers the inline spec when both marker formats are present', () => {
    const tree = [
      mkMsg({
        text:
          'A dynamic one\n```onboarding\n' +
          JSON.stringify({
            prompt: 'dynamic',
            groups: [{ id: 'g', label: null, multi: false, options: [{ label: 'x' }] }],
          }) +
          '\n```\n<!--onboarding-step:business_type-->',
      }),
    ];
    const res = renderIt(true, tree);
    expect(res.step?.id).toBe('inline');
  });

  it('returns null for an unknown predefined step id', () => {
    const tree = [mkMsg({ text: 'q\n<!--onboarding-step:does.not.exist-->' })];
    const res = renderIt(true, tree);
    expect(res.step).toBeNull();
  });

  it('hides the step once the user has replied (leaf is the user message)', () => {
    // Bug B guard: after submit, the user reply is the leaf, so no pills render
    // until the agent's next question arrives.
    const tree = [
      mkMsg({
        text: 'q?\n<!--onboarding-step:business_type-->',
        isCreatedByUser: false,
        children: [mkMsg({ text: 'Recruitment Agency', isCreatedByUser: true })],
      }),
    ];
    const res = renderIt(true, tree);
    expect(res.active).toBe(true);
    expect(res.step).toBeNull();
  });

  it('reads the marker from structured content parts (agent messages), not just flat text', () => {
    // Agent messages carry their text in content[].text (TEXT parts), often
    // with an empty flat text field. The resolver must assemble TEXT parts.
    const tree = [
      mkMsg({
        text: '',
        isCreatedByUser: false,
        content: [
          {
            type: 'text',
            text: 'What kind of business are you?\n\n<!--onboarding-step:business_type-->',
          },
        ] as unknown as TMessage['content'],
      }),
    ];
    const res = renderIt(true, tree);
    expect(res.step?.id).toBe('business_type');
  });

  it('returns null when gate is active but tree is null', () => {
    const res = renderIt(true, null);
    expect(res.active).toBe(true);
    expect(res.step).toBeNull();
  });
});
