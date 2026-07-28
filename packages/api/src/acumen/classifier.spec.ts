import { buildClassifierRequest, parseClassifierResult } from './classifier';
import { workspacesFor } from './grid';

describe('buildClassifierRequest', () => {
  it('lists only grid-allowed use cases in the schema enum plus "none"', () => {
    const req = buildClassifierRequest('find candidates', 'recruitment-agencies');
    expect(req).not.toBeNull();
    expect(req!.schema.properties.useCaseId.enum).toEqual(
      expect.arrayContaining([...workspacesFor('recruitment-agencies'), 'none']),
    );
    expect(req!.schema.properties.useCaseId.enum).toHaveLength(
      workspacesFor('recruitment-agencies').length + 1,
    );
  });
  it('embeds the brief in the user message', () => {
    const req = buildClassifierRequest('map the fintech market', 'recruitment-agencies');
    expect(req!.userMessage).toContain('map the fintech market');
  });
});

describe('parseClassifierResult', () => {
  it('accepts a grid-allowed id', () => {
    expect(parseClassifierResult('{"useCaseId":"talent-mapping"}', 'recruitment-agencies')).toBe(
      'talent-mapping',
    );
  });
  it('rejects an id outside the grid', () => {
    const outside = 'workforce-planning';
    expect(workspacesFor('recruitment-agencies')).not.toContain(outside);
    expect(parseClassifierResult(`{"useCaseId":"${outside}"}`, 'recruitment-agencies')).toBeNull();
  });
  it('maps "none" and garbage to null without throwing', () => {
    expect(parseClassifierResult('{"useCaseId":"none"}', 'recruitment-agencies')).toBeNull();
    expect(parseClassifierResult('not json', 'recruitment-agencies')).toBeNull();
    expect(parseClassifierResult('', 'recruitment-agencies')).toBeNull();
  });
});
