import { getLatestAssistantText } from '../useCurrentConfirmFrame';
import type { TMessage } from 'librechat-data-provider';

const msg = (over: Partial<TMessage> & { children?: TMessage[] }): TMessage =>
  ({ messageId: 'm', isCreatedByUser: false, text: '', ...over } as TMessage);

describe('getLatestAssistantText (confirm-frame resolver walker)', () => {
  it('reads the flat text of the leaf assistant message', () => {
    const tree = [msg({ text: 'first' }), msg({ text: 'second' })];
    expect(getLatestAssistantText(tree)).toBe('second');
  });

  it('walks the last-child chain to the branch leaf', () => {
    const child = msg({ text: 'regenerated leaf' });
    const tree = [msg({ text: 'root', children: [msg({ text: 'first try' }), child] })];
    expect(getLatestAssistantText(tree)).toBe('regenerated leaf');
  });

  it('returns null when the leaf is the user message (frame clears on reply)', () => {
    const tree = [msg({ text: 'assistant asks' }), msg({ isCreatedByUser: true, text: 'Confirmed.' })];
    expect(getLatestAssistantText(tree)).toBeNull();
  });

  it('returns null for an empty tree', () => {
    expect(getLatestAssistantText([])).toBeNull();
    expect(getLatestAssistantText(null)).toBeNull();
  });

  it('concatenates structured TEXT content parts, falling back to flat text', () => {
    const tree = [
      msg({
        text: 'fallback',
        // @ts-expect-error constructing a minimal content shape for the test
        content: [{ type: 'text', text: { value: 'assembled ' } }, { type: 'text', text: 'frame' }],
      }),
    ];
    expect(getLatestAssistantText(tree)).toBe('assembled frame');
  });
});
