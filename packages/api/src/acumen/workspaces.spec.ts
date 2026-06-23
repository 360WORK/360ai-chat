import { workspacesMetaFor } from './workspaces';
import { selectUseCase } from './router';

describe('workspacesMetaFor', () => {
  it('returns the executive-search workspaces with labels + kickoffs', () => {
    const ws = workspacesMetaFor('executive-search');
    const ids = ws.map((w) => w.useCaseId).sort();
    expect(ids).toEqual(['market-mapping', 'prospecting', 'signal-tracking', 'talent-mapping'].sort());
    for (const w of ws) {
      expect(w.label.length).toBeGreaterThan(0);
      expect(w.kickoff.length).toBeGreaterThan(0);
    }
  });

  it('every kickoff string routes back to its own use-case (grid-constrained)', () => {
    // the kickoff is what the card sends; the router must resolve it to the same use-case
    const ws = workspacesMetaFor('executive-search');
    for (const w of ws) {
      expect(selectUseCase(w.kickoff, 'executive-search')?.useCaseId).toBe(w.useCaseId);
    }
  });

  it('returns [] for a business type with no workspaces is impossible — all six have cells; spot-check rec2rec', () => {
    expect(workspacesMetaFor('rec2rec').map((w) => w.useCaseId).sort()).toEqual(
      ['prospecting', 'talent-mapping'].sort(),
    );
  });
});
