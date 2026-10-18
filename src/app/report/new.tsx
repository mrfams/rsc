import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { Field } from '@/components/ui/Field';
import { api } from '@/lib/api-client';
import { CAMPUS_CENTER, CAMPUS_POLYGON, COLORS } from '@/lib/constants';
import { isInsideCampus } from '@/lib/geo';
import { enqueueReport } from '@/lib/offline';
import type { ReportInput } from '@/lib/validation';

type AppConfigDto = {
  campusPolygon: { latitude: number; longitude: number }[];
  categories: { slug: string; name: string; emoji: string; color: string; active: boolean }[];
};

type PickedPhoto = { uri: string; base64: string };

export default function NewReportScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfigDto>('/api/config'),
  });
  const categories: AppConfigDto['categories'] = config?.categories ?? [];
  const campusPolygon =
    !config || config.campusPolygon.length === 0 ? CAMPUS_POLYGON : config.campusPolygon;

  const [category, setCategory] = useState<string>('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);

  // The chip the user tapped, defaulting to the first available category as
  // soon as the catalogue arrives (no state-sync effect needed).
  const selectedCategory = category || categories[0]?.slug || '';

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: 5 });
          setPin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      } finally {
        setLoadingLocation(false);
      }
    })();
  }, []);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
      exif: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const source = result.assets[0];

    try {
      // Resize so the base64 payload stays under the server cap.
      const context = ImageManipulator.manipulate(source.uri).resize({ width: 1280 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({
        compress: 0.7,
        format: SaveFormat.JPEG,
        base64: true,
      });
      setPhoto({
        uri: saved.uri,
        base64: `data:image/jpeg;base64,${saved.base64 ?? ''}`,
      });
    } catch {
      Alert.alert('Photo', 'Could not process the photo, please pick another.');
    }
  }

  async function submit() {
    if (!pin) {
      Alert.alert('Location required', 'Tap the map to place the bin.');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Just a second', 'Pick a category once the list loads.');
      return;
    }
    if (!isInsideCampus(pin.latitude, pin.longitude, campusPolygon)) {
      Alert.alert('Outside campus', 'Place the pin inside the highlighted campus boundary.');
      return;
    }
    setBusy(true);
    try {
      const body: ReportInput = {
        lat: pin.latitude,
        lng: pin.longitude,
        category: selectedCategory,
        note: note.trim() ? note.trim() : undefined,
        photoBase64: photo?.base64,
      };
      await api('/api/reports', { method: 'POST', json: body });
      await queryClient.invalidateQueries({ queryKey: ['bins'] });
      if (Platform.OS === 'web') router.replace('/');
      else Alert.alert('Thanks!', 'Your bin is on the map.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status == null) {
        // Network unreachable → queue it and let the map screen send it later.
        const body: ReportInput = {
          lat: pin.latitude,
          lng: pin.longitude,
          category: selectedCategory,
          note: note.trim() ? note.trim() : undefined,
          photoBase64: photo?.base64,
        };
        await enqueueReport(body);
        router.replace('/');
      } else {
        Alert.alert('Submit failed', err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const markers: MapMarker[] = pin ? [{ id: 'pin', ...pin, title: 'Report location' }] : [];
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <Text style={styles.title}>Report a bin</Text>

        <View style={styles.mapCard}>
          <MapView
            markers={markers}
            center={pin ?? CAMPUS_CENTER}
            polygon={campusPolygon}
            showUserLocation
            onPressMap={(lat, lng) => setPin({ latitude: lat, longitude: lng })}
            style={styles.map}
          />
          <Text style={styles.mapHint}>
            {loadingLocation
              ? 'Locating you…'
              : pin && isInsideCampus(pin.latitude, pin.longitude, campusPolygon) === false
                ? '⚠️ Pin is outside the campus boundary.'
                : pin
                  ? 'Tap the map to fine-tune, then submit.'
                  : 'Tap the map to place the bin inside the boundary.'}
          </Text>
        </View>

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {categories.map((c) => (
            <Pressable
              key={c.slug}
              onPress={() => setCategory(c.slug)}
              style={[styles.chip, selectedCategory === c.slug && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedCategory === c.slug && styles.chipTextActive]}>
                {c.emoji} {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. outside library, full" multiline />

        <Text style={styles.label}>Photo (optional)</Text>
        {photo ? (
          <View style={styles.photoRow}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            <Pressable onPress={() => setPhoto(null)}>
              <Text style={styles.photoRemove}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickPhoto} style={styles.photoButton}>
            <Text style={styles.photoButtonText}>📷 Pick a photo</Text>
          </Pressable>
        )}

        <Pressable style={[styles.submitButton, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit report</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  close: { alignSelf: 'flex-end', padding: 8 },
  closeText: { fontSize: 20, color: COLORS.textMuted },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  map: { height: 260, width: '100%' },
  mapHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 6, marginLeft: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  photoButton: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  photoButtonText: { color: COLORS.primary, fontWeight: '600' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoPreview: { width: 110, height: 82, borderRadius: 10, backgroundColor: COLORS.border },
  photoRemove: { color: COLORS.danger, fontWeight: '600' },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
