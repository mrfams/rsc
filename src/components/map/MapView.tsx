/**
 * Native map: MapLibre React Native (vector, keyless).
 *
 * Markers are real recycling pins drawn with React Native views. The basemap
 * style already carries place and building labels, so the map adds bins only.
 */
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { CAMPUS_CENTER, CAMPUS_PLACES, DEFAULT_MAP_ZOOM } from '@/lib/constants';
import { SHADOW } from '@/lib/theme';
import type { MapMarker, MapPolygon, MapViewProps } from './types';

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
    places: {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  // Campus labels are a symbol layer, so the satellite style needs glyphs too.
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'esri-imagery', type: 'raster', source: 'esri' },
    { id: 'esri-places', type: 'raster', source: 'places' },
  ],
};

function ringToGeoJSON(polygon: MapPolygon): Position[] {
  return polygon.map((p): Position => [p.longitude, p.latitude]);
}

/** Shoelace area; positive means counter-clockwise in lng/lat space. */
function signedArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

/** RFC 7946: exterior rings counter-clockwise, holes clockwise. */
function orientRing(ring: Position[], counterClockwise: boolean): Position[] {
  const isCounterClockwise = signedArea(ring) > 0;
  return isCounterClockwise === counterClockwise ? ring : [...ring].reverse();
}

function pinColor(marker: MapMarker): string {
  return /^#[0-9a-fA-F]{6}$/.test(marker.color ?? '') ? (marker.color as string) : '#0E7C5A';
}

function MarkerBody({ marker }: { marker: MapMarker }) {
  const color = pinColor(marker);
  if ((marker.kind ?? 'bin') === 'numbered') {
    return (
      <View
        style={[
          styles.numberPin,
          { backgroundColor: color },
          marker.selected && styles.numberPinSelected,
        ]}
      >
        <Text style={styles.numberText}>{marker.label ?? ''}</Text>
      </View>
    );
  }

  if (marker.kind === 'pin') {
    return (
      <View style={[styles.pinWrap, marker.selected && { transform: [{ scale: 1.16 }] }]}>
        <View style={[styles.pinHead, { backgroundColor: color }]}>
          <View style={styles.pinDot} />
        </View>
        <View style={[styles.pinTail, { borderTopColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[styles.pinWrap, marker.selected && { transform: [{ scale: 1.16 }] }]}>
      <View style={[styles.pinHead, { backgroundColor: color }]}>
        <Ionicons name="trash" size={17} color="#FFFFFF" />
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

const PLACES_GEOJSON = {
  type: 'FeatureCollection' as const,
  features: CAMPUS_PLACES.map((place) => ({
    type: 'Feature' as const,
    id: place.name,
    properties: { name: place.name, priority: place.priority },
    geometry: {
      type: 'Point' as const,
      coordinates: [place.longitude, place.latitude] as Position,
    },
  })),
};

function fitCenter(polygons: MapPolygon[] | undefined) {
  if (!polygons?.length) return CAMPUS_CENTER;
  const points = polygons.flat();
  if (points.length === 0) return CAMPUS_CENTER;
  const lat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;
  return { latitude: lat, longitude: lng };
}

export default function MapView({
  markers,
  center = CAMPUS_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  onPressMarker,
  onPressMap,
  showUserLocation = true,
  basemap = 'streets',
  polygon,
  polygons,
  maskOutside = false,
  showPlaceLabels = true,
  fitToPolygon = false,
  style,
}: MapViewProps) {
  const mapStyle = basemap === 'satellite' ? SATELLITE_STYLE : STREET_STYLE_URL;

  const rings: MapPolygon[] = useMemo(() => {
    if (polygons?.length) return polygons;
    if (polygon?.length) return [polygon];
    return [];
  }, [polygon, polygons]);

  const viewCenter = useMemo(
    () => (fitToPolygon ? fitCenter(rings) : center),
    [fitToPolygon, rings, center],
  );

  const campusGeoJSON = useMemo<Feature<MultiPolygon> | null>(() => {
    const valid = rings.filter((ring) => ring.length >= 3);
    if (valid.length === 0) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: valid.map((ring) => [ringToGeoJSON(ring)]),
      },
    };
  }, [rings]);

  const maskGeoJSON = useMemo<Feature<Polygon> | null>(() => {
    const valid = rings.filter((ring) => ring.length >= 3);
    if (valid.length === 0 || !maskOutside) return null;
    const world: Position[] = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          orientRing(world, true),
          ...valid.map((ring) => orientRing(ringToGeoJSON(ring), false)),
        ],
      },
    };
  }, [rings, maskOutside]);

  const ordered = useMemo(
    () => [...markers].sort((a, b) => Number(Boolean(a.selected)) - Number(Boolean(b.selected))),
    [markers],
  );

  return (
    <Map
      style={[styles.container, style]}
      mapStyle={mapStyle}
      onPress={(event) => {
        const [lng, lat] = event.nativeEvent.lngLat;
        onPressMap?.(lat, lng);
      }}
    >
      <Camera
        key={`${viewCenter.longitude.toFixed(5)},${viewCenter.latitude.toFixed(5)},${zoom},${fitToPolygon ? rings.length : 0}`}
        initialViewState={{ center: [viewCenter.longitude, viewCenter.latitude], zoom }}
      />

      {maskGeoJSON ? (
        <GeoJSONSource id="outside-mask" data={maskGeoJSON}>
          <Layer
            id="outside-mask-fill"
            type="fill"
            paint={{ 'fill-color': '#101413', 'fill-opacity': 0.5 }}
          />
        </GeoJSONSource>
      ) : null}

      {campusGeoJSON ? (
        <GeoJSONSource id="campus-boundary" data={campusGeoJSON}>
          <Layer
            id="campus-boundary-fill"
            type="fill"
            paint={{ 'fill-color': '#0E7C5A', 'fill-opacity': 0.3 }}
          />
          <Layer
            id="campus-boundary-line"
            type="line"
            paint={{ 'line-color': '#0E7C5A', 'line-width': 2, 'line-dasharray': [2, 2] }}
          />
        </GeoJSONSource>
      ) : null}

      {/* Named campus places come from the curated OSM list: the raster
          basemap never labels EMU buildings at this zoom. Major places show
          first, the rest appear when the user zooms in. */}
      {showPlaceLabels ? (
        <GeoJSONSource id="campus-places" data={PLACES_GEOJSON}>
          <Layer
            id="campus-places-major"
            type="symbol"
            filter={['==', ['get', 'priority'], 1]}
            minzoom={13.5}
            layout={{
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10.5, 17, 13.5],
              'text-anchor': 'top',
              'text-offset': [0, 0.6],
              'text-max-width': 9,
              'text-padding': 3,
            }}
            paint={{
              'text-color': '#101413',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 1.6,
              'text-halo-blur': 0.4,
            }}
          />
          <Layer
            id="campus-places-all"
            type="symbol"
            filter={['==', ['get', 'priority'], 2]}
            minzoom={16}
            layout={{
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11, 19, 14],
              'text-anchor': 'top',
              'text-offset': [0, 0.6],
              'text-max-width': 9,
              'text-padding': 3,
            }}
            paint={{
              'text-color': '#3F4945',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 1.5,
              'text-halo-blur': 0.4,
            }}
          />
        </GeoJSONSource>
      ) : null}

      {ordered.map((marker) => (
        <Marker
          key={marker.id}
          id={marker.id}
          lngLat={[marker.longitude, marker.latitude]}
          anchor={(marker.kind ?? 'bin') === 'numbered' ? 'center' : 'bottom'}
          onPress={() => onPressMarker?.(marker.id)}
        >
          <MarkerBody marker={marker} />
        </Marker>
      ))}

      {showUserLocation ? <UserLocation /> : null}
    </Map>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  pinWrap: { alignItems: 'center' },
  pinHead: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.md,
  },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  numberPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.md,
  },
  numberPinSelected: { transform: [{ scale: 1.22 }] },
  numberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});
