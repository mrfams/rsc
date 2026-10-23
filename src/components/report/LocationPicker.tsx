/**
 * Full-screen location picker for reporting a bin.
 *
 * The map fills the screen so the exact spot can be tapped at a useful zoom,
 * and "Use my location" is an explicit choice — nothing is placed
 * automatically. Confirming returns the chosen point to the report form.
 *
 * Rendered as an in-screen overlay rather than a native Modal: map surfaces
 * inside Modal windows are unreliable on Android, while a plain absolute view
 * behaves the same on iOS, Android and web.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import type { MapMarker, MapPolygon } from '@/components/map/types';
import { Button } from '@/components/ui/Button';
import { Notice, type NoticeTone } from '@/components/ui/Notice';
import { CAMPUS_CENTER, CAMPUS_POLYGONS, COLORS } from '@/lib/constants';
import { isInsideCampus, nearestCampusPlace } from '@/lib/geo';
import { RADIUS, SHADOW } from '@/lib/theme';

export type PickedPoint = { latitude: number; longitude: number };

type NoticeState = { tone: NoticeTone; text: string } | null;

type PickerProps = {
  initial: PickedPoint | null;
  polygons?: MapPolygon[];
  onClose: () => void;
  onConfirm: (point: PickedPoint) => void;
};

/**
 * Mounted only while open, so every session starts from the form's current
 * point (or the campus) without copying props into state in an effect.
 */
export function LocationPicker({
  visible,
  initial,
  polygons = CAMPUS_POLYGONS,
  onClose,
  onConfirm,
}: PickerProps & { visible: boolean }) {
  if (!visible) return null;
  return (
    <PickerSession
      initial={initial}
      polygons={polygons}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function PickerSession({ initial, polygons = CAMPUS_POLYGONS, onClose, onConfirm }: PickerProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<PickedPoint | null>(initial);
  const [center, setCenter] = useState<PickedPoint>(initial ?? CAMPUS_CENTER);
  const [locating, setLocating] = useState(false);
  const [showUserDot, setShowUserDot] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  /* Escape (web) */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Android hardware back */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  async function locateMe() {
    setLocating(true);
    setNotice(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNotice({
          tone: 'warning',
          text: 'Location permission is off. Allow it in settings, or tap the map.',
        });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setDraft(next);
      setCenter(next);
      setShowUserDot(true);
      if (!isInsideCampus(next.latitude, next.longitude, polygons)) {
        setNotice({
          tone: 'info',
          text: 'You are outside the campus outline — that is fine, the pin saves exactly where you are.',
        });
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not get your location. Tap the map instead.' });
    } finally {
      setLocating(false);
    }
  }

  const inside = draft ? isInsideCampus(draft.latitude, draft.longitude, polygons) : false;
  // Same radius as `placeNameFor`, so the status matches the suggested name.
  const nearestPlace = draft ? nearestCampusPlace(draft, 180)?.place ?? null : null;

  const markers: MapMarker[] = draft
    ? [
        {
          id: 'report-location',
          latitude: draft.latitude,
          longitude: draft.longitude,
          kind: 'pin',
          color: COLORS.primary,
          selected: true,
          title: 'Bin location',
        },
      ]
    : [];

  return (
    <View style={styles.root}>
      <MapView
        markers={markers}
        center={center}
        zoom={17}
        polygons={polygons}
        maskOutside
        showUserLocation={showUserDot}
        onPressMap={(latitude, longitude) => {
          setDraft({ latitude, longitude });
          setNotice(null);
        }}
        style={styles.map}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel picking a location"
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="close" size={20} color={COLORS.text} />
          </Pressable>
          <View style={styles.titlePill}>
            <Text style={styles.title}>Pin the bin</Text>
            <Text style={styles.subtitle}>Tap the map to place the pin</Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom, 14) },
        ]}
      >
        {notice ? (
          <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
        ) : null}

        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, draft && styles.statusIconReady]}>
            <Ionicons
              name={draft ? 'checkmark' : 'location-outline'}
              size={16}
              color={draft ? '#FFFFFF' : COLORS.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle} numberOfLines={1}>
              {draft
                ? nearestPlace
                  ? `Near ${nearestPlace.name}`
                  : inside
                    ? 'Pin inside campus'
                    : 'Pin outside campus'
                : 'No point picked yet'}
            </Text>
            <Text style={styles.statusSub} numberOfLines={2}>
              {draft
                ? `${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)} · ${
                    inside ? 'inside the campus outline' : 'outside the campus outline'
                  }`
                : 'Tap anywhere on the map, or use your current location.'}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title="Use my location"
            icon="locate-outline"
            variant="secondary"
            onPress={() => void locateMe()}
            disabled={locating}
            style={{ flex: 1 }}
          />
          <Button
            title="Confirm pin"
            icon="checkmark"
            onPress={() => {
              if (draft) onConfirm(draft);
            }}
            disabled={!draft}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {locating ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    elevation: 50,
    backgroundColor: COLORS.bg,
  },
  map: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    zIndex: 10,
    elevation: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.md,
  },
  titlePill: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.md,
  },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  bottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    gap: 11,
    padding: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.lg,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  statusIconReady: { backgroundColor: COLORS.primary },
  statusTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statusSub: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 9 },
  loading: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    padding: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.glass,
  },
});

export default LocationPicker;
