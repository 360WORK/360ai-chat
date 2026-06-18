import { render } from '@testing-library/react';
import AI360ToolResult from '../index';
import type { Parsed360Result } from '../types';

jest.mock('~/hooks', () => ({ useLocalize: () => (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }));

test('registry renders every declared kind without falling through', () => {
  const samples: Parsed360Result[] = [
    { kind: 'companies', companies: [], count: 0 },
    { kind: 'talents', talents: [], count: 0 },
    { kind: 'jobs', jobs: [], count: 0, variant: 'search' },
    { kind: 'job', job: { id: 1, title: 'Eng', pipeline: [] } },
  ];
  for (const r of samples) {
    const { unmount } = render(<AI360ToolResult result={r} />);
    expect(document.body.textContent).not.toBe('');
    unmount();
  }
});
