import { SIGNAL_CARD_BLOCK, extractSignalCard, stripSignalCardMarkers } from '../signalCardSchema';

const cardBlock = (obj: Record<string, unknown>): string =>
  '```signal-card\n' + JSON.stringify(obj) + '\n```';

const validCard = {
  name: 'Weekly Market & Desk Pulse',
  cadence: 'Every Monday, 8:00 AM UK time',
  nextRun: 'Monday 20 July 2026',
  deliversTo: 'Signals feed + in-app notification',
  whatYouGet: 'A ranked briefing across all active roles.',
};

describe('extractSignalCard', () => {
  it('parses a valid fenced block into a typed card', () => {
    const out = extractSignalCard('Here is your signal.\n\n' + cardBlock(validCard));
    expect(out).toEqual(validCard);
  });

  it('returns null when there is no block', () => {
    expect(extractSignalCard('just a normal agent message')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(extractSignalCard('```signal-card\n{ not json }\n```')).toBeNull();
  });

  it('requires a name', () => {
    expect(extractSignalCard(cardBlock({ cadence: 'Weekly' }))).toBeNull();
    expect(extractSignalCard(cardBlock({ name: '   ', cadence: 'Weekly' }))).toBeNull();
  });

  it('requires at least one detail field beyond the name', () => {
    expect(extractSignalCard(cardBlock({ name: 'Only a name' }))).toBeNull();
  });

  it('renders a partial card (only present fields kept, empties dropped)', () => {
    const out = extractSignalCard(cardBlock({ name: 'Pulse', cadence: 'Weekly', nextRun: '  ' }));
    expect(out).toEqual({
      name: 'Pulse',
      cadence: 'Weekly',
      nextRun: undefined,
      deliversTo: undefined,
      whatYouGet: undefined,
    });
  });

  it('ignores unknown keys', () => {
    const out = extractSignalCard(cardBlock({ ...validCard, extra: 'ignore me' }));
    expect(out).toEqual(validCard);
  });

  it('is non-greedy and stops at the closing fence', () => {
    const text = cardBlock(validCard) + '\n\ntrailing prose after the block';
    expect(extractSignalCard(text)).toEqual(validCard);
  });
});

describe('stripSignalCardMarkers', () => {
  it('removes the fenced block and collapses blanks', () => {
    const text = 'Your signal is set up.\n\n' + cardBlock(validCard);
    expect(stripSignalCardMarkers(text)).toBe('Your signal is set up.');
  });

  it('passes through text without a block unchanged (minus trim)', () => {
    expect(stripSignalCardMarkers('hello world')).toBe('hello world');
  });

  it('strips a mid-stream UNCLOSED fence (no closing ``` yet)', () => {
    const text = 'Setting up.\n\n```signal-card\n{ "name": "Weekly Pulse", "cadence": "Every';
    expect(stripSignalCardMarkers(text)).toBe('Setting up.');
  });

  it('still strips a complete block followed by an unclosed streaming one', () => {
    const text = `First.\n\n${cardBlock(validCard)}\n\nSecond.\n\n\`\`\`signal-card\n{ "name"`;
    expect(stripSignalCardMarkers(text)).toBe('First.\n\nSecond.');
  });
});

describe('SIGNAL_CARD_BLOCK regex', () => {
  it('matches the documented fenced form', () => {
    expect(cardBlock(validCard)).toMatch(SIGNAL_CARD_BLOCK);
  });
});
