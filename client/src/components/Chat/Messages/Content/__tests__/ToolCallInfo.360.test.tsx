import { render, screen } from 'test/layout-test-utils';
import ToolCallInfo from '../ToolCallInfo';

// The 360AI cards render in ToolCall (always-visible, outside the collapsible),
// NOT inside ToolCallInfo. ToolCallInfo's collapsible panel shows the raw tool
// output for debugging. These tests guard that revert.
describe('ToolCallInfo renders raw output (360AI cards live in ToolCall)', () => {
  it('shows the raw JSON output, not rendered cards', () => {
    render(
      <ToolCallInfo
        input="{}"
        output={JSON.stringify({ count: 1, companies: [{ id: '1', name: 'Acme' }] })}
      />,
    );
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
  });

  it('shows plain text output for non-360 tools', () => {
    render(<ToolCallInfo input="{}" output={'plain text output'} />);
    expect(screen.getByText(/plain text output/)).toBeInTheDocument();
  });
});
