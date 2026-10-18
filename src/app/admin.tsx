import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { api } from '@/lib/api-client';
import { CAMPUS_CENTER, COLORS } from '@/lib/constants';
import type { BinDto } from '@/lib/report-service';
import { BIN_STATUS_LABEL, binStatusEnum, categoryEmoji, type BinStatus } from '@/lib/validation';

type CategoryDto = {
  slug: string;
  name: string;
  color: string;
  emoji: string;
  active: boolean;
};

type AdminUserDto = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  createdAt: string;
};

const TABS = ['Bins', 'Types', 'People', 'Geofence'] as const;
type Tab = (typeof TABS)[number];

export default function AdminScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Bins');

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ isAdmin: boolean }>('/api/me'),
    retry: false,
  });

  if (me && !me.isAdmin) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.title}>Admins only</Text>
        <Text style={styles.muted}>Ask the sustainability office for moderation access.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!me) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Admin</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'Bins' ? <BinsTab onGoBin={(id) => router.push(`/bins/${id}`)} /> : null}
        {tab === 'Types' ? <TypesTab /> : null}
        {tab === 'People' ? <PeopleTab /> : null}
        {tab === 'Geofence' ? <GeofenceTab /> : null}
      </View>
    </SafeAreaView>
  );
}

/* ---------------------------------- Bins ---------------------------------- */

function BinsTab({ onGoBin }: { onGoBin: (id: string) => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-bins'],
    queryFn: () => api<BinDto[]>('/api/admin/bins'),
    retry: (count, err) => (err as { status?: number }).status === 403 ? false : count < 3,
  });

  const setStatus = useMutation({
    mutationFn: ({ binId, status }: { binId: string; status: BinStatus }) =>
      api(`/api/admin/bins/${binId}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
    },
  });

  return (
    <View style={styles.tabBody}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Bin moderation</Text>
        <Pressable onPress={() => refetch()}>
          <Text style={styles.link}>{isFetching ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.muted}>
          {(error as { status?: number }).status === 403 ? 'Admins only.' : 'Could not load bins.'}
        </Text>
      ) : null}

      <FlatList
        data={data ?? []}
        keyExtractor={(bin) => bin.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          isLoading ? <Text style={styles.muted}>Loading…</Text> : <Text style={styles.muted}>No bins yet.</Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => onGoBin(item.id)} style={styles.binRow}>
              <Text style={styles.binEmoji}>{categoryEmoji(item.category)}</Text>
              <View style={{ flexShrink: 1, flex: 1 }}>
                <Text style={styles.binTitle}>
                  {item.category} bin · {BIN_STATUS_LABEL[item.status as keyof typeof BIN_STATUS_LABEL]}
                </Text>
                <Text style={styles.binMeta}>
                  {item.reportCount} report{item.reportCount === 1 ? '' : 's'} ·{' '}
                  {new Date(item.updatedAt ?? item.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </Pressable>
            <View style={styles.statusRow}>
              {binStatusEnum.enumValues.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setStatus.mutate({ binId: item.id, status })}
                  style={[styles.chip, item.status === status && styles.chipActive]}
                >
                  <Text style={[styles.chipText, item.status === status && styles.chipTextActive]}>
                    {BIN_STATUS_LABEL[status]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* --------------------------------- Types ---------------------------------- */

function TypesTab() {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('♻️');
  const [color, setColor] = useState('#0E7490');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<CategoryDto[]>('/api/admin/categories'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    queryClient.invalidateQueries({ queryKey: ['config'] });
  };

  const create = useMutation({
    mutationFn: () => api('/api/admin/categories', { method: 'POST', json: { slug, name, emoji, color } }),
    onSuccess: () => {
      setSlug('');
      setName('');
      setEmoji('♻️');
      setColor('#0E7490');
      invalidate();
    },
    onError: (err) => Alert.alert('Create failed', err instanceof Error ? err.message : String(err)),
  });

  const patch = useMutation({
    mutationFn: (payload: { slug: string; patch: Record<string, unknown> }) =>
      api('/api/admin/categories', { method: 'PATCH', json: { ...payload.patch, slug: payload.slug } }),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Update failed', err instanceof Error ? err.message : String(err)),
  });

  return (
    <View style={styles.tabBody}>
      <Text style={styles.sectionTitle}>Waste categories</Text>

      <View style={styles.createRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tinyLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Food waste"
            autoCapitalize="words"
          />
        </View>
        <View style={{ width: 64 }}>
          <Text style={styles.tinyLabel}>Emoji</Text>
          <TextInput style={styles.input} value={emoji} onChangeText={setEmoji} maxLength={4} />
        </View>
        <View style={{ width: 96 }}>
          <Text style={styles.tinyLabel}>Hex</Text>
          <TextInput style={styles.input} value={color} onChangeText={setColor} maxLength={7} />
        </View>
      </View>
      <View style={styles.createRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tinyLabel}>Slug (letters/numbers/underscore)</Text>
          <TextInput style={styles.input} value={slug} onChangeText={setSlug} autoCapitalize="none" />
        </View>
        <Pressable
          onPress={() => create.mutate()}
          disabled={create.isPending || !name.trim() || !slug.trim()}
          style={[styles.addButton, (create.isPending || !name.trim() || !slug.trim()) && { opacity: 0.5 }]}
        >
          {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.addText}>Add type</Text>}
        </Pressable>
      </View>

      <View style={{ height: 14 }} />

      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.slug}
        contentContainerStyle={styles.list}
        ListEmptyComponent={isLoading ? <Text style={styles.muted}>Loading…</Text> : <Text style={styles.muted}>No categories.</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.binRow}>
              <Text style={styles.binEmoji}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.binTitle}>{item.name}</Text>
                <Text style={styles.binMeta}>
                  {item.slug} · {item.color}
                </Text>
              </View>
              <View style={[styles.colorDot, { backgroundColor: item.color }]} />
              <Pressable
                onPress={() => patch.mutate({ slug: item.slug, patch: { active: !item.active } })}
                style={[styles.chip, item.active ? styles.chipActive : styles.chipOff]}
              >
                <Text style={[styles.chipText, item.active && styles.chipTextActive]}>
                  {item.active ? 'Active' : 'Hidden'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* --------------------------------- People --------------------------------- */

function PeopleTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<AdminUserDto[]>('/api/admin/users'),
  });

  const setRole = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      api(`/api/admin/users/${id}`, { method: 'PATCH', json: { isAdmin } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err) => Alert.alert('Update failed', err instanceof Error ? err.message : String(err)),
  });

  return (
    <View style={styles.tabBody}>
      <Text style={styles.sectionTitle}>People</Text>
      <Text style={styles.muted}>Promote trusted members to admin.</Text>
      <View style={{ height: 10 }} />

      <FlatList
        data={data ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={isLoading ? <Text style={styles.muted}>Loading…</Text> : <Text style={styles.muted}>No users.</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => {
          const isAdmin = item.role === 'admin';
          return (
            <View style={styles.card}>
              <View style={styles.binRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.binTitle} numberOfLines={1}>
                    {item.name || 'Member'}
                  </Text>
                  <Text style={styles.binMeta} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setRole.mutate({ id: item.id, isAdmin: !isAdmin })}
                  style={[styles.chip, isAdmin ? styles.chipActive : styles.chipOff]}
                >
                  <Text style={[styles.chipText, isAdmin && styles.chipTextActive]}>
                    {isAdmin ? 'Admin' : 'Make admin'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

/* -------------------------------- Geofence -------------------------------- */

function GeofenceTab() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-campus'],
    queryFn: () =>
      api<{ campusPolygon: { latitude: number; longitude: number }[] }>('/api/admin/campus'),
  });

  const polygon = data?.campusPolygon ?? [];
  const [points, setPoints] = useState<string[] | null>(null);
  // Local editable copy, initialised from the server list.
  const editing = points ?? polygon.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
  async function save() {
    const cleaned = editing
      .map((s) => [Number(s.split(',')[0]), Number(s.split(',')[1])] as const)
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (cleaned.length < 3) {
      Alert.alert('Geofence', 'At least 3 points are needed.');
      return;
    }
    try {
      await api('/api/admin/campus', {
        method: 'PUT',
        json: {
          campusPolygon: cleaned.map(([lat, lng]) => ({
            latitude: lat,
            longitude: lng,
          })),
        },
      });
      setPoints(null);
      queryClient.invalidateQueries({ queryKey: ['admin-campus'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
      Alert.alert('Saved', 'Campus geofence updated.');
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : String(err));
    }
  }

  const previewMarkers: MapMarker[] = cleaningPreview(editing);

  return (
    <ScrollView style={styles.tabBody} contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Campus geofence</Text>
        <Pressable
          onPress={() => {
            setPoints(null);
            void refetch();
          }}
        >
          <Text style={styles.link}>{isFetching ? '…' : 'Reset'}</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>Points of the polygon reports must land inside. Last point closes back to the first.</Text>

      <View style={styles.mapCard}>
        <MapView markers={previewMarkers} center={poleCenter(previewMarkers)} polygon={previewCoords(editing)} style={styles.mapPreview} showUserLocation={false} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} />
      ) : (
        editing.map((p, i) => (
          <View key={`${i}-${p}`} style={styles.pointRow}>
            <Text style={styles.pointIndex}>{i + 1}</Text>
            <TextInput
              style={styles.input}
              value={p}
              onChangeText={(text) => {
                const next = [...editing];
                next[i] = text;
                setPoints(next);
              }}
              keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
            />
            <Pressable
              onPress={() => {
                const next = editing.filter((_, idx) => idx !== i);
                setPoints(next);
              }}
              hitSlop={6}
            >
              <Text style={styles.pointRemove}>✕</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Pressable onPress={() => setPoints([...editing, '35.3786,33.9422'])} style={styles.chip}>
          <Text style={styles.chipText}>+ Add point</Text>
        </Pressable>
        <Pressable
          onPress={save}
          style={[styles.chipActive, { paddingHorizontal: 16 }]}
        >
          <Text style={styles.chipTextActive}>Save geofence</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function previewCoords(editing: string[]) {
  return editing
    .map((s) => s.split(','))
    .filter(([lat, lng]) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)))
    .map(([lat, lng]) => ({ latitude: Number(lat), longitude: Number(lng) }));
}

function cleaningPreview(editing: string[]): MapMarker[] {
  return editing.map((s, i) => {
    const [lat, lng] = s.split(',');
    return { id: `pt${i}`, latitude: Number(lat) || 0, longitude: Number(lng) || 0, color: '#0E7490' };
  });
}

function poleCenter(markers: MapMarker[]) {
  if (markers.length === 0) return CAMPUS_CENTER;
  const lat = markers.reduce((s, m) => s + m.latitude, 0) / markers.length;
  const lng = markers.reduce((s, m) => s + m.longitude, 0) / markers.length;
  return { latitude: lat, longitude: lng };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { flex: 1, padding: 20, gap: 10, paddingBottom: 110 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  link: { color: COLORS.primary, fontWeight: '600' },
  muted: { color: COLORS.textMuted, fontSize: 13 },

  tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  tabTextActive: { color: '#fff' },
  tabBody: { flex: 1 },
  list: { gap: 10, paddingBottom: 24 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  binRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  binEmoji: { fontSize: 22 },
  binTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  binMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorDot: { width: 18, height: 18, borderRadius: 9 },

  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  chipActive: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipOff: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#fff' },

  createRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  tinyLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.text,
    minWidth: 60,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addText: { color: '#fff', fontWeight: '700' },

  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  mapPreview: { height: 220, width: '100%' },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointIndex: { width: 22, color: COLORS.textMuted, fontSize: 12 },
  pointRemove: { color: COLORS.danger, paddingHorizontal: 4 },

  backButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  backButtonText: { color: '#fff', fontWeight: '700' },
});
