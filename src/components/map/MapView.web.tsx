/**
 * Web map: imperative Leaflet wrapper (no react-leaflet).
 *
 * Key details:
 * - Leaflet is imported inside an effect so it never runs during SSR.
 * - The root div sets `zIndex: 0`, which creates a stacking context. Without
 *   it, Leaflet's internal panes (z-index 400+) escape and cover the app's
 *   floating controls.
 * - Basemaps are keyless raster tiles: Esri World Street Map (modern, clean
 *   street style) and Esri World Imagery (satellite).
 */
import { useEffect, useRef } from 'react';

import 'leaflet/dist/leaflet.css';

import { CAMPUS_CENTER, CAMPUS_POLYGON, CATEGORY_COLORS } from '@/lib/constants';
import type { MapViewProps } from './types';

type LeafletModule = typeof import('leaflet');

const TILE_URLS = {
  // Keyless raster tiles. CARTO started requiring an API key, so the street
  // basemap is Esri's World Street Map (still a clean, modern look).
  streets:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

const ATTRIBUTIONS: Record<string, string> = {
  streets: 'Tiles &copy; Esri — Source: Esri, DeLorme, NAVTEQ, USGS',
  satellite: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
};

export default function WebMapView({
  markers,
  center = CAMPUS_CENTER,
  onPressMarker,
  onPressMap,
  basemap = 'streets',
  maskOutside = false,
  style,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const tileRef = useRef<import('leaflet').TileLayer | null>(null);
  const layersRef = useRef<Map<string, import('leaflet').CircleMarker>>(new Map());
  const markersRef = useRef(markers);
  const onPressMarkerRef = useRef(onPressMarker);
  const onPressMapRef = useRef(onPressMap);
  // Keep the latest props available to imperative callbacks without re-binding
  // Leaflet handlers. Assignment happens in an effect, never during render.
  useEffect(() => {
    markersRef.current = markers;
    onPressMarkerRef.current = onPressMarker;
    onPressMapRef.current = onPressMap;
  });

  function syncMarkers() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const seen = new Set<string>();
    for (const marker of markersRef.current) {
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
    let cancelled = false;
    // Stable instance captured once (layersRef.current is never reassigned).
    const layers = layersRef.current;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [center.latitude, center.longitude],
        zoom: 15,
        zoomControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      tileRef.current = L.tileLayer(TILE_URLS[basemap], {
        maxZoom: 19,
        attribution: ATTRIBUTIONS[basemap],
        subdomains: 'abcd',
        detectRetina: true,
      }).addTo(map);

      const campusRing: [number, number][] = CAMPUS_POLYGON.map((p) => [p.latitude, p.longitude]);

      // Campus geofence outline (non-interactive so clicks pass through).
      L.polygon(campusRing, {
        color: '#0E7490',
        weight: 2,
        dashArray: '6 6',
        fillColor: '#0E7490',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);

      if (maskOutside) {
        // Softly dim everything outside the campus: one polygon whose outer
        // ring covers the world and whose second ring punches the campus hole.
        const WORLD_RING: [number, number][] = [
          [85, -180],
          [85, 180],
          [-85, 180],
          [-85, -180],
        ];
        L.polygon([WORLD_RING, campusRing], {
          stroke: false,
          fillColor: '#0F172A',
          fillOpacity: 0.35,
          interactive: false,
        }).addTo(map);
      }

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
      tileRef.current = null;
      layers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncMarkers();
  }, [markers]);

  useEffect(() => {
    tileRef.current?.setUrl(TILE_URLS[basemap]);
  }, [basemap]);

  useEffect(() => {
    mapRef.current?.setView([center.latitude, center.longitude]);
  }, [center.latitude, center.longitude]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        width: '100%',
        height: '100%',
        ...style,
      }}
    />
  );
}
