import { fireEvent } from '@testing-library/react';
import { render, screen } from 'test/layout-test-utils';
import NumberedCardList from '../NumberedCardList';

const items = [
  { id: 'a', label: 'AI companies headquartered in Seattle' },
  { id: 'b', label: 'SaaS companies that raised Series A funding' },
];

describe('NumberedCardList', () => {
  it('renders zero-padded indices and labels', () => {
    render(<NumberedCardList items={items} />);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText(/Seattle/)).toBeInTheDocument();
  });
  it('fires onSelect with item + index when interactive', () => {
    const onSelect = jest.fn();
    render(<NumberedCardList items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/Series A/));
    expect(onSelect).toHaveBeenCalledWith(items[1], 1);
  });
  it('renders null for empty items', () => {
    const { container } = render(<NumberedCardList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('respects startIndex offset', () => {
    render(<NumberedCardList items={items} startIndex={5} />);
    expect(screen.getByText('05')).toBeInTheDocument();
    expect(screen.getByText('06')).toBeInTheDocument();
  });
});
