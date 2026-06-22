jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));
jest.mock('../map/Map', () => ({
  __esModule: true,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  useMap: () => ({ map: null, isLoaded: false }),
  MapMarker: ({ longitude, latitude, children }: any) => (
    <div data-testid="marker" data-lng={longitude} data-lat={latitude}>{children}</div>
  ),
  MarkerContent: ({ children }: any) => <div data-testid="marker-content">{children}</div>,
  MarkerTooltip: ({ children }: any) => <div data-testid="marker-tooltip">{children}</div>,
  MarkerPopup: ({ children }: any) => <div data-testid="marker-popup">{children}</div>,
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import TalentMap from '../cards/TalentMap';

const talentWithCoords = {
  id: '1',
  name: 'Jane Doe',
  title: 'Engineering Lead',
  current_company: 'Acme Corp',
  location: 'New York, NY',
  avatar: 'https://example.com/jane.jpg',
  open_to_work: true,
  linkedin_url: 'https://linkedin.com/in/janedoe',
  latitude: 40.7128,
  longitude: -74.006,
};

test('renders one marker per talent that has coordinates', () => {
  render(<TalentMap talents={[
    talentWithCoords,
    { id: '2', name: 'No Coords' },
  ]} />);
  const markers = screen.getAllByTestId('marker');
  expect(markers).toHaveLength(1);
  expect(markers[0].getAttribute('data-lat')).toBe('40.7128');
});

test('renders an empty state when no talent has coordinates', () => {
  render(<TalentMap talents={[{ id: '1', name: 'No Coords' }]} />);
  expect(screen.queryByTestId('marker')).toBeNull();
  expect(screen.getByText('com_ui_360_map_no_locations')).toBeInTheDocument();
});

test('renders avatar img in marker pin for coord-bearing talent', () => {
  render(<TalentMap talents={[talentWithCoords]} />);
  const content = screen.getByTestId('marker-content');
  const img = content.querySelector('img');
  expect(img).not.toBeNull();
  expect(img?.getAttribute('src')).toBe('https://example.com/jane.jpg');
  expect(img?.getAttribute('alt')).toBe('Jane Doe');
});

test('renders rich hover card in tooltip with name, title/company, location, and open-to-work pill', () => {
  render(<TalentMap talents={[talentWithCoords]} />);
  const tooltip = screen.getByTestId('marker-tooltip');
  expect(tooltip).toHaveTextContent('Jane Doe');
  expect(tooltip).toHaveTextContent('Engineering Lead · Acme Corp');
  expect(tooltip).toHaveTextContent('New York, NY');
  expect(tooltip).toHaveTextContent('com_ui_360_open_to_work');
});

test('renders popup with hover card content and view profile link', () => {
  render(<TalentMap talents={[talentWithCoords]} />);
  const popup = screen.getByTestId('marker-popup');
  expect(popup).toHaveTextContent('Jane Doe');
  expect(popup).toHaveTextContent('Engineering Lead · Acme Corp');
  const link = popup.querySelector('a');
  expect(link).not.toBeNull();
  expect(link?.getAttribute('href')).toBe('https://linkedin.com/in/janedoe');
  expect(link).toHaveTextContent('com_ui_360_view_profile');
});

test('renders single-talent map without crashing (no length < 2 guard)', () => {
  render(<TalentMap talents={[talentWithCoords]} />);
  expect(screen.getByTestId('map')).toBeInTheDocument();
  expect(screen.getByTestId('marker')).toBeInTheDocument();
});
