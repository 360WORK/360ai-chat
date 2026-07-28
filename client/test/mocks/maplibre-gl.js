// Minimal stub for maplibre-gl so jest/jsdom tests never try to load WebGL bindings.
const noop = () => {};
const returnsThis = function () { return this; };

class Map {
  constructor() {}
  on() { return this; }
  off() { return this; }
  remove() {}
  addControl() {}
  removeControl() {}
  getCanvas() { return { style: {} }; }
  getBearing() { return 0; }
  getPitch() { return 0; }
  fitBounds() {}
  flyTo() {}
  easeTo() {}
  getCenter() { return { lng: 0, lat: 0 }; }
  getZoom() { return 1; }
  loaded() { return true; }
}

class Marker {
  constructor() { this._element = document.createElement('div'); }
  setLngLat() { return this; }
  addTo() { return this; }
  remove() {}
  getElement() { return this._element; }
}

class Popup {
  constructor() {}
  setLngLat() { return this; }
  setDOMContent() { return this; }
  addTo() { return this; }
  remove() {}
}

class NavigationControl {}
class GeolocateControl {}
class ScaleControl {}
class AttributionControl {}
class LngLatBounds {
  extend() { return this; }
}

module.exports = {
  Map,
  Marker,
  Popup,
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  AttributionControl,
  LngLatBounds,
  default: { Map, Marker, Popup, NavigationControl, GeolocateControl, ScaleControl, AttributionControl, LngLatBounds },
};
