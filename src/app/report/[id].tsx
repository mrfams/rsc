import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { displayNote } from '@/lib/notes';
import { RADIUS, timeAgo } from '@/lib/theme';
import { categoryEmoji } from '@/lib/validation';

type ReportDetail = {
  id: string;
  binId: string;
  lat: number;
  lng: number;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin: {
    id: string;
    category: string;
    name: string | null;
    status: string;
    reportCount: number;
  };
};

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api<ReportDetail>(`/api/reports/${id}`),
    enabled: Boolean(id),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/api/config'),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Ionicons name="help-circle-outline" size={36} color={COLORS.textMuted} />
        <Text style={styles.errorText}>This report is not available</Text>
        <Button
          title="Back to the map"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </SafeAreaView>
    );
  }

  const category =
    config?.categories.find((c) => c.slug === data.bin.category) ?? {
      name: data.bin.category.replace(/_/g, ' '),
      color: CATEGORY_COLORS[data.bin.category] ?? COLORS.primary,
      emoji: categoryEmoji(data.bin.category),
    };
  const color = category.color ?? COLORS.primary;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader
        title={data.bin.name?.trim() || `${category.name} bin`}
        subtitle={`Sighting ${timeAgo(data.createdAt)} · ${data.bin.reportCount} total`}
        showBack
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {data.photoUrl ? (
          <Image source={{ uri: data.photoUrl }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty, { backgroundColor: `${color}12` }]}>
            <Text style={{ fontSize: 44 }}>{category.emoji}</Text>
            <Text style={styles.photoHint}>No photo attached to this sighting</Text>
          </View>
        )}

        <View style={styles.pillRow}>
          <StatusPill status={data.bin.status} />
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>
              {category.emoji} {category.name}
            </Text>
          </View>
        </View>

        <Card style={{ gap: 8 }}>
          <Text style={styles.cardLabel}>Note</Text>
          <Text style={styles.note}>{displayNote(data.note) ?? 'No note added.'}</Text>
        </Card>

        <Card padded={false}>
          <View style={styles.mapWrap}>
            <MapView
              markers={[
                {
                  id: data.id,
                  latitude: data.lat,
                  longitude: data.lng,
                  kind: 'pin',
                  color,
                  selected: true,
                },
              ]}
              center={{ latitude: data.lat, longitude: data.lng }}
              zoom={17}
              showUserLocation={false}
              style={styles.map}
            />
          </View>
          <View style={styles.mapFooter}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Location</Text>
              <Text style={styles.mapHint}>Open the map to see nearby bins and directions.</Text>
            </View>
            <Pressable
              onPress={() =>
                router.navigate({ pathname: '/', params: { bin: data.binId } })
              }
              style={({ pressed }) => [styles.mapButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="map-outline" size={16} color={COLORS.primary} />
              <Text style={styles.mapButtonText}>Open in map</Text>
            </Pressable>
          </View>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  scroll: { padding: 20, gap: 13, paddingBottom: 120, width: '100%', maxWidth: 820, alignSelf: 'center' },
  errorText: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  photo: { width: '100%', aspectRatio: 16 / 10, borderRadius: RADIUS.lg, backgroundColor: COLORS.surfaceAlt },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoHint: { fontSize: 12, color: COLORS.textMuted },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  categoryPill: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryPillText: { fontSize: 11.5, fontWeight: '700', color: COLORS.text },
  cardLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  note: { fontSize: 15, lineHeight: 22, color: COLORS.text },
  mapWrap: { height: 220, backgroundColor: COLORS.surfaceAlt },
  map: { flex: 1 },
  mapFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  mapHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  mapButtonText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});
