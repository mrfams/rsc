/**
 * Native map: expo-maps (Apple Maps on iOS, Google Maps on Android).
 * expo-maps has no web support, which is why this file has no `.web` twin:
 * Metro loads MapView.web.tsx for web and this file for native.
 */
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { Platform, StyleSheet } from 'react-native';

import { CAMPUS_CENTER } from '@/lib/constants';
import type { MapMarker, MapViewProps } from './types';

export type { MapMarker, MapViewProps };

export default function MapView({
  markers,
  center = CAMPUS_CENTER,
  onPressMarker,
  onPressMap,
  showUserLocation = true,
  style,
}: MapViewProps) {
  const cameraPosition = {
    coordinates: { latitude: center.latitude, longitude: center.longitude },
    zoom: 14,
  };

  if (Platform.OS === 'android') {
    return (
      <GoogleMaps.View
        style={[styles.container, style]}
        cameraPosition={cameraPosition}
        properties={{ isMyLocationEnabled: showUserLocation }}
        markers={markers.map((m) => ({
          id: m.id,
          coordinates: { latitude: m.latitude, longitude: m.longitude },
          title: m.title ?? '',
          tintColor: m.color ?? '#0E7490',
        }))}
        onMarkerClick={(event) => {
          const id = event.id;
          if (id) onPressMarker?.(id);
        }}
        onMapClick={(event) => {
          const c = event.coordinates;
          if (c?.latitude != null && c?.longitude != null) onPressMap?.(c.latitude, c.longitude);
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
      }}
      annotations={markers.map((m) => ({
        id: m.id,
        coordinates: { latitude: m.latitude, longitude: m.longitude },
        title: m.title ?? '',
        tintColor: m.color ?? '#0E7490',
      }))}
      onMapClick={(event) => {
        const c = event.coordinates;
        if (c?.latitude != null && c?.longitude != null) onPressMap?.(c.latitude, c.longitude);
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
});
