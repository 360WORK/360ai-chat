import { composeSystemPrompt } from './composer';
import { layerStore } from './store';
import { lintNoRestating } from './lint';

it('golden: executive-search × talent-mapping assembled prompt', () => {
  const r = composeSystemPrompt({
    businessType: 'executive-search',
    useCaseId: 'talent-mapping',
    userContext: 'Partner at a retained firm, financial services, EMEA.',
    brief: 'Confidential CFO search for a PE-backed fintech.',
  });
  expect(r.prompt).toMatchSnapshot();
});

it('golden: real seeded layers pass the no-restating lint', () => {
  // this guards the authored content from Task 8
  expect(lintNoRestating(layerStore)).toEqual([]);
});
