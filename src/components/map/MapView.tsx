/**
 * Native map: expo-maps (Apple Maps on iOS, Google Maps on Android).
 * expo-maps has no web support, which is why this file has no `.web` twin:
 * Metro loads MapView.web.tsx for web and this file for native.
 */
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { Platform, StyleSheet } from 'react-native';

import { CAMPUS_CENTER, COLORS } from '@/lib/constants';
import type { MapViewProps } from './types';

export type { MapViewProps };

const GEOFENCE_FILL = 'rgba(14,116,144,0.12)';
const GEOFENCE_LINE = COLORS.primary;

export default function MapView({
  markers,
  center = CAMPUS_CENTER,
  onPressMarker,
  onPressMap,
  showUserLocation = true,
  basemap = 'streets',
  polygon,
  style,
}: MapViewProps) {
  const cameraPosition = {
    coordinates: { latitude: center.latitude, longitude: center.longitude },
    zoom: 14,
  };

  const geofence = polygon?.length
    ? [
        {
          id: 'campus-geofence',
          coordinates: polygon.map((p) => ({
            latitude: p.latitude,
            longitude: p.longitude,
          })),
          color: GEOFENCE_FILL,
          lineColor: GEOFENCE_LINE,
          lineWidth: 2,
        },
      ]
    : [];

  if (Platform.OS === 'android') {
    return (
      <GoogleMaps.View
        style={[styles.container, style]}
        cameraPosition={cameraPosition}
        properties={{
          isMyLocationEnabled: showUserLocation,
          mapType:
            basemap === 'satellite'
              ? GoogleMaps.MapType.SATELLITE
              : GoogleMaps.MapType.NORMAL,
        }}
        markers={markers.map((m) => ({
          id: m.id,
          coordinates: { latitude: m.latitude, longitude: m.longitude },
          title: m.title ?? '',
          tintColor: m.color ?? COLORS.primary,
        }))}
        polygons={geofence}
        onMarkerClick={(event) => {
          const id = event.id;
          if (id) onPressMarker?.(id);
        }}
        onMapClick={(event) => {
          const c = event.coordinates;
          if (c?.latitude != null && c?.longitude != null) {
            onPressMap?.(c.latitude, c.longitude);
          }
        }}
      />
    );
  }

  return (
    <AppleMaps.View
      style={[styles.container, style]}
      cameraPosition={cameraPosition}
      properties={{
        isMyLocationEnabled: showUserLocation,
        selectionEnabled: true,
        mapType:
          basemap === 'satellite'
            ? AppleMaps.MapType.IMAGERY
            : AppleMaps.MapType.STANDARD,
      }}
      annotations={markers.map((m) => ({
        id: m.id,
        coordinates: { latitude: m.latitude, longitude: m.longitude },
        title: m.title ?? '',
        tintColor: m.color ?? COLORS.primary,
      }))}
      polygons={geofence}
      onMapClick={(event) => {
        const c = event.coordinates;
        if (c?.latitude != null && c?.longitude != null) {
          onPressMap?.(c.latitude, c.longitude);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
});
