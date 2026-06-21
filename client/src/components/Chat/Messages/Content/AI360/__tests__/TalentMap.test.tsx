jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));
jest.mock('../map/Map', () => ({
  __esModule: true,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  MapMarker: ({ longitude, latitude, children }: any) => (
    <div data-testid="marker" data-lng={longitude} data-lat={latitude}>{children}</div>
  ),
  MarkerContent: ({ children }: any) => <>{children}</>,
  MarkerTooltip: ({ children }: any) => <span>{children}</span>,
  MarkerPopup: ({ children }: any) => <div>{children}</div>,
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import TalentMap from '../cards/TalentMap';

test('renders one marker per talent that has coordinates', () => {
  render(<TalentMap talents={[
    { id: '1', name: 'Jane Doe', title: 'Eng', current_company: 'Acme', latitude: 40.7128, longitude: -74.006 },
    { id: '2', name: 'No Coords' },
  ]} />);
  const markers = screen.getAllByTestId('marker');
  expect(markers).toHaveLength(1);
  expect(markers[0].getAttribute('data-lat')).toBe('40.7128');
  expect(screen.getAllByText('Jane Doe').length).toBeGreaterThanOrEqual(1);
});

test('renders an empty state when no talent has coordinates', () => {
  render(<TalentMap talents={[{ id: '1', name: 'No Coords' }]} />);
  expect(screen.queryByTestId('marker')).toBeNull();
  expect(screen.getByText('com_ui_360_map_no_locations')).toBeInTheDocument();
});
