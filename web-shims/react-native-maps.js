// Web shim for react-native-maps — renders placeholder divs on web.
import React from 'react';
import { View, Text } from 'react-native';

const MapView = React.forwardRef(({ style, children, ...props }, ref) => {
  const mapRef = React.useRef({
    animateToRegion: () => {},
    animateCamera: () => {},
    fitToElements: () => {},
    fitToSuppliedMarkers: () => {},
    fitToCoordinates: () => {},
    getCamera: async () => ({ center: { latitude: 0, longitude: 0 }, zoom: 10, heading: 0, pitch: 0 }),
    getMapBoundaries: async () => ({ northEast: { latitude: 0, longitude: 0 }, southWest: { latitude: 0, longitude: 0 } }),
    setMapBoundaries: () => {},
    takeSnapshot: async () => '',
    pointForCoordinate: async () => ({ x: 0, y: 0 }),
    coordinateForPoint: async () => ({ latitude: 0, longitude: 0 }),
  });

  React.useImperativeHandle(ref, () => mapRef.current);

  return (
    <View style={[{ backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', minHeight: 200, overflow: 'hidden' }, style]}>
      <Text style={{ color: '#555', fontSize: 13 }}>Map (web preview)</Text>
      {children}
    </View>
  );
});
MapView.displayName = 'MapView';
MapView.Animated = MapView;
MapView.Marker = React.forwardRef(({ children }, ref) => children || null);
MapView.Polyline = () => null;
MapView.Polygon = () => null;
MapView.Circle = () => null;
MapView.Callout = ({ children }) => children || null;
MapView.Overlay = () => null;

const Marker = React.forwardRef(({ children }, ref) => children || null);
const Polyline = () => null;
const Polygon = () => null;
const Circle = () => null;
const Callout = ({ children }) => children || null;
const Overlay = () => null;
const Heatmap = () => null;
const UrlTile = () => null;
const WMSTile = () => null;
const LocalTile = () => null;
const Geojson = () => null;

class AnimatedRegion {
  constructor(region = {}) {
    this.latitude = region.latitude || 0;
    this.longitude = region.longitude || 0;
    this.latitudeDelta = region.latitudeDelta || 0.01;
    this.longitudeDelta = region.longitudeDelta || 0.01;
  }
  setValue(val) { Object.assign(this, val); }
  timing() { return { start: () => {} }; }
  spring() { return { start: () => {} }; }
  stopAnimation() {}
}

export default MapView;
export {
  Marker, Polyline, Polygon, Circle, Callout, Overlay,
  Heatmap, UrlTile, WMSTile, LocalTile, Geojson,
  AnimatedRegion,
};
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
export const MAP_TYPES = { STANDARD: 'standard', SATELLITE: 'satellite', HYBRID: 'hybrid', TERRAIN: 'terrain' };
