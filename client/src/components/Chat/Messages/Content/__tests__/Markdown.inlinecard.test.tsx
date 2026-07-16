import React from 'react';
import { render, screen } from 'test/layout-test-utils';
import MarkdownLite from '../MarkdownLite';
import Markdown from '../Markdown';

jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: ({ lang, blockIndex }: { lang?: string; blockIndex?: number }) => (
    <div data-testid="cb" data-block-index={String(blockIndex)} data-lang={String(lang)} />
  ),
}));

const COMPANY_JSON =
  '{"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","url":"https://acme.example"}';
const TALENT_JSON =
  '{"kind":"talent","name":"Jane Doe","title":"Security Engineer","current_company":"Acme GmbH","location":"Berlin","linkedin_url":"https://www.linkedin.com/in/janedoe"}';

const cardBlock = (body: string) => ['```360ai-card', body, '```'].join('\n');

describe('Markdown 360ai-card interception', () => {
  it('renders a company card instead of a code block', () => {
    render(
      <Markdown content={`Targets below.\n\n${cardBlock(COMPANY_JSON)}`} isLatestMessage={false} />,
    );
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Cybersecurity · Berlin')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://acme.example');
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
  });

  it('renders a talent card instead of a code block', () => {
    render(<Markdown content={cardBlock(TALENT_JSON)} isLatestMessage={false} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Security Engineer · Acme GmbH · Berlin')).toBeInTheDocument();
  });

  it('renders consecutive card blocks as a vertical list of cards', () => {
    render(
      <Markdown
        content={`${cardBlock(COMPANY_JSON)}\n\n${cardBlock(TALENT_JSON)}`}
        isLatestMessage={false}
      />,
    );
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders nothing (not raw JSON, not a code block) for a malformed closed fence', () => {
    const { container } = render(
      <Markdown content={cardBlock('{"kind":"company","name":')} isLatestMessage={false} />,
    );
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('kind');
  });

  it('renders nothing while the fence is still streaming, then the card once closed', () => {
    const partial = ['Targets below.', '', '```360ai-card', '{"kind":"company","na'].join('\n');
    const { container, rerender } = render(<Markdown content={partial} isLatestMessage={true} />);
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('kind');
    expect(screen.queryByText('Acme GmbH')).not.toBeInTheDocument();

    rerender(
      <Markdown content={`Targets below.\n\n${cardBlock(COMPANY_JSON)}`} isLatestMessage={true} />,
    );
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
  });

  it('leaves other languages untouched and does not consume a CodeBlock index', () => {
    const content = [
      '```js',
      'const a = 1;',
      '```',
      '',
      cardBlock(COMPANY_JSON),
      '',
      '```python',
      'print(1)',
      '```',
    ].join('\n');
    render(<Markdown content={content} isLatestMessage={false} />);
    const blocks = screen
      .getAllByTestId('cb')
      .map((el) => [el.getAttribute('data-lang'), el.getAttribute('data-block-index')]);
    expect(blocks).toEqual([
      ['js', '0'],
      ['python', '1'],
    ]);
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
  });

  it('intercepts through the codeNoExecution path (MarkdownLite without execution)', () => {
    render(<MarkdownLite content={cardBlock(TALENT_JSON)} codeExecution={false} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByTestId('cb')).not.toBeInTheDocument();
  });
});
