import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { api } from '@/lib/api-client';
import type { BinCategory } from '@/lib/db/schema';
import { CAMPUS_CENTER, CAMPUS_POLYGON, CATEGORY_COLORS, COLORS } from '@/lib/constants';
import type { BinDto } from '@/lib/report-service';
import { BIN_CATEGORY_EMOJI } from '@/lib/validation';

export default function MapScreen() {
  const router = useRouter();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [basemap, setBasemap] = useState<'streets' | 'satellite'>('streets');
  const [categoryFilter, setCategoryFilter] = useState<'all' | BinCategory>('all');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: 5 });
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['bins'],
    queryFn: () => api<BinDto[]>('/api/bins'),
    refetchOnWindowFocus: true,
  });

  const markers: MapMarker[] = (data ?? [])
    .filter((bin) => categoryFilter === 'all' || bin.category === categoryFilter)
    .map((bin) => ({
      id: bin.id,
      latitude: bin.lat,
      longitude: bin.lng,
      title: `${bin.category} bin · ${bin.status}`,
      color: CATEGORY_COLORS[bin.category],
    }));

  function openMarker(id: string) {
    router.push(`/bins/${id}`);
  }

  const filterOptions: { key: 'all' | BinCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    ...(Object.keys(BIN_CATEGORY_EMOJI) as BinCategory[]).map((key) => ({
      key,
      label: `${BIN_CATEGORY_EMOJI[key]} ${key}`,
    })),
  ];

  return (
    <View style={styles.container}>
      <MapView
        markers={markers}
        center={location ?? CAMPUS_CENTER}
        polygon={CAMPUS_POLYGON}
        basemap={basemap}
        onPressMarker={openMarker}
        style={styles.map}
      />

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.titleCard}>
            <Text style={styles.title}>EMU Bin Tracker</Text>
            <Text style={styles.subtitle}>
              {isLoading ? 'Loading bins…' : `${markers.length} bins${categoryFilter === 'all' ? '' : ` · ${categoryFilter}`}`}
            </Text>
          </View>
          <View style={styles.layerToggle}>
            <Pressable
              onPress={() => setBasemap('streets')}
              style={[styles.layerChip, basemap === 'streets' && styles.layerChipActive]}
            >
              <Text style={[styles.layerText, basemap === 'streets' && styles.layerTextActive]}>
                Map
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBasemap('satellite')}
              style={[styles.layerChip, basemap === 'satellite' && styles.layerChipActive]}
            >
              <Text
                style={[styles.layerText, basemap === 'satellite' && styles.layerTextActive]}
              >
                Satellite
              </Text>
            </Pressable>
          </View>
        </View>
        <FlatList
          data={filterOptions}
          keyExtractor={(o) => o.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
          pointerEvents="box-none"
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setCategoryFilter(item.key)}
              pointerEvents="auto"
              style={[
                styles.filterChip,
                categoryFilter === item.key && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  categoryFilter === item.key && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </SafeAreaView>

      <View style={styles.bottomBar} pointerEvents="box-none">
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>Could not load bins. Is the server running?</Text>
            <Pressable onPress={() => refetch()} style={styles.retryButton}>
              <Text style={styles.retryText}>{isFetching ? '…' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.bottomRow} pointerEvents="box-none">
          <Link href="/profile" asChild>
            <Pressable style={styles.ghostButton}>
              <Text style={styles.ghostText}>Profile</Text>
            </Pressable>
          </Link>
          <Link href="/report/new" asChild>
            <Pressable style={styles.fab}>
              <Text style={styles.fabText}>+ Report bin</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { flex: 1 },
  loading: { position: 'absolute', top: 120, alignSelf: 'center', zIndex: 30 },
  // Overlays sit above the map: explicit z-index/elevation so the map can
  // never paint over the controls (Leaflet panes use z-index up to 800 on web).
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 20 },
  topRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  layerToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  layerChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  layerChipActive: { backgroundColor: COLORS.primary },
  layerText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  layerTextActive: { color: '#fff' },
  filterRow: { marginTop: 4 },
  filterContent: { gap: 6, paddingHorizontal: 16, paddingVertical: 4 },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  filterChipTextActive: { color: '#fff' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, elevation: 20 },
  errorCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FEF2F2',
    borderColor: COLORS.danger,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { color: COLORS.danger, flexShrink: 1, fontSize: 13 },
  retryButton: { marginLeft: 10 },
  retryText: { color: COLORS.danger, fontWeight: '700' },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  ghostButton: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ghostText: { color: COLORS.text, fontWeight: '600' },
  fab: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 14,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
