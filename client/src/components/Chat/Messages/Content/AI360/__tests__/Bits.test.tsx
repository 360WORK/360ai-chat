import { fireEvent } from '@testing-library/react';
import { render, screen } from 'test/layout-test-utils';
import { LinkButton, ExpandableText, SkillChips, Avatar } from '../Bits';
import { ExternalLink } from 'lucide-react';

describe('LinkButton', () => {
  it('renders a link with href and opens in new tab', () => {
    render(<LinkButton href="https://acme.com" label="Website" icon={<ExternalLink />} />);
    const link = screen.getByRole('link', { name: 'Website' });
    expect(link).toHaveAttribute('href', 'https://acme.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing without href', () => {
    const { container } = render(<LinkButton href={null} label="Website" icon={<ExternalLink />} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ExpandableText', () => {
  it('toggles expansion', () => {
    render(<ExpandableText text="A long description here" clamp={2} />);
    const toggle = screen.getByRole('button');
    expect(screen.getByText('A long description here')).toHaveClass('line-clamp-2');
    fireEvent.click(toggle);
    expect(screen.getByText('A long description here')).not.toHaveClass('line-clamp-2');
  });

  it('renders nothing for empty text', () => {
    const { container } = render(<ExpandableText text="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SkillChips', () => {
  it('caps visible chips and reveals the rest', () => {
    render(<SkillChips skills={['a', 'b', 'c', 'd', 'e', 'f', 'g']} max={5} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('g')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('+2'));
    expect(screen.getByText('g')).toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('falls back to initials on image error', () => {
    render(<Avatar src="https://broken" name="Jane Doe" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
