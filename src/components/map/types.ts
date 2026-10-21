export type MapMarkerKind = 'bin' | 'pin' | 'numbered';

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  /** Hex colour used for the marker fill. */
  color?: string;
  /** bin = recycling pin, pin = report location, numbered = geofence vertex. */
  kind?: MapMarkerKind;
  /** Number shown inside a `numbered` marker. */
  label?: string;
  /** Highlight the active marker. */
  selected?: boolean;
};

export type MapPolygon = { latitude: number; longitude: number }[];

export type MapViewProps = {
  markers: MapMarker[];
  center?: { latitude: number; longitude: number };
  zoom?: number;
  onPressMarker?: (id: string) => void;
  onPressMap?: (latitude: number, longitude: number) => void;
  showUserLocation?: boolean;
  /** Campus boundary shading (legacy single ring). */
  polygon?: { latitude: number; longitude: number }[];
  /** Campus boundary shading (all disjoint rings). */
  polygons?: MapPolygon[];
  /** Dim everything outside the polygon. */
  maskOutside?: boolean;
  /** Basemap style; honoured on web (Leaflet) and native (MapLibre). */
  basemap?: 'streets' | 'satellite';
  /** Fit the viewport to the polygon (used by the geofence editor). */
  fitToPolygon?: boolean;
  style?: object;
};
