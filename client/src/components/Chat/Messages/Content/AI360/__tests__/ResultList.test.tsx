import { fireEvent } from '@testing-library/react';
import { render, screen } from 'test/layout-test-utils';
import ResultList from '../ResultList';

const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: `Item ${i}` }));

describe('ResultList', () => {
  it('shows only the first 3 items, then reveals the rest via "View N more"', () => {
    render(
      <ResultList
        items={items}
        header={<span>5 things</span>}
        getKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    expect(screen.getByText('Item 0')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.queryByText('Item 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view 2 more/i }));
    expect(screen.getByText('Item 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.queryByText('Item 4')).not.toBeInTheDocument();
  });

  it('renders an empty state and no toggle for no items', () => {
    render(
      <ResultList
        items={[]}
        header={<span>0 things</span>}
        getKey={(it: { id: string }) => it.id}
        renderItem={() => null}
      />,
    );
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a toggle when items fit under the initial cap', () => {
    render(
      <ResultList
        items={items.slice(0, 2)}
        header={<span>2 things</span>}
        getKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
