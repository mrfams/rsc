import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { MenuButton } from '@/components/AppChrome';
import { api } from '@/lib/api-client';
import { CAMPUS_CENTER, COLORS } from '@/lib/constants';
import { drainQueue, queueCount } from '@/lib/offline';
import type { BinDto } from '@/lib/report-service';

type AppConfigDto = {
  campusPolygon: { latitude: number; longitude: number }[];
  categories: { slug: string; name: string; emoji: string; color: string; active: boolean }[];
};

export default function MapScreen() {
  const router = useRouter();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [basemap, setBasemap] = useState<'streets' | 'satellite'>('streets');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [pending, setPending] = useState<number>(0);

  // Drain the offline submission queue whenever connectivity comes back.
  // (Defined after the refetch-bearing useQuery below; see drain effect.)
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: 5 });
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bins'],
    queryFn: () => api<BinDto[]>('/api/bins'),
    refetchOnWindowFocus: true,
    // Quiet self-healing: automatic retries with backoff. The UI shows a small
    // "Reconnecting…" pill instead of a scary error banner.
    retry: (count, err) => ((err as { status?: number }).status === 403 ? false : count < 5),
    retryDelay: (attempt) => Math.min(30_000, 2000 * 2 ** attempt),
  });

  // Geofence + category chips come from the (admin-editable) server config.
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfigDto>('/api/config'),
    refetchOnWindowFocus: true,
  });
  const categories = config?.categories ?? [];
  const categoryColor = (slug: string) =>
    categories.find((c) => c.slug === slug)?.color ?? COLORS.primary;

  useEffect(() => {
    async function flushFromNetworkEvent() {
      const sent = await drainQueue();
      if (sent > 0) refetch();
      setPending(await queueCount());
    }
    // Wake-ups on the web come as 'online'; on native, app foregrounding.
    let cleanup: () => void = () => {};
    if (Platform.OS === 'web') {
      window.addEventListener('online', flushFromNetworkEvent);
      cleanup = () => window.removeEventListener('online', flushFromNetworkEvent);
    } else {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void flushFromNetworkEvent();
      });
      cleanup = () => sub.remove();
    }
    void queueCount().then(setPending);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers: MapMarker[] = (data ?? [])
    .filter((bin) => categoryFilter === 'all' || bin.category === categoryFilter)
    .map((bin) => ({
      id: bin.id,
      latitude: bin.lat,
      longitude: bin.lng,
      title: `${bin.category} bin · ${bin.status}`,
      color: categoryColor(bin.category),
    }))

  function openMarker(id: string) {
    router.push(`/bins/${id}`);
  }

  const [bottomSheetBottom, setBottomSheetBottom] = useState<string | number>(0);

  const showBinBottomSheet = (binId: string) => {
    openMarker(binId);
    setBottomSheetBottom(binId);
  };

  const closeBinBottomSheet = () => {
    setBottomSheetBottom(0);
  };

  const filterOptions: { key: 'all' | string; label: string }[] = [
    { key: 'all', label: 'All' },
    ...categories.map((c) => ({ key: c.slug, label: `${c.emoji} ${c.name}` })),
  ];

  return (
    <View style={styles.container}>
      <MapView
        markers={markers}
        center={location ?? CAMPUS_CENTER}
        polygon={config && config.campusPolygon.length > 0 ? config.campusPolygon : undefined}
        maskOutside
        basemap={basemap}
        onPressMarker={showBinBottomSheet}
        style={styles.map}
      />

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <MenuButton />
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
        {pending > 0 ? (
          <Pressable style={styles.queueCard} onPress={async () => {
            const sent = await drainQueue();
            if (sent > 0) refetch();
            setPending(await queueCount());
          }}>
            <Text style={styles.queueText}>
              📬 {pending} report{pending === 1 ? '' : 's'} queued offline — tap to send now
            </Text>
          </Pressable>
        ) : null}

        {error ? (
          <Pressable style={styles.reconnectingPill} onPress={() => refetch()}>
            <ActivityIndicator size="small" color="#FFFFFF" style={styles.pillSpinner} />
            <Text style={styles.reconnectingText}>Reconnecting… tap to retry</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : null}

      {/* Bin bottom sheet */}
      {bottomSheetBottom && (
        <View style={styles.binBottomSheet}>
          <View style={styles.binBottomSheetHandle} />
          <View style={styles.binBottomSheetContent}>
            <Text style={styles.binBottomSheetTitle}>Bin details</Text>
            <Pressable onPress={closeBinBottomSheet} style={styles.binBottomSheetClose}>
              <Text style={styles.binBottomSheetCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    // Cleared above the phone/tablet bottom nav bar.
    paddingBottom: 96,
  },
  queueCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: COLORS.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    elevation: 3,
  },
  queueText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  reconnectingPill: {
    marginHorizontal: 16,
    marginBottom: 8,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(22,25,28,0.85)',
  },
  pillSpinner: { marginRight: 2 },
  reconnectingText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  binBottomSheet: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: 400,
    marginBottom: 20,
    width: '95%',
    alignSelf: 'center',
  },
  binBottomSheetHandle: {
    width: 40,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginBottom: 16,
    alignSelf: 'center',
  },
  binBottomSheetContent: { flexDirection: 'column', gap: 8 },
  binBottomSheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  binBottomSheetClose: { padding: 8, borderRadius: 10, backgroundColor: COLORS.bg, marginTop: 12 },
  binBottomSheetCloseText: { color: COLORS.textMuted, fontWeight: '600' },
});
