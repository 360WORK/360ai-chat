jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));

// Variables prefixed with "mock" are allowed inside jest.mock() factories.
const mockMapEaseTo = jest.fn();
const mockMapOn = jest.fn();
const mockMapOff = jest.fn();

const mockFakeMap = {
  getBounds: () => ({
    getWest: () => -180,
    getSouth: () => -85,
    getEast: () => 180,
    getNorth: () => 85,
  }),
  getZoom: () => 2,
  easeTo: mockMapEaseTo,
  on: mockMapOn,
  off: mockMapOff,
  fitBounds: jest.fn(),
};

jest.mock('../map/Map', () => ({
  __esModule: true,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  useMap: () => ({ map: mockFakeMap, isLoaded: true }),
  MapMarker: ({ longitude, latitude, children }: { longitude: number; latitude: number; children?: React.ReactNode }) => (
    <div data-testid="marker" data-lng={longitude} data-lat={latitude}>{children}</div>
  ),
  MarkerContent: ({ children }: { children?: React.ReactNode }) => <div data-testid="marker-content">{children}</div>,
  MarkerTooltip: ({ children }: { children?: React.ReactNode }) => <div data-testid="marker-tooltip">{children}</div>,
  MarkerPopup: ({ children }: { children?: React.ReactNode }) => <div data-testid="marker-popup">{children}</div>,
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TalentMap, { deCollide } from '../cards/TalentMap';

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

beforeEach(() => {
  mockMapEaseTo.mockClear();
  mockMapOn.mockClear();
  mockMapOff.mockClear();
});

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

// --- Clustering tests ---

// Two talents at nearly the same spot → cluster at zoom 2 (world view).
const nyc1 = { id: 'a', name: 'Alice', avatar: null, latitude: 40.7128, longitude: -74.006 };
const nyc2 = { id: 'b', name: 'Bob', avatar: null, latitude: 40.7129, longitude: -74.0061 };
// One talent far away in London.
const london = { id: 'c', name: 'Charlie', avatar: null, latitude: 51.5074, longitude: -0.1278 };

test('two nearby talents collapse into a single cluster marker at low zoom', () => {
  render(<TalentMap talents={[nyc1, nyc2]} />);
  const markers = screen.getAllByTestId('marker');
  // At zoom 2 with radius 60 these two ~10m-apart points must cluster.
  expect(markers).toHaveLength(1);
  const btn = screen.getByRole('button', { name: /cluster of 2 talents/i });
  expect(btn).toBeInTheDocument();
  expect(btn.textContent).toMatch(/\+2/);
});

test('cluster +N badge reflects total hidden talents', () => {
  render(<TalentMap talents={[nyc1, nyc2]} />);
  const btn = screen.getByRole('button', { name: /cluster of 2 talents/i });
  expect(btn.textContent).toContain('+2');
});

test('two talents in different cities are NOT clustered at zoom 2', () => {
  render(<TalentMap talents={[nyc1, london]} />);
  const markers = screen.getAllByTestId('marker');
  // At zoom 2 NYC and London (5500 km apart) remain as separate pins.
  expect(markers).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /cluster/i })).toBeNull();
});

test('clicking a cluster calls map.easeTo with an expansion zoom', async () => {
  render(<TalentMap talents={[nyc1, nyc2]} />);
  const btn = screen.getByRole('button', { name: /cluster of 2 talents/i });
  await userEvent.click(btn);
  expect(mockMapEaseTo).toHaveBeenCalledTimes(1);
  const call = mockMapEaseTo.mock.calls[0][0] as { center: [number, number]; zoom: number };
  expect(typeof call.zoom).toBe('number');
  expect(call.zoom).toBeGreaterThan(2);
});

test('map moveend listener is registered and cleaned up', () => {
  const { unmount } = render(<TalentMap talents={[nyc1]} />);
  expect(mockMapOn.mock.calls.some(([ev]: [string]) => ev === 'moveend')).toBe(true);
  unmount();
  expect(mockMapOff.mock.calls.some(([ev]: [string]) => ev === 'moveend')).toBe(true);
});

// --- deCollide unit tests ---

const baseLocated = (id: string, lat: number, lng: number) => ({
  id,
  name: `Talent ${id}`,
  latitude: lat,
  longitude: lng,
});

test('deCollide: co-located talents get distinct coords (count preserved, no two identical)', () => {
  const input = [
    baseLocated('a', 40.7128, -74.006),
    baseLocated('b', 40.7128, -74.006),
    baseLocated('c', 40.7128, -74.006),
  ];
  const result = deCollide(input);
  expect(result).toHaveLength(3);
  const coords = result.map((t) => `${t.latitude},${t.longitude}`);
  const unique = new Set(coords);
  expect(unique.size).toBe(3);
});

test('deCollide: singleton coords are unchanged', () => {
  const input = [baseLocated('x', 51.5074, -0.1278)];
  const result = deCollide(input);
  expect(result).toHaveLength(1);
  expect(result[0].latitude).toBe(51.5074);
  expect(result[0].longitude).toBe(-0.1278);
});

test('cluster-click zoom is capped at 13 even when getClusterExpansionZoom returns a high value', async () => {
  // nyc1 and nyc2 are at the same rounded coord key — they collapse into a cluster.
  // Mock getClusterExpansionZoom is not directly injectable, but clicking the cluster
  // button must call easeTo with zoom <= 13 regardless of supercluster's internal answer.
  render(<TalentMap talents={[nyc1, nyc2]} />);
  const btn = screen.getByRole('button', { name: /cluster of 2 talents/i });
  await userEvent.click(btn);
  expect(mockMapEaseTo).toHaveBeenCalledTimes(1);
  const call = mockMapEaseTo.mock.calls[0][0] as { center: [number, number]; zoom: number };
  expect(call.zoom).toBeLessThanOrEqual(13);
});
