import { composeSystemPrompt } from './composer';

describe('composeSystemPrompt', () => {
  it('composes foundations-only when business type is unknown', () => {
    const r = composeSystemPrompt({ brief: 'hello' });
    expect(r.selectedUseCase).toBeNull();
    expect(r.resolvedLayers).toEqual(['foundations']);
    expect(r.prompt).toContain('Core Foundations');
  });
  it('routes a brief to a core+lens and includes all four instruction layers', () => {
    const r = composeSystemPrompt({
      businessType: 'rec2rec',
      brief: 'map talent',
      userContext: 'USER IS A REC2REC BILLER',
    });
    expect(r.selectedUseCase).toBe('talent-mapping');
    expect(r.resolvedLayers).toEqual([
      'foundations',
      'core:talent-mapping',
      'profile:rec2rec',
      'lens:rec2rec×talent-mapping',
    ]);
    expect(r.prompt).toContain('USER IS A REC2REC BILLER');
  });
  it('honours an explicit useCaseId over the router', () => {
    const r = composeSystemPrompt({ businessType: 'rec2rec', useCaseId: 'prospecting', brief: 'map talent' });
    expect(r.selectedUseCase).toBe('prospecting');
    expect(r.resolvedLayers).toContain('lens:rec2rec×prospecting');
  });
  it('is deterministic — same input yields identical prompt (cache-safe)', () => {
    const a = composeSystemPrompt({ businessType: 'rec2rec', useCaseId: 'talent-mapping', brief: 'x' });
    const b = composeSystemPrompt({ businessType: 'rec2rec', useCaseId: 'talent-mapping', brief: 'x' });
    expect(a.prompt).toBe(b.prompt);
  });
});
