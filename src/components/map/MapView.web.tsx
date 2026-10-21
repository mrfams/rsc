/**
 * Web map: imperative Leaflet wrapper (no react-leaflet).
 *
 * - Leaflet is imported lazily so it never runs during SSR.
 * - The geofence can contain multiple disjoint rings (main + medical campus).
 * - Bins render as custom recycling pins, never plain circles.
 * - Place names come from the basemap tiles, so only bins are drawn on top.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import 'leaflet/dist/leaflet.css';

import { CAMPUS_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/constants';
import type { MapMarker, MapPolygon, MapViewProps } from './types';

type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LeafletLayer = import('leaflet').Layer;

const TILE_URLS = {
  streets:
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

const ATTRIBUTIONS: Record<string, string> = {
  streets:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
};

/** Place/name overlay used on top of satellite imagery. */
const LABELS_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const PIN_CSS = `
.rct-pin { background: transparent !important; border: 0 !important; }
.rct-pin svg { display:block; filter: drop-shadow(0 5px 8px rgba(16,20,19,.28)); transform-origin: 50% 100%; transition: transform .16s ease; }
.rct-pin:hover svg { transform: scale(1.07); }
.rct-pin.is-selected svg { transform: scale(1.16); }
.rct-num { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:50%; border:2.5px solid #fff; color:#fff; font: 700 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; box-shadow: 0 4px 10px rgba(16,20,19,.28); transition: transform .15s ease; }
.rct-num.is-selected { transform: scale(1.25); }
.leaflet-container { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.leaflet-control-zoom { border: 1px solid #E3E8E5 !important; border-radius: 14px !important; overflow: hidden; box-shadow: 0 8px 24px rgba(16,20,19,.14) !important; }
.leaflet-control-zoom a { width: 38px !important; height: 38px !important; line-height: 38px !important; color: #101413 !important; background: rgba(255,255,255,.96) !important; font-size: 18px !important; }
.leaflet-control-zoom a:hover { background: #F3F5F4 !important; }
.leaflet-control-attribution { font-size: 9.5px !important; background: rgba(255,255,255,.78) !important; padding: 2px 6px !important; border-radius: 8px 0 0 0; }
`;

function ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('rct-map-css')) return;
  const el = document.createElement('style');
  el.id = 'rct-map-css';
  el.textContent = PIN_CSS;
  document.head.appendChild(el);
}

function safeColor(color?: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? (color as string) : '#0E7C5A';
}

function binPin(color: string, selected: boolean): string {
  return `
  <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" class="${selected ? 'is-selected' : ''}">
    <path d="M18 45C18 45 34 27.5 34 16.5C34 7.4 26.8 0 18 0C9.2 0 2 7.4 2 16.5C2 27.5 18 45 18 45Z" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
    <rect x="11" y="13" width="14" height="2.4" rx="1.2" fill="#FFFFFF"/>
    <rect x="15" y="10.4" width="6" height="2" rx="1" fill="#FFFFFF"/>
    <path d="M12.6 17h10.8l-.9 9.2c-.1 1-.9 1.7-1.9 1.7h-5.2c-1 0-1.8-.7-1.9-1.7L12.6 17Z" fill="#FFFFFF"/>
    <rect x="15.5" y="19.2" width="1.7" height="5.5" rx="0.85" fill="${color}"/>
    <rect x="18.8" y="19.2" width="1.7" height="5.5" rx="0.85" fill="${color}"/>
  </svg>`;
}

function reportPin(color: string, selected: boolean): string {
  return `
  <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" class="${selected ? 'is-selected' : ''}">
    <path d="M18 45C18 45 34 27.5 34 16.5C34 7.4 26.8 0 18 0C9.2 0 2 7.4 2 16.5C2 27.5 18 45 18 45Z" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
    <circle cx="18" cy="16.5" r="5" fill="#FFFFFF"/>
    <circle cx="18" cy="16.5" r="8.5" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.55"/>
  </svg>`;
}

function iconFor(marker: MapMarker) {
  const color = safeColor(marker.color);
  if ((marker.kind ?? 'bin') === 'numbered') {
    return {
      html: `<div class="rct-num ${marker.selected ? 'is-selected' : ''}" style="background:${color}">${marker.label ?? ''}</div>`,
      size: [30, 30] as [number, number],
      anchor: [15, 15] as [number, number],
    };
  }
  const html = (marker.kind === 'pin' ? reportPin : binPin)(color, Boolean(marker.selected));
  return { html, size: [36, 46] as [number, number], anchor: [18, 45] as [number, number] };
}

function markerSignature(marker: MapMarker): string {
  return [marker.kind ?? 'bin', safeColor(marker.color), marker.selected ? 1 : 0, marker.label ?? ''].join('|');
}

export default function WebMapView({
  markers,
  center = CAMPUS_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  onPressMarker,
  onPressMap,
  basemap = 'satellite',
  polygon,
  polygons,
  maskOutside = false,
  fitToPolygon = false,
  style,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const baseLayerRef = useRef<LeafletLayer | null>(null);
  const placesLayerRef = useRef<LeafletLayer | null>(null);
  const polygonLayerRef = useRef<LeafletLayer | null>(null);
  const maskLayerRef = useRef<LeafletLayer | null>(null);
  const pinsRef = useRef(new Map<string, { layer: import('leaflet').Marker; signature: string }>());
  const markersRef = useRef(markers);
  const onPressMarkerRef = useRef(onPressMarker);
  const onPressMapRef = useRef(onPressMap);
  const [ready, setReady] = useState(false);

  const rings: MapPolygon[] = useMemo(
    () => polygons ?? (polygon && polygon.length >= 3 ? [polygon] : []),
    [polygons, polygon],
  );

  useEffect(() => {
    markersRef.current = markers;
    onPressMarkerRef.current = onPressMarker;
    onPressMapRef.current = onPressMap;
  });

  useEffect(() => {
    ensureCss();
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const pins = pinsRef.current;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [center.latitude, center.longitude],
        zoom,
        zoomControl: false,
        zoomSnap: 0.25,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      map.on('click', (event) => {
        onPressMapRef.current?.(event.latlng.lat, event.latlng.lng);
      });

      mapRef.current = map;

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);
      }

      window.requestAnimationFrame(() => {
        map.invalidateSize();
        setReady(true);
      });
      setTimeout(() => map.invalidateSize(), 350);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const map = mapRef.current;
      if (map) map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      placesLayerRef.current = null;
      polygonLayerRef.current = null;
      maskLayerRef.current = null;
      pins.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Basemap + optional places overlay */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    baseLayerRef.current?.remove();
    placesLayerRef.current?.remove();
    placesLayerRef.current = null;

    baseLayerRef.current = L.tileLayer(TILE_URLS[basemap], {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: ATTRIBUTIONS[basemap],
      detectRetina: true,
      ...(basemap === 'streets' ? { subdomains: 'abcd' } : {}),
    }).addTo(map);

    if (basemap === 'satellite') {
      placesLayerRef.current = L.tileLayer(LABELS_URL, {
        maxZoom: 20,
        maxNativeZoom: 19,
        opacity: 0.95,
      }).addTo(map);
    }
  }, [basemap, ready]);

  /* Geofence + outside dimming */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    polygonLayerRef.current?.remove();
    maskLayerRef.current?.remove();
    polygonLayerRef.current = null;
    maskLayerRef.current = null;

    const validRings = rings.filter((ring) => ring.length >= 3);
    if (validRings.length === 0) return;

    const boundary = L.featureGroup();
    for (const ring of validRings) {
      boundary.addLayer(
        L.polygon(ring.map((p): [number, number] => [p.latitude, p.longitude]), {
          color: '#0E7C5A',
          weight: 2,
          dashArray: '7 6',
          fillColor: '#0E7C5A',
          fillOpacity: 0.07,
          interactive: false,
        }),
      );
    }
    boundary.addTo(map);
    polygonLayerRef.current = boundary;

    if (maskOutside) {
      const WORLD_RING: [number, number][] = [
        [85, -180],
        [85, 180],
        [-85, 180],
        [-85, -180],
      ];
      const holes = validRings.map((ring) =>
        ring.map((p): [number, number] => [p.latitude, p.longitude]),
      );
      maskLayerRef.current = L.polygon([WORLD_RING, ...holes] as [number, number][][], {
        stroke: false,
        fillColor: '#101413',
        fillOpacity: 0.26,
        interactive: false,
      }).addTo(map);
    }

    if (fitToPolygon) {
      const all = validRings.flat().map((p): [number, number] => [p.latitude, p.longitude]);
      map.fitBounds(L.latLngBounds(all), { padding: [34, 34], maxZoom: 17, animate: false });
    }
  }, [rings, maskOutside, fitToPolygon, ready]);

  /* Markers */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    const seen = new Set<string>();
    for (const marker of markersRef.current) {
      seen.add(marker.id);
      const position: [number, number] = [marker.latitude, marker.longitude];
      const icon = iconFor(marker);
      const signature = markerSignature(marker);
      const existing = pinsRef.current.get(marker.id);

      if (existing) {
        existing.layer.setLatLng(position);
        if (existing.signature !== signature) {
          existing.layer.setIcon(
            L.divIcon({
              className: `rct-pin ${marker.selected ? 'is-selected' : ''}`,
              html: icon.html,
              iconSize: icon.size,
              iconAnchor: icon.anchor,
            }),
          );
          existing.signature = signature;
        }
        existing.layer.setZIndexOffset(marker.selected ? 1000 : 0);
        continue;
      }

      const layer = L.marker(position, {
        icon: L.divIcon({
          className: `rct-pin ${marker.selected ? 'is-selected' : ''}`,
          html: icon.html,
          iconSize: icon.size,
          iconAnchor: icon.anchor,
        }),
        keyboard: false,
        zIndexOffset: marker.selected ? 1000 : 0,
        title: marker.title,
      }).addTo(map);

      layer.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        onPressMarkerRef.current?.(marker.id);
      });

      pinsRef.current.set(marker.id, { layer, signature });
    }

    for (const [id, entry] of pinsRef.current) {
      if (!seen.has(id)) {
        entry.layer.remove();
        pinsRef.current.delete(id);
      }
    }
  }, [markers, ready]);

  /* Recenter when the caller asks for it */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || fitToPolygon) return;
    map.setView([center.latitude, center.longitude], zoom, { animate: true });
  }, [center.latitude, center.longitude, zoom, ready, fitToPolygon]);

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
