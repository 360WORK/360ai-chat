import { renderPrompt } from './render';
import type { LayerRecord } from './types';

const R = (id: string, kind: LayerRecord['kind'], body: string): LayerRecord => ({
  id,
  kind,
  version: '1',
  fields: {},
  body,
});

describe('renderPrompt', () => {
  const out = renderPrompt({
    ordered: [
      R('foundations', 'foundations', 'FOUNDATION SCAFFOLD'),
      R('core:talent-mapping', 'core', 'TALENT METHOD'),
      R('profile:rec2rec', 'profile', 'REC2REC AUDIENCE'),
      R('lens:rec2rec×talent-mapping', 'lens', 'INTERSECTION'),
    ],
    fields: { openingCopy: 'Welcome desk', outputAdditions: ['movement hook'] },
    constraints: { offLimits: ['own employees'], guardrails: ['no sensitive personal data'] },
    userContext: 'USER IS A REC2REC BILLER',
    brief: 'map biotech recruiters',
  });

  it('includes each layer body in precedence order', () => {
    expect(out.indexOf('FOUNDATION SCAFFOLD')).toBeLessThan(out.indexOf('TALENT METHOD'));
    expect(out.indexOf('TALENT METHOD')).toBeLessThan(out.indexOf('REC2REC AUDIENCE'));
    expect(out.indexOf('REC2REC AUDIENCE')).toBeLessThan(out.indexOf('INTERSECTION'));
  });
  it('renders off-limits and guardrails after the layer bodies', () => {
    expect(out.indexOf('own employees')).toBeGreaterThan(out.indexOf('INTERSECTION'));
    expect(out).toContain('no sensitive personal data');
  });
  it('renders user context and brief last', () => {
    expect(out.indexOf('USER IS A REC2REC BILLER')).toBeGreaterThan(out.indexOf('own employees'));
    expect(out.trimEnd().endsWith('map biotech recruiters')).toBe(true);
  });
  it('omits empty sections (no thresholds line when none set)', () => {
    expect(out).not.toContain('Thresholds:');
  });
});
