/**
 * Native map: MapLibRE React Native (vector, keyless).
 *
 * v11 API notes:
 * - `Map` + `Camera` (initialViewState; re-centered via key remount).
 * - One generic `Layer` component with `type` (fill/line/…).
 * - GeoJSON polygons support holes → the outside-campus dimming mask works
 *   here just like the web Leaflet mask (expo-maps could not do this).
 * - Markers are `Marker` annotations (native views) with an onPress.
 */
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import type { StyleSpecification, PressEvent } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Feature, Polygon, Position } from 'geojson';
import { CAMPUS_CENTER, COLORS } from '@/lib/constants';
import type { MapViewProps } from './types';

export type { MapViewProps };

const STREET_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'esri-imagery', type: 'raster', source: 'esri' }],
};

function ringToGeoJSON(polygon: NonNullable<MapViewProps['polygon']>): Position[] {
  return polygon.map((p): Position => [p.longitude, p.latitude]);
}

export default function MapView({
  markers,
  center = CAMPUS_CENTER,
  onPressMarker,
  onPressMap,
  showUserLocation = true,
  basemap = 'streets',
  polygon,
  maskOutside = false,
  style,
}: MapViewProps) {
  const mapStyle = basemap === 'satellite' ? SATELLITE_STYLE : STREET_STYLE_URL;

  // Campus + mask geometry. The mask is a world rectangle with the campus cut
  // out — GeoJSON supports holes natively.
  const campusGeoJSON = useMemo<Feature<Polygon> | null>(() => {
    if (!polygon?.length) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [ringToGeoJSON(polygon)],
      },
    };
  }, [polygon]);

  const maskGeoJSON = useMemo<Feature<Polygon> | null>(() => {
    if (!polygon?.length || !maskOutside) return null;
    const ring: Position[] = [
      [-180, 85],
      [180, 85],
      [180, -85],
      [-180, -85],
      [-180, 85],
    ];
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [ring, ringToGeoJSON(polygon)],
      },
    };
  }, [polygon, maskOutside]);

  return (
    <Map
      style={[styles.container, style]}
      mapStyle={mapStyle}
      onPress={(event) => {
        const press = event as { nativeEvent: PressEvent };
        const [lng, lat] = press.nativeEvent.lngLat;
        onPressMap?.(lat, lng);
      }}
    >
      {/* initialViewState applies once; the key remounts recentre on updates */}
      <Camera
        key={`${center.longitude.toFixed(5)},${center.latitude.toFixed(5)}`}
        initialViewState={{ center: [center.longitude, center.latitude], zoom: 14.5 }}
      />

      {maskGeoJSON ? (
        <GeoJSONSource id="outside-mask" data={maskGeoJSON}>
          <Layer
            id="outside-mask-fill"
            type="fill"
            paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.35 }}
          />
        </GeoJSONSource>
      ) : null}

      {campusGeoJSON ? (
        <GeoJSONSource id="campus-boundary" data={campusGeoJSON}>
          <Layer
            id="campus-boundary-fill"
            type="fill"
            paint={{ 'fill-color': '#0E7490', 'fill-opacity': 0.08 }}
          />
          <Layer
            id="campus-boundary-line"
            type="line"
            paint={{ 'line-color': '#0E7490', 'line-width': 2, 'line-dasharray': [2, 2] }}
          />
        </GeoJSONSource>
      ) : null}

      {markers.map((marker) => (
        <Marker
          key={marker.id}
          id={marker.id}
          lngLat={[marker.longitude, marker.latitude]}
          onPress={() => onPressMarker?.(marker.id)}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: marker.color ?? COLORS.primary,
              borderWidth: 2,
              borderColor: '#FFFFFF',
            }}
          />
        </Marker>
      ))}

      {showUserLocation ? <UserLocation /> : null}
    </Map>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
});
