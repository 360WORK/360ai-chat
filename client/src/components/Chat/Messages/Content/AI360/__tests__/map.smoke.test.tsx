const mockMapInstance = {
  on: jest.fn(),
  off: jest.fn(),
  remove: jest.fn(),
  addControl: jest.fn(),
  removeControl: jest.fn(),
  fitBounds: jest.fn(),
  flyTo: jest.fn(),
  getCenter: jest.fn(() => ({ lng: -74, lat: 40.7 })),
  getZoom: jest.fn(() => 10),
  getBearing: jest.fn(() => 0),
  getPitch: jest.fn(() => 0),
  getContainer: jest.fn(() => ({ requestFullscreen: jest.fn() })),
};

const mockMarkerEl = { style: {}, addEventListener: jest.fn() };

jest.mock('maplibre-gl', () => ({
  __esModule: true,
  default: {
    Map: jest.fn().mockImplementation(() => mockMapInstance),
    Marker: jest.fn().mockImplementation(() => ({
      setLngLat: jest.fn().mockReturnThis(),
      addTo: jest.fn().mockReturnThis(),
      remove: jest.fn(),
      getElement: jest.fn(() => mockMarkerEl),
      on: jest.fn(),
      off: jest.fn(),
    })),
    Popup: jest.fn().mockImplementation(() => ({
      setDOMContent: jest.fn().mockReturnThis(),
      addTo: jest.fn().mockReturnThis(),
      remove: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    })),
    NavigationControl: jest.fn(),
  },
}));

jest.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import { render } from '@testing-library/react';
import { Map } from '../map/Map';

test('Map mounts without throwing', () => {
  const { container } = render(
    <div style={{ height: 200 }}>
      <Map center={[-74, 40.7]} zoom={10} />
    </div>,
  );
  expect(container).toBeTruthy();
});
