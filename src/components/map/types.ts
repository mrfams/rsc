export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  /** Hex colour used for the marker tint/category dot. */
  color?: string;
};

export type MapViewProps = {
  markers: MapMarker[];
  center?: { latitude: number; longitude: number };
  onPressMarker?: (id: string) => void;
  onPressMap?: (latitude: number, longitude: number) => void;
  showUserLocation?: boolean;
  /** Campus boundary shading (geofence visualisation). */
  polygon?: { latitude: number; longitude: number }[];
  /** Basemap style; honoured on web (Leaflet) and native (mapType). */
  basemap?: 'streets' | 'satellite';
  style?: object;
};
