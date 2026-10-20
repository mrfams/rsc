import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CAMPUS_CENTER, CAMPUS_POLYGONS, COLORS } from '@/lib/constants';
import { isInsideCampus, placeNameFor } from '@/lib/geo';
import { enqueueReport } from '@/lib/offline';
import { RADIUS, SHADOW } from '@/lib/theme';
import type { ReportInput } from '@/lib/validation';

type AppConfig = {
  campusPolygons?: { latitude: number; longitude: number }[][];
  campusPolygon?: { latitude: number; longitude: number }[];
  categories: { slug: string; name: string; emoji: string; color: string; active: boolean }[];
};

type PickedPhoto = { uri: string; base64: string };

type NoticeState = { tone: 'error' | 'success' | 'info' | 'warning'; text: string } | null;

export default function NewReportScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfig>('/api/config'),
  });
  const categories = (config?.categories ?? []).filter((c) => c.active);
  const campusPolygons =
    config?.campusPolygons?.filter((ring) => ring.length >= 3) ??
    (config?.campusPolygon && config.campusPolygon.length >= 3
      ? [config.campusPolygon]
      : CAMPUS_POLYGONS);

  const [category, setCategory] = useState('');
  const [locationName, setLocationName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitted, setSubmitted] = useState<'online' | 'offline' | null>(null);
  const [newBinId, setNewBinId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [center, setCenter] = useState(CAMPUS_CENTER);

  const selectedCategory = category || categories[0]?.slug || '';
  const selectedMeta = categories.find((c) => c.slug === selectedCategory);
  const inside = pin ? isInsideCampus(pin.latitude, pin.longitude, campusPolygons) : false;

  function placePin(next: { latitude: number; longitude: number }) {
    setPin(next);
    if (!nameTouched) setLocationName(placeNameFor(next) ?? '');
    setNotice(null);
  }

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (isInsideCampus(next.latitude, next.longitude, campusPolygons)) {
          placePin(next);
          setCenter(next);
        }
      } catch {
        // Optional: the user can still tap the campus map.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function placeAtMyLocation() {
    setLocating(true);
    setNotice(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNotice({ tone: 'error', text: 'Location permission is off. Tap the map to place it.' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      if (isInsideCampus(next.latitude, next.longitude, campusPolygons)) {
        placePin(next);
        setCenter(next);
      } else {
        setPin(null);
        setCenter(CAMPUS_CENTER);
        setNotice({
          tone: 'warning',
          text: 'You are off campus — showing the campus map. Tap the bin location inside the boundary.',
        });
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not get your location. Tap the map instead.' });
    } finally {
      setLocating(false);
    }
  }

  async function pickPhoto(source: 'library' | 'camera') {
    setNotice(null);
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
        exif: false,
      };
      const result =
        source === 'camera' && Platform.OS !== 'web'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];

      const context = ImageManipulator.manipulate(asset.uri).resize({ width: 1280 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({
        compress: 0.7,
        format: SaveFormat.JPEG,
        base64: true,
      });
      setPhoto({ uri: saved.uri, base64: `data:image/jpeg;base64,${saved.base64 ?? ''}` });
    } catch {
      setNotice({ tone: 'error', text: 'Could not process that photo. Try another one.' });
    }
  }

  async function submit() {
    if (!pin) {
      setNotice({ tone: 'error', text: 'Tap the map to place the bin first.' });
      return;
    }
    if (!selectedCategory) {
      setNotice({ tone: 'error', text: 'Pick the bin type.' });
      return;
    }
    if (!isInsideCampus(pin.latitude, pin.longitude, campusPolygons)) {
      setNotice({ tone: 'error', text: 'Place the pin inside the highlighted campus boundary.' });
      return;
    }
    if (!session?.user) {
      setNotice({ tone: 'info', text: 'Sign in to publish this report. Your draft stays here.' });
      router.push('/sign-in');
      return;
    }

    const body: ReportInput = {
      lat: pin.latitude,
      lng: pin.longitude,
      category: selectedCategory,
      name: locationName.trim() ? locationName.trim() : undefined,
      note: note.trim() ? note.trim() : undefined,
      photoBase64: photo?.base64,
    };

    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ binId?: string }>('/api/reports', { method: 'POST', json: body });
      await queryClient.invalidateQueries({ queryKey: ['bins'] });
      await queryClient.invalidateQueries({ queryKey: ['my-reports'] });
      setNewBinId(result?.binId ?? null);
      setSavedName(locationName.trim());
      setSubmitted('online');
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        setNotice({ tone: 'info', text: 'Your session expired. Sign in and submit again.' });
        router.push('/sign-in');
      } else if (status == null) {
        await enqueueReport(body);
        setSubmitted('offline');
      } else {
        setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Submit failed.' });
      }
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.successRoot}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons
              name={submitted === 'offline' ? 'cloud-done-outline' : 'checkmark'}
              size={38}
              color={COLORS.success}
            />
          </View>
          <Text style={styles.successTitle}>
            {submitted === 'offline' ? 'Saved for later' : 'Bin added'}
          </Text>
          <Text style={styles.successText}>
            {submitted === 'offline'
              ? 'Your report is queued. It will upload automatically when you are back online.'
              : `${savedName ? `${savedName} is` : 'Your bin is'} now on the campus map. Other members can confirm it as a second sighting.`}
          </Text>
          <Button
            title={submitted === 'online' && newBinId ? 'See it on the map' : 'Back to the map'}
            icon="map-outline"
            onPress={() =>
              router.replace(
                submitted === 'online' && newBinId
                  ? { pathname: '/', params: { bin: newBinId } }
                  : '/',
              )
            }
            style={{ width: '100%' }}
          />
          <Button
            title="Report another"
            variant="secondary"
            onPress={() => {
              setSubmitted(null);
              setNewBinId(null);
              setPin(null);
              setNote('');
              setPhoto(null);
            }}
            style={{ width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const markers: MapMarker[] =
    pin === null
      ? []
      : [
          {
            id: 'report-pin',
            latitude: pin.latitude,
            longitude: pin.longitude,
            kind: 'pin',
            color: selectedMeta?.color ?? COLORS.primary,
            selected: true,
            title: 'Report location',
          },
        ];

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Close report form"
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={20} color={COLORS.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Report a bin</Text>
          <Text style={styles.headerSub}>Takes about 30 seconds</Text>
        </View>
        {!session?.user ? (
          <Button title="Sign in" size="sm" variant="secondary" onPress={() => router.push('/sign-in')} />
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.sectionHead}>
            <View style={styles.stepDot}>
              <Text style={styles.stepText}>1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Where is the bin?</Text>
              <Text style={styles.sectionSub}>Tap the exact spot on the map.</Text>
            </View>
          </View>

          <View style={styles.mapCard}>
            <MapView
              markers={markers}
              center={center}
              polygons={campusPolygons}
              showUserLocation
              maskOutside
              onPressMap={(lat, lng) => placePin({ latitude: lat, longitude: lng })}
              style={styles.map}
            />
            <Pressable
              onPress={() => void placeAtMyLocation()}
              style={({ pressed }) => [styles.locate, pressed && { opacity: 0.8 }]}
            >
              {locating ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="locate" size={17} color={COLORS.primary} />
              )}
              <Text style={styles.locateText}>Use my location</Text>
            </Pressable>
          </View>

          <View style={styles.pinHint}>
            <Ionicons
              name={pin ? (inside ? 'checkmark-circle' : 'alert-circle') : 'hand-left-outline'}
              size={15}
              color={pin ? (inside ? COLORS.success : COLORS.warning) : COLORS.textMuted}
            />
            <Text
              style={[
                styles.pinHintText,
                pin && !inside && { color: COLORS.warning },
                pin && inside && { color: COLORS.success },
              ]}
            >
              {pin
                ? inside
                  ? 'Pin placed inside campus.'
                  : 'That spot is outside campus — move the pin inside the boundary.'
                : 'No pin yet. Tap the map or use your location.'}
            </Text>
          </View>

          <View style={styles.sectionHead}>
            <View style={styles.stepDot}>
              <Text style={styles.stepText}>2</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>What kind of bin?</Text>
              <Text style={styles.sectionSub}>Pick the closest match.</Text>
            </View>
          </View>

          <View style={styles.categoryGrid}>
            {categories.map((c) => {
              const active = selectedCategory === c.slug;
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => setCategory(c.slug)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.categoryCard,
                    active && { borderColor: c.color, backgroundColor: `${c.color}0F` },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[styles.categoryEmojiWrap, { backgroundColor: `${c.color}18` }]}>
                    <Text style={styles.categoryEmoji}>{c.emoji}</Text>
                  </View>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      active && { backgroundColor: c.color, borderColor: c.color },
                    ]}
                  >
                    {active ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHead}>
            <View style={styles.stepDot}>
              <Text style={styles.stepText}>3</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Add details</Text>
              <Text style={styles.sectionSub}>Optional, but photos help a lot.</Text>
            </View>
          </View>

          <Field
            label="Place name"
            value={locationName}
            onChangeText={(value) => {
              setLocationName(value);
              setNameTouched(true);
            }}
            placeholder="e.g. DAU 3 Dormitory, outside the library"
            icon="location-outline"
            autoCapitalize="words"
            maxLength={80}
            hint="We suggest the nearest campus building — edit it if you know the exact spot."
          />

          <Field
            label="Note"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. outside the library stairs, slightly full"
            multiline
            maxLength={500}
            icon="create-outline"
          />

          {photo ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.photoTitle}>Photo attached</Text>
                <Text style={styles.photoSub}>Compressed automatically before upload.</Text>
                <Button title="Remove photo" variant="ghost" size="sm" onPress={() => setPhoto(null)} />
              </View>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <Pressable
                onPress={() => void pickPhoto('camera')}
                style={({ pressed }) => [styles.photoButton, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
                <Text style={styles.photoButtonText}>Camera</Text>
              </Pressable>
              <Pressable
                onPress={() => void pickPhoto('library')}
                style={({ pressed }) => [styles.photoButton, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                <Text style={styles.photoButtonText}>Library</Text>
              </Pressable>
            </View>
          )}

          {notice ? (
            <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={session?.user ? 'Publish report' : 'Sign in to publish'}
          icon="paper-plane-outline"
          onPress={() => void submit()}
          loading={busy}
          size="lg"
        />
        <Text style={styles.footerHint}>
          {pin && inside ? 'Ready to publish.' : 'Place a pin inside campus to publish.'}
        </Text>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  scroll: { paddingBottom: 28 },
  content: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    padding: 20,
    gap: 14,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 1 },
  mapCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  map: { height: 286, width: '100%' },
  locate: {
    position: 'absolute',
    right: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  locateText: { fontSize: 11.5, fontWeight: '700', color: COLORS.primary },
  pinHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  pinHintText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  categoryCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 11,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  categoryEmojiWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 19 },
  categoryName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    gap: 13,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoPreview: { width: 104, height: 104, borderRadius: 12, backgroundColor: COLORS.surfaceAlt },
  photoTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  photoSub: { fontSize: 12, color: COLORS.textMuted },
  photoButtons: { flexDirection: 'row', gap: 9 },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(14,124,90,0.18)',
  },
  photoButtonText: { fontSize: 13.5, fontWeight: '700', color: COLORS.primary },
  footer: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 6,
  },
  footerHint: { fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center' },
  successRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  successCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    ...SHADOW.lg,
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: { fontSize: 25, fontWeight: '800', color: COLORS.text, letterSpacing: -0.7 },
  successText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
});
