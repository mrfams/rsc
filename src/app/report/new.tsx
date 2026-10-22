import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { LocationPicker, type PickedPoint } from '@/components/report/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CAMPUS_POLYGONS, COLORS } from '@/lib/constants';
import { isInsideCampus, placeNameFor } from '@/lib/geo';
import { enqueueReport } from '@/lib/offline';
import { preparePhoto } from '@/lib/photo-client';
import { RADIUS, SHADOW } from '@/lib/theme';
import type { ReportInput } from '@/lib/validation';

type AppConfig = {
  campusPolygons?: { latitude: number; longitude: number }[][];
  campusPolygon?: { latitude: number; longitude: number }[];
  categories: { slug: string; name: string; emoji: string; color: string; active: boolean }[];
};

type PickedPhoto = { uri: string; base64: string };

type PinSource = 'map' | 'location';

type NoticeState = { tone: 'error' | 'success' | 'info' | 'warning'; text: string } | null;

type PhotoSource = 'camera' | 'photos';

export default function NewReportScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const {
    data: config,
    isError: configError,
    refetch: refetchConfig,
  } = useQuery({
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
  const [pin, setPin] = useState<PickedPoint | null>(null);
  const [pinSource, setPinSource] = useState<PinSource | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState<'online' | 'offline' | null>(null);
  const [newBinId, setNewBinId] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [savedName, setSavedName] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);

  const selectedMeta = categories.find((c) => c.slug === category);
  const inside = pin ? isInsideCampus(pin.latitude, pin.longitude, campusPolygons) : false;
  const locationError = attempted && !pin ? 'Add the location before publishing.' : null;
  const categoryError = attempted && !category ? 'Choose the bin type before publishing.' : null;
  const missing = !pin ? 'Add the location' : !category ? 'Choose the bin type' : null;

  /** Place the pin and keep the auto-suggested place name in sync. */
  function applyPin(next: PickedPoint, source: PinSource) {
    setPin(next);
    setPinSource(source);
    if (!nameTouched) setLocationName(placeNameFor(next) ?? '');
    setNotice(null);
  }

  async function placeAtMyLocation() {
    setLocating(true);
    setNotice(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNotice({
          tone: 'warning',
          text: 'Location permission is off. Allow it in settings, or pick the spot on the map.',
        });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      applyPin(next, 'location');
      if (!isInsideCampus(next.latitude, next.longitude, campusPolygons)) {
        setNotice({
          tone: 'info',
          text: 'You are outside the campus outline — that is fine, the pin saves exactly where you are.',
        });
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not get your location. Pick the spot on the map instead.' });
    } finally {
      setLocating(false);
    }
  }

  async function pickPhoto(source: PhotoSource) {
    setNotice(null);
    setPhotoBusy(true);
    try {
      if (Platform.OS !== 'web') {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setNotice({
            tone: 'warning',
            text:
              source === 'camera'
                ? 'Camera access is off. Allow it in settings, or choose a photo instead.'
                : 'Photo access is off. Allow it in settings to add a photo.',
          });
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
        exif: false,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];

      const prepared = await preparePhoto(asset.uri);
      setPhoto({ uri: prepared.uri, base64: prepared.base64 });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not process that photo. Try another one.',
      });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    setAttempted(true);

    if (!pin) {
      setNotice({ tone: 'error', text: 'Add the bin’s location first — pick it on the map or use your location.' });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!category) {
      setNotice({ tone: 'error', text: 'Choose the bin type before publishing.' });
      return;
    }
    if (!session?.user) {
      setNotice({ tone: 'info', text: 'Sign in to add this bin. Your draft stays here.' });
      router.push('/sign-in');
      return;
    }

    const body: ReportInput = {
      lat: pin.latitude,
      lng: pin.longitude,
      category,
      name: locationName.trim() ? locationName.trim() : undefined,
      note: note.trim() ? note.trim() : undefined,
      photoBase64: photo?.base64,
    };

    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ binId?: string; warning?: string | null }>('/api/reports', {
        method: 'POST',
        json: body,
      });
      await queryClient.invalidateQueries({ queryKey: ['bins'] });
      await queryClient.invalidateQueries({ queryKey: ['my-reports'] });
      // The new sighting changes points and possibly the member's rank.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      setNewBinId(result?.binId ?? null);
      setPhotoWarning(result?.warning ?? null);
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

  function resetDraft() {
    setSubmitted(null);
    setNewBinId(null);
    setPhotoWarning(null);
    setPin(null);
    setPinSource(null);
    setLocationName('');
    setNameTouched(false);
    setNote('');
    setPhoto(null);
    setCategory('');
    setAttempted(false);
    setNotice(null);
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
              ? 'Thank you — your bin is queued and will upload automatically when you are back online.'
              : `Thank you — ${savedName ? `${savedName} is` : 'your bin is'} now on the campus map. Other members can confirm it as a second sighting.`}
          </Text>
          {photoWarning ? (
            <View style={styles.successWarning}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
              <Text style={styles.successWarningText}>{photoWarning}</Text>
            </View>
          ) : null}
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
            title="Add another"
            variant="secondary"
            onPress={resetDraft}
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
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityRole="button"
              accessibilityLabel="Close add bin form"
              style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Add a bin</Text>
              <Text style={styles.headerSub}>Takes about 30 seconds</Text>
            </View>
            {!session?.user ? (
              <Button
                title="Sign in"
                size="sm"
                variant="secondary"
                onPress={() => router.push('/sign-in')}
              />
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              {/* 1 — Location + place name */}
              <View style={styles.sectionHead}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Where is the bin?</Text>
                  <Text style={styles.sectionSub}>
                    Pick the exact spot on the map, or use where you are standing.
                  </Text>
                </View>
              </View>

              <View style={styles.locationOptions}>
                <LocationOption
                  icon="map-outline"
                  title="Pick on map"
                  subtitle="Tap the exact spot"
                  done={pinSource === 'map'}
                  onPress={() => setPickerOpen(true)}
                />
                <LocationOption
                  icon="locate-outline"
                  title="Use my location"
                  subtitle="Jump to where you are"
                  done={pinSource === 'location'}
                  loading={locating}
                  onPress={() => void placeAtMyLocation()}
                />
              </View>

              {pin ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewMap} pointerEvents="none">
                    <MapView
                      markers={markers}
                      center={pin}
                      zoom={17.5}
                      polygons={campusPolygons}
                      showUserLocation={false}
                      style={styles.map}
                    />
                  </View>
                  <Pressable
                    onPress={() => setPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Change the pinned location"
                    style={({ pressed }) => [styles.changeChip, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="expand-outline" size={13} color={COLORS.text} />
                    <Text style={styles.changeChipText}>Change</Text>
                  </Pressable>

                  <View style={styles.previewBody}>
                    <View
                      style={[
                        styles.previewIcon,
                        { backgroundColor: inside ? COLORS.successSoft : COLORS.infoSoft },
                      ]}
                    >
                      <Ionicons
                        name={inside ? 'checkmark-circle' : 'location'}
                        size={17}
                        color={inside ? COLORS.success : COLORS.info}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewTitle}>
                        {inside ? 'Pin placed inside campus' : 'Pin placed outside campus'}
                      </Text>
                      <Text style={styles.previewSub} numberOfLines={1}>
                        {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.locationEmpty}>
                  <Ionicons name="location-outline" size={18} color={COLORS.textMuted} />
                  <Text style={styles.locationEmptyText}>
                    No location yet — pick it on the map or use your location.
                  </Text>
                </View>
              )}

              {locationError ? <Text style={styles.error}>{locationError}</Text> : null}

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
                hint={
                  locationName && !nameTouched
                    ? 'Suggested from the nearest campus place — edit it if you know the exact spot.'
                    : pin
                      ? 'Add a landmark so other people can find it.'
                      : 'We suggest the nearest campus place once you pick a point.'
                }
              />

              {/* 2 — Bin type */}
              <View style={styles.sectionHead}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>What kind of bin?</Text>
                  <Text style={styles.sectionSub}>Open the list and pick the closest match.</Text>
                </View>
              </View>

              <Select
                options={categories.map((c) => ({
                  value: c.slug,
                  label: c.name,
                  emoji: c.emoji,
                  color: c.color,
                }))}
                value={category || null}
                onChange={setCategory}
                placeholder={
                  configError
                    ? 'Bin types unavailable'
                    : categories.length
                      ? 'Choose the bin type'
                      : 'Loading bin types…'
                }
                loading={!config && !configError}
                error={categoryError}
                hint="This sets the pin colour and the map filter."
                sheetTitle="Bin type"
                label="Bin type"
              />

              {configError ? (
                <Notice
                  tone="error"
                  message="Could not load the bin types. Check your connection and try again."
                  actionLabel="Retry"
                  onAction={() => void refetchConfig()}
                />
              ) : null}

              {/* 3 — Photo + note */}
              <View style={styles.sectionHead}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepText}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Add details</Text>
                  <Text style={styles.sectionSub}>Optional, but a photo helps a lot.</Text>
                </View>
              </View>

              {photo ? (
                <View style={styles.photoRow}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={styles.photoTitle}>Photo added</Text>
                    <Text style={styles.photoSub}>
                      People will see it on the map. Compressed automatically before upload.
                    </Text>
                    <View style={styles.photoActions}>
                      <Button
                        title="Replace"
                        variant="secondary"
                        size="sm"
                        icon="images-outline"
                        onPress={() => setPhotoSheetOpen(true)}
                        disabled={photoBusy}
                      />
                      <Button
                        title="Remove"
                        variant="ghost"
                        size="sm"
                        onPress={() => setPhoto(null)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setPhotoSheetOpen(true)}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo of the bin"
                  style={({ pressed }) => [styles.addPhoto, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.addPhotoIcon}>
                    {photoBusy ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addPhotoTitle}>
                      {photoBusy ? 'Preparing photo…' : 'Add a photo'}
                    </Text>
                    <Text style={styles.addPhotoSub}>
                      Show people exactly what the bin looks like — take one now or choose from
                      your photos.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </Pressable>
              )}

              <Field
                label="Note"
                value={note}
                onChangeText={setNote}
                placeholder="e.g. outside the library stairs, slightly full"
                multiline
                maxLength={500}
                icon="create-outline"
              />

              {notice ? (
                <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
              ) : null}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Button
              title={session?.user ? 'Add bin' : 'Sign in to add'}
              icon="paper-plane-outline"
              onPress={() => void submit()}
              loading={busy}
              size="lg"
            />
            <Text style={styles.footerHint}>
              {missing ? `${missing} to add the bin.` : 'Ready to add the bin.'}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LocationPicker
        visible={pickerOpen}
        initial={pin}
        polygons={campusPolygons}
        onClose={() => setPickerOpen(false)}
        onConfirm={(point) => {
          applyPin(point, 'map');
          setPickerOpen(false);
        }}
      />

      <Sheet
        visible={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        title="Add a photo"
        subtitle="A photo helps everyone recognise the bin at a glance."
      >
        <PhotoSourceOption
          icon="camera-outline"
          title="Take a photo"
          subtitle="Use your camera now"
          onPress={() => {
            setPhotoSheetOpen(false);
            void pickPhoto('camera');
          }}
        />
        <PhotoSourceOption
          icon="images-outline"
          title="Choose from photos"
          subtitle="Pick one you already have"
          onPress={() => {
            setPhotoSheetOpen(false);
            void pickPhoto('photos');
          }}
        />
      </Sheet>
    </View>
  );
}

function LocationOption({
  icon,
  title,
  subtitle,
  onPress,
  done,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  done?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(loading) }}
      style={({ pressed }) => [
        styles.locationOption,
        done && styles.locationOptionDone,
        pressed && { opacity: 0.82 },
      ]}
    >
      <View style={[styles.locationOptionIcon, done && styles.locationOptionIconDone]}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Ionicons name={done ? 'checkmark' : icon} size={20} color={done ? '#FFFFFF' : COLORS.primary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.locationOptionTitle}>{title}</Text>
        <Text style={styles.locationOptionSub}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function PhotoSourceOption({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.photoSource, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.photoSourceIcon}>
        <Ionicons name={icon} size={20} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.photoSourceTitle}>{title}</Text>
        <Text style={styles.photoSourceSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={COLORS.textMuted} />
    </Pressable>
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
  sectionSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 1, lineHeight: 17 },

  locationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  locationOption: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  locationOptionDone: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  locationOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  locationOptionIconDone: { backgroundColor: COLORS.primary },
  locationOptionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  locationOptionSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  previewCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  previewMap: { height: 148, width: '100%', backgroundColor: COLORS.surfaceAlt },
  map: { flex: 1, width: '100%' },
  changeChip: {
    position: 'absolute',
    top: 9,
    right: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  changeChipText: { fontSize: 11.5, fontWeight: '700', color: COLORS.text },
  previewBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  previewIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  previewSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  locationEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locationEmptyText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, lineHeight: 17 },
  error: { fontSize: 12.5, color: COLORS.danger, marginLeft: 2, marginTop: -6 },

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
  photoSub: { fontSize: 12, lineHeight: 16, color: COLORS.textMuted },
  photoActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  addPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
  },
  addPhotoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  addPhotoTitle: { fontSize: 14.5, fontWeight: '800', color: COLORS.text },
  addPhotoSub: { fontSize: 12, lineHeight: 16.5, color: COLORS.textMuted, marginTop: 2 },

  photoSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  photoSourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  photoSourceTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  photoSourceSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

  footer: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 12,
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
  successWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: COLORS.warningSoft,
    borderRadius: RADIUS.sm,
    padding: 11,
  },
  successWarningText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: COLORS.text },
});
