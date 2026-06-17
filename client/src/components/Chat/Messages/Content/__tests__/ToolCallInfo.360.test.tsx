import { render, screen } from 'test/layout-test-utils';
import ToolCallInfo from '../ToolCallInfo';

describe('ToolCallInfo 360AI integration', () => {
  it('renders cards for a 360AI tool output', () => {
    render(
      <ToolCallInfo
        toolName="search_companies"
        input="{}"
        output={JSON.stringify({ count: 1, companies: [{ id: '1', name: 'Acme' }] })}
      />,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('falls back to raw output for non-360 tools', () => {
    render(<ToolCallInfo toolName="some_other_tool" input="{}" output={'plain text output'} />);
    expect(screen.getByText(/plain text output/)).toBeInTheDocument();
  });

  it('falls back to raw output when a 360 tool output fails to parse', () => {
    render(<ToolCallInfo toolName="search_companies" input="{}" output={'not-json'} />);
    expect(screen.getByText(/not-json/)).toBeInTheDocument();
  });
});
