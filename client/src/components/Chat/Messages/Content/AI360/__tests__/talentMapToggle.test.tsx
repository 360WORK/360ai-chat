jest.mock('~/hooks', () => ({ useLocalize: () => (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }));
jest.mock('../cards/TalentMap', () => ({ __esModule: true, default: () => <div data-testid="talent-map" /> }));
import { render, screen, fireEvent } from '@testing-library/react';
import AI360ToolResult from '../index';

const withCoords = { kind: 'talents' as const, count: 1, talents: [{ id: '1', name: 'Jane', latitude: 40.7, longitude: -74 }] };
const noCoords = { kind: 'talents' as const, count: 1, talents: [{ id: '2', name: 'Bob' }] };

test('list is shown by default; map toggle reveals the map', () => {
  render(<AI360ToolResult result={withCoords} />);
  expect(screen.queryByTestId('talent-map')).toBeNull();          // list first
  fireEvent.click(screen.getByRole('button', { name: /com_ui_360_map_view/i }));
  expect(screen.getByTestId('talent-map')).toBeInTheDocument();   // map after toggle
});

test('no map toggle when results have no coordinates', () => {
  render(<AI360ToolResult result={noCoords} />);
  expect(screen.queryByRole('button', { name: /com_ui_360_map_view/i })).toBeNull();
});
