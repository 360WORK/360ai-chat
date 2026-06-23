import {
  SIGNAL_DIGEST_MARKER,
  stripSignalMarkers,
  stripFeedMarkers,
  extractSignalDigestRunId,
} from '../signalsSchema';

describe('signalsSchema', () => {
  it('strips a trailing signal-digest marker', () => {
    const text = '## Open jobs\n3 new roles.\n\n<!--signal-digest:abc-123-->';
    expect(stripSignalMarkers(text)).toBe('## Open jobs\n3 new roles.');
  });

  it('strips a marker even when inline (not only trailing)', () => {
    expect(stripSignalMarkers('a<!--signal-digest:x-->b')).toBe('ab');
  });

  it('extracts the run id from a marked message', () => {
    expect(extractSignalDigestRunId('text\n<!--signal-digest:run-42-->')).toBe('run-42');
    expect(extractSignalDigestRunId('no marker here')).toBeNull();
  });

  it('collapses the blank lines left by a trailing marker', () => {
    const text = 'summary\n\n\n\n<!--signal-digest:y-->';
    expect(stripSignalMarkers(text)).toBe('summary');
  });

  it('stripFeedMarkers also removes onboarding-step markers', () => {
    const text = 'q\n<!--onboarding-step:business_type-->\n\n<!--signal-digest:z-->';
    expect(stripFeedMarkers(text)).toBe('q');
  });

  it('marker regex matches the documented HTML-comment form', () => {
    expect('<!--signal-digest:abc-->').toMatch(SIGNAL_DIGEST_MARKER);
    expect('<!-- signal-digest:abc -->').toMatch(SIGNAL_DIGEST_MARKER);
  });
});
