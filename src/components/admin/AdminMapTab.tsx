import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Segmented } from '@/components/ui/Segmented';
import { api } from '@/lib/api-client';
import {
  CAMPUS_CENTER,
  CATEGORY_COLORS,
  COLORS,
  type CampusPoint,
} from '@/lib/constants';
import { isInsideCampus, nearestCampusPlace } from '@/lib/geo';
import { preparePhoto } from '@/lib/photo-client';
import { RADIUS, SHADOW, timeAgo } from '@/lib/theme';
import { BIN_STATUS_LABEL, type BinStatus } from '@/lib/validation';

type BinDto = {
  id: string;
  category: string;
  name: string | null;
  lat: number;
  lng: number;
  area: string | null;
  status: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

type CategoryDto = {
  slug: string;
  name: string;
  color: string;
  emoji: string;
  active: boolean;
};

type Config = { campusPolygons?: CampusPoint[][]; campusPolygon?: CampusPoint[] };

type Mode = 'idle' | 'add' | 'move';

type PickedPhoto = { uri: string; base64: string };

export function AdminMapTab({ onOpenBin }: { onOpenBin: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { toast, showDialog, confirm } = useFeedback();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [notice, setNotice] = useState<{
    tone: 'error' | 'success' | 'info' | 'warning';
    text: string;
  } | null>(null);
  const lastMarkerPress = useRef(0);
  const [mode, setMode] = useState<Mode>('idle');
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampusPoint | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<BinStatus>('verified');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [locating, setLocating] = useState(false);

  const { data: bins, isLoading } = useQuery({
    queryKey: ['admin-bins'],
    queryFn: () => api<BinDto[]>('/api/admin/bins'),
  });
  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<CategoryDto[]>('/api/admin/categories'),
  });
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/api/config'),
  });

  const selectedBin = bins?.find((bin) => bin.id === selectedBinId) ?? null;
  const activeCategories = (categories ?? []).filter((c) => c.active);
  const defaultCategory = activeCategories[0]?.slug ?? categories?.[0]?.slug ?? 'general';
  const activeCategory = category || selectedBin?.category || defaultCategory;

  const polygons =
    config?.campusPolygons?.filter((ring) => ring.length >= 3) ??
    (config?.campusPolygon ? [config.campusPolygon] : undefined);

  const position = draft ?? (selectedBin ? { latitude: selectedBin.lat, longitude: selectedBin.lng } : null);
  const mapCenter = position ?? CAMPUS_CENTER;
  const outsideBoundary =
    Boolean(position && polygons?.length) &&
    !isInsideCampus(position!.latitude, position!.longitude, polygons!);

  const categoryColor = (slug: string) =>
    categories?.find((c) => c.slug === slug)?.color ?? CATEGORY_COLORS[slug] ?? COLORS.primary;

  const activeSlugs = new Set(activeCategories.map((category) => category.slug));
  const markers: MapMarker[] = (bins ?? [])
    .filter((bin) => bin.status !== 'removed')
    .filter((bin) => !categories || activeSlugs.has(bin.category))
    .map((bin) => ({
      id: bin.id,
      latitude: bin.lat,
      longitude: bin.lng,
      color: categoryColor(bin.category),
      kind: 'bin',
      selected: bin.id === selectedBinId,
      title: bin.name ?? `${bin.category.replace(/_/g, ' ')} bin`,
    }));

  if (draft) {
    markers.push({
      id: 'admin-draft',
      latitude: draft.latitude,
      longitude: draft.longitude,
      color: categoryColor(activeCategory),
      kind: 'pin',
      selected: true,
      title: 'New bin',
    });
  }

  function startAdd() {
    setMode('add');
    setSelectedBinId(null);
    setDraft(null);
    setName('');
    setNameTouched(false);
    setCategory(defaultCategory);
    setStatus('verified');
    setPhoto(null);
    setNotice(null);
  }

  function selectBin(id: string) {
    lastMarkerPress.current = Date.now();
    const bin = bins?.find((row) => row.id === id);
    setMode('idle');
    setSelectedBinId(id);
    setDraft(null);
    setName(bin?.name ?? '');
    setNameTouched(Boolean(bin?.name));
    setCategory(bin?.category ?? defaultCategory);
    setStatus((bin?.status as BinStatus) ?? 'verified');
    setNotice(null);
  }

  function handleMapPress(lat: number, lng: number) {
    // Native marker presses can bubble into the map press handler.
    if (Date.now() - lastMarkerPress.current < 350) return;
    if (mode === 'add') {
      const next = { latitude: lat, longitude: lng };
      setDraft(next);
      if (!nameTouched) {
        setName(nearestCampusPlace(next, 220)?.place.name ?? '');
      }
      setNotice(null);
      return;
    }
    if (mode === 'move' && selectedBin) {
      const next = { latitude: lat, longitude: lng };
      setDraft(next);
      setMode('idle');
      setNotice({ tone: 'info', text: 'New position picked. Press Save changes to apply it.' });
      return;
    }
    setSelectedBinId(null);
    setDraft(null);
  }

  async function locateAtMyPosition() {
    setLocating(true);
    setNotice(null);
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        setNotice({ tone: 'error', text: 'Location permission is off. Tap the map instead.' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setDraft(next);
      if (!nameTouched) setName(nearestCampusPlace(next, 220)?.place.name ?? '');
      setNotice({ tone: 'info', text: 'Pin placed at your current location. Tap the map to adjust it.' });
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
      const prepared = await preparePhoto(result.assets[0].uri);
      setPhoto({ uri: prepared.uri, base64: prepared.base64 });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not process that photo. Try another one.',
      });
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const effectiveName =
        name.trim() ||
        (position ? nearestCampusPlace(position, 220)?.place.name : '') ||
        'Campus bin';
      if (mode === 'add' || (!selectedBinId && draft)) {
        if (!draft) throw new Error('Tap the map to place the new bin.');
        return api('/api/admin/bins', {
          method: 'POST',
          json: {
            name: effectiveName,
            category: activeCategory,
            lat: draft.latitude,
            lng: draft.longitude,
            status,
            photoBase64: photo?.base64,
          },
        });
      }
      if (!selectedBinId) throw new Error('Select a bin first.');
      return api(`/api/admin/bins/${selectedBinId}`, {
        method: 'PATCH',
        json: {
          name: effectiveName,
          category: activeCategory,
          status,
          ...(draft
            ? { lat: draft.latitude, lng: draft.longitude }
            : selectedBin
              ? { lat: selectedBin.lat, lng: selectedBin.lng }
              : {}),
        },
      });
    },
    onSuccess: () => {
      setNotice(null);
      const created = mode === 'add';
      setMode('idle');
      setSelectedBinId(null);
      setDraft(null);
      setName('');
      setNameTouched(false);
      setPhoto(null);
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
      queryClient.invalidateQueries({ queryKey: ['bin'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
      showDialog({
        tone: 'success',
        title: created ? 'Bin added to the map' : 'Bin updated',
        message: created
          ? 'The new bin is live for everyone, with its place name and type.'
          : 'Your changes are live on the public map right now.',
        confirmLabel: 'Nice',
      });
    },
    onError: (err) => {
      setNotice({ tone: 'error', text: err.message });
      toast({ tone: 'error', title: 'Could not save the bin', message: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/bins/${id}`, { method: 'PATCH', json: { status: 'removed' } }),
    onSuccess: () => {
      setSelectedBinId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
      toast({
        tone: 'success',
        title: 'Bin removed',
        message: 'It is hidden from the public map but its history is kept.',
      });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const editing = mode === 'add' || Boolean(selectedBinId);
  const canSave =
    editing &&
    Boolean(activeCategory) &&
    (mode === 'add' ? Boolean(draft) : Boolean(selectedBinId));

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Map studio</Text>
          <Text style={styles.subtitle}>
            Pin bins directly on the campus map and give every one a real place name.
          </Text>
        </View>
        <Button
          title={mode === 'add' ? 'Cancel' : 'Add bin'}
          icon={mode === 'add' ? 'close' : 'add'}
          size="sm"
          variant={mode === 'add' ? 'secondary' : 'primary'}
          onPress={() => (mode === 'add' ? setMode('idle') : startAdd())}
        />
      </View>

      {notice ? (
        <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
      ) : null}

      <View style={[styles.mapCard, { height: desktop ? 520 : 400 }]}>
        <MapView
          markers={markers}
          center={mapCenter}
          zoom={selectedBinId || draft ? 16.5 : 15}
          polygons={polygons}
          maskOutside
          onPressMap={handleMapPress}
          onPressMarker={selectBin}
          style={styles.map}
        />
        {mode === 'add' ? (
          <Pressable
            onPress={() => void locateAtMyPosition()}
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            style={({ pressed }) => [styles.locate, pressed && { opacity: 0.8 }]}
          >
            {locating ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="locate" size={16} color={COLORS.primary} />
            )}
            <Text style={styles.locateText}>Use my location</Text>
          </Pressable>
        ) : null}
        <View style={styles.mapHint}>
          <Ionicons
            name={mode === 'add' ? 'add-circle-outline' : mode === 'move' ? 'move-outline' : 'hand-left-outline'}
            size={15}
            color={COLORS.primary}
          />
          <Text style={styles.mapHintText}>
            {mode === 'add'
              ? draft
                ? 'Pin placed anywhere works. Fill in the name and type below.'
                : 'Tap the exact spot for the new bin — or use my location.'
              : mode === 'move'
                ? 'Tap the new spot for this bin.'
                : 'Tap a bin pin to edit it, or use Add bin.'}
          </Text>
        </View>
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : null}
      </View>

      {editing ? (
        <Card style={{ gap: 14 }}>
          <View style={styles.formHeader}>
            <View style={[styles.formIcon, { backgroundColor: `${categoryColor(activeCategory)}16` }]}>
              <Ionicons name="trash-outline" size={19} color={categoryColor(activeCategory)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formTitle}>
                {mode === 'add' ? (draft ? 'New bin' : 'Place the pin') : 'Edit bin'}
              </Text>
              <Text style={styles.formSub}>
                {mode === 'add'
                  ? draft
                    ? `${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}${outsideBoundary ? ' · outside the campus outline (allowed)' : ''}`
                    : 'Tap the map above or use my location'
                  : `${selectedBin?.reportCount ?? 0} sightings · updated ${timeAgo(selectedBin?.updatedAt)}`}
              </Text>
            </View>
            {selectedBin ? (
              <Button
                title="Sightings"
                icon="document-text-outline"
                size="sm"
                variant="ghost"
                onPress={() => onOpenBin(selectedBin.id)}
              />
            ) : null}
          </View>

          <Field
            label="Place name"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameTouched(true);
            }}
            placeholder="e.g. DAU 3 Dormitory"
            icon="location-outline"
            autoCapitalize="words"
            maxLength={80}
            hint="Use the building or landmark, not the bin type."
          />

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Bin type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {(categories ?? [])
                  .filter((c) => c.active || c.slug === activeCategory)
                  .map((c) => {
                    const active = activeCategory === c.slug;
                    return (
                      <Pressable
                        key={c.slug}
                        onPress={() => setCategory(c.slug)}
                        style={[
                          styles.chip,
                          active && { backgroundColor: `${c.color}18`, borderColor: c.color },
                          !c.active && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={styles.chipEmoji}>{c.emoji}</Text>
                        <Text
                          style={[styles.chipText, active && { color: c.color, fontWeight: '800' }]}
                        >
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
            </ScrollView>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Status</Text>
            <Segmented
              items={(['pending', 'verified', 'disputed'] as BinStatus[]).map((key) => ({
                key,
                label: BIN_STATUS_LABEL[key],
              }))}
              value={status}
              onChange={setStatus}
              scrollable
            />
          </View>

          {mode === 'add' ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Photo (optional)</Text>
              {photo ? (
                <View style={styles.photoRow}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={styles.photoTitle}>Photo attached</Text>
                    <Text style={styles.photoSub}>It becomes the bin&apos;s first sighting photo.</Text>
                    <Button
                      title="Remove photo"
                      variant="ghost"
                      size="sm"
                      onPress={() => setPhoto(null)}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.photoButtons}>
                  <Pressable
                    onPress={() => void pickPhoto('camera')}
                    style={({ pressed }) => [styles.photoButton, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="camera-outline" size={19} color={COLORS.primary} />
                    <Text style={styles.photoButtonText}>Camera</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void pickPhoto('library')}
                    style={({ pressed }) => [styles.photoButton, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="images-outline" size={19} color={COLORS.primary} />
                    <Text style={styles.photoButtonText}>Photos</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.formActions}>
            {selectedBin ? (
              <Button
                title="Move on map"
                icon="locate-outline"
                size="sm"
                variant="secondary"
                onPress={() => setMode(mode === 'move' ? 'idle' : 'move')}
                style={{ flex: 1 }}
              />
            ) : null}
            {selectedBin ? (
              <Button
                title="Remove"
                icon="trash-outline"
                size="sm"
                variant="danger"
                loading={remove.isPending}
                onPress={() =>
                  confirm({
                    tone: 'warning',
                    title: 'Remove this bin?',
                    message:
                      'It disappears from the public map for everyone. Its sighting history is kept for moderation.',
                    confirmLabel: 'Remove bin',
                    cancelLabel: 'Cancel',
                    destructive: true,
                    onConfirm: () => remove.mutate(selectedBin.id),
                  })
                }
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              title="Save changes"
              icon="checkmark"
              size="sm"
              loading={save.isPending}
              disabled={!canSave}
              onPress={() => save.mutate()}
              style={{ flex: 1.4 }}
            />
          </View>
        </Card>
      ) : (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="map-outline" size={24} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>Every bin deserves a name</Text>
            <Text style={styles.emptyText}>
              Tap a pin to rename it, change its type, move it, or remove it. Use “Add bin” to place
              a new one with the map instead of coordinates.
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          {markers.length} visible pin{markers.length === 1 ? '' : 's'} on campus
        </Text>
        <Button
          title="Open bin list"
          icon="list-outline"
          size="sm"
          variant="secondary"
          onPress={() => onOpenBin(selectedBinId ?? bins?.[0]?.id ?? '')}
          disabled={!selectedBinId && !bins?.length}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 120, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  subtitle: { fontSize: 12.5, lineHeight: 18, color: COLORS.textMuted, marginTop: 3, maxWidth: 620 },
  mapCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...SHADOW.sm,
  },
  map: { flex: 1 },
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
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 11,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoPreview: { width: 92, height: 92, borderRadius: 11, backgroundColor: COLORS.surface },
  photoTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  photoSub: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted },
  photoButtons: { flexDirection: 'row', gap: 9 },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(14,124,90,0.18)',
  },
  photoButtonText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  mapHint: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    ...SHADOW.sm,
  },
  mapHintText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: COLORS.primary },
  loading: { position: 'absolute', top: 14, right: 14 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  formTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  formSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 2 },
  chipRow: { flexDirection: 'row', gap: 7, paddingBottom: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  emptyText: { fontSize: 12, lineHeight: 17, color: COLORS.textMuted, marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footerText: { fontSize: 11.5, color: COLORS.textMuted },
});
