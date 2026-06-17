import { render, screen } from 'test/layout-test-utils';
import AI360ToolResult, { parse360Output, is360Tool } from '../index';

describe('AI360ToolResult dispatcher', () => {
  it('renders company cards from a parsed companies result', () => {
    const result = parse360Output(
      'search_companies',
      JSON.stringify({ count: 1, companies: [{ id: '1', name: 'Acme' }] }),
    );
    expect(result).not.toBeNull();
    render(<AI360ToolResult result={result!} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(/1 companies/)).toBeInTheDocument();
  });

  it('renders the talent finder link in the talents header', () => {
    const result = parse360Output(
      'search_talents',
      JSON.stringify({
        count: 1,
        pool: 'global',
        talent_finder_url: 'https://360ai.test/tf',
        talents: [{ id: 'a', name: 'Jane' }],
      }),
    );
    render(<AI360ToolResult result={result!} />);
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /talent finder/i })).toHaveAttribute(
      'href',
      'https://360ai.test/tf',
    );
  });

  it('renders a single job detail without a list shell', () => {
    const result = parse360Output(
      'get_job',
      JSON.stringify({ id: 1, title: 'Staff Eng', status: 'open' }),
    );
    render(<AI360ToolResult result={result!} />);
    expect(screen.getByText('Staff Eng')).toBeInTheDocument();
  });

  it('re-exports is360Tool', () => {
    expect(is360Tool('search_jobs')).toBe(true);
  });
});
