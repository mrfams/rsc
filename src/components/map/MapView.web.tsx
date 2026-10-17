/**
 * Web map: imperative Leaflet wrapper (no react-leaflet).
 * Leaflet is imported inside an effect so it can never run during SSR.
 */
import { useEffect, useRef } from 'react';

import 'leaflet/dist/leaflet.css';

import { CATEGORY_COLORS, CAMPUS_CENTER } from '@/lib/constants';
import type { MapViewProps } from './types';

type LeafletModule = typeof import('leaflet');

export default function WebMapView({
  markers,
  center = CAMPUS_CENTER,
  onPressMarker,
  onPressMap,
  style,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const layersRef = useRef<Map<string, import('leaflet').CircleMarker>>(new Map());
  // Callbacks live in refs so event handlers never need re-binding.
  const onPressMarkerRef = useRef(onPressMarker);
  const onPressMapRef = useRef(onPressMap);
  onPressMarkerRef.current = onPressMarker;
  onPressMapRef.current = onPressMap;

  useEffect(() => {
    let cancelled = false;
    // Stable instance captured once; layersRef.current is never reassigned.
    const layers = layersRef.current;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [center.latitude, center.longitude],
        zoom: 15,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      map.on('click', (event) => {
        onPressMapRef.current?.(event.latlng.lat, event.latlng.lng);
      });

      mapRef.current = map;
      // The container may have resized during layout.
      setTimeout(() => map.invalidateSize(), 250);
      syncMarkers();
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current;
      map?.remove();
      mapRef.current = null;
      layers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncMarkers() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      const position: [number, number] = [marker.latitude, marker.longitude];
      const existing = layersRef.current.get(marker.id);
      if (existing) {
        existing.setLatLng(position);
        continue;
      }
      const layer = L.circleMarker(position, {
        radius: 9,
        color: '#FFFFFF',
        weight: 2,
        fillColor: marker.color ?? CATEGORY_COLORS.general,
        fillOpacity: 1,
      }).addTo(map);
      layer.on('click', () => onPressMarkerRef.current?.(marker.id));
      layersRef.current.set(marker.id, layer);
    }
    for (const [id, layer] of layersRef.current) {
      if (!seen.has(id)) {
        layer.remove();
        layersRef.current.delete(id);
      }
    }
  }

  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

  useEffect(() => {
    mapRef.current?.setView([center.latitude, center.longitude]);
  }, [center.latitude, center.longitude]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        ...style,
      }}
    />
  );
}
