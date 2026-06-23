import {
  ACUMEN_CONFIRM_BLOCK,
  extractConfirmFrame,
  hasConfirmBlock,
  stripConfirmMarkers,
} from '../confirmSchema';

const frameBlock = (obj: Record<string, unknown>): string =>
  '```acumen-confirm\n' + JSON.stringify(obj) + '\n```';

const validFrame = {
  id: 'cfo-search-frame',
  title: 'Run the longlist search',
  summary: 'CFO, PE-backed fintech, EMEA, £250k+, retained.',
};

describe('extractConfirmFrame', () => {
  it('parses a valid fenced block into a typed frame', () => {
    const out = extractConfirmFrame('Here is the frame.\n\n' + frameBlock(validFrame));
    expect(out).toEqual(validFrame);
  });

  it('returns null when there is no block', () => {
    expect(extractConfirmFrame('just a normal agent message')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(extractConfirmFrame('```acumen-confirm\n{ not json }\n```')).toBeNull();
  });

  it('requires id, title, and summary (non-empty)', () => {
    expect(extractConfirmFrame(frameBlock({ id: 'x', title: 't' }))).toBeNull();
    expect(extractConfirmFrame(frameBlock({ id: '', title: 't', summary: 's' }))).toBeNull();
    expect(extractConfirmFrame(frameBlock({ id: 'x', title: '   ', summary: 's' }))).toBeNull();
  });

  it('keeps optional labels when provided, drops empty ones', () => {
    const out = extractConfirmFrame(
      frameBlock({ ...validFrame, confirmLabel: 'Go', adjustLabel: '  ' }),
    );
    expect(out).toEqual({ ...validFrame, confirmLabel: 'Go' });
  });

  it('ignores unknown keys', () => {
    const out = extractConfirmFrame(frameBlock({ ...validFrame, extra: 'ignore me' }));
    expect(out).toEqual(validFrame);
  });

  it('is non-greedy and stops at the closing fence', () => {
    const text = frameBlock(validFrame) + '\n\ntrailing prose after the block';
    expect(extractConfirmFrame(text)).toEqual(validFrame);
  });
});

describe('hasConfirmBlock', () => {
  it('true when a block is present', () => {
    expect(hasConfirmBlock('x\n' + frameBlock(validFrame))).toBe(true);
  });
  it('false otherwise', () => {
    expect(hasConfirmBlock('no block')).toBe(false);
    expect(hasConfirmBlock('')).toBe(false);
  });
});

describe('stripConfirmMarkers', () => {
  it('removes the fenced block and trailing bare marker, collapses blanks', () => {
    const text =
      'Let me confirm before I search.\n\n' +
      frameBlock(validFrame) +
      '\n\n<!--acumen-confirm:cfo-search-frame-->';
    expect(stripConfirmMarkers(text)).toBe('Let me confirm before I search.');
  });
  it('passes through text without a block unchanged (minus trim)', () => {
    expect(stripConfirmMarkers('hello world')).toBe('hello world');
  });
});

describe('ACUMEN_CONFIRM_BLOCK regex', () => {
  it('matches the documented fenced form', () => {
    expect(frameBlock(validFrame)).toMatch(ACUMEN_CONFIRM_BLOCK);
  });
});
