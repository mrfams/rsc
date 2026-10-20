import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuButton } from '@/components/AppChrome';
import { BinDetails } from '@/components/bins/BinDetails';
import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { api } from '@/lib/api-client';
import {
  BOTTOM_NAV_HEIGHT,
  CAMPUS_CENTER,
  CATEGORY_COLORS,
  COLORS,
  DEFAULT_MAP_ZOOM,
} from '@/lib/constants';
import { haversine } from '@/lib/geo';
import { drainQueue, queueCount } from '@/lib/offline';
import type { BinDto } from '@/lib/report-service';
import { RADIUS, SHADOW } from '@/lib/theme';
import { useHydrated } from '@/lib/use-hydrated';

type AppConfig = {
  campusPolygons?: { latitude: number; longitude: number }[][];
  campusPolygon?: { latitude: number; longitude: number }[];
  categories: { slug: string; name: string; emoji: string; color: string; active: boolean }[];
};

type Basemap = 'streets' | 'satellite';

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bin?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const hydrated = useHydrated();
  const desktop = hydrated && Platform.OS === 'web' && width >= 1024;
  const narrow = width < 620;

  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const [basemap, setBasemap] = useState<Basemap>('streets');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [pending, setPending] = useState(0);
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const [sheetAnim] = useState(() => new Animated.Value(40));
  const [panelAnim] = useState(() => new Animated.Value(380));
  const lastMarkerPress = useRef(0);

  // `?bin=` deep links win over local selection, but closing strips the
  // parameter so the card does not immediately reopen.
  const paramBin = typeof params.bin === 'string' && params.bin.length > 0 ? params.bin : null;
  const activeBinId = paramBin ?? selectedBinId;

  function openBin(id: string) {
    lastMarkerPress.current = Date.now();
    if (paramBin) router.setParams({ bin: '' });
    setSelectedBinId(id);
  }

  function closeBin() {
    if (paramBin) router.setParams({ bin: '' });
    setSelectedBinId(null);
    setSheetExpanded(false);
  }

  function handleMapPress() {
    // Native marker presses can bubble to the map; ignore that same gesture.
    if (Date.now() - lastMarkerPress.current < 350) return;
    closeBin();
  }

  const { data: bins, isLoading, error, refetch } = useQuery({
    queryKey: ['bins'],
    queryFn: () => api<BinDto[]>('/api/bins'),
    refetchOnWindowFocus: true,
    retry: (count, err) => ((err as { status?: number }).status === 403 ? false : count < 4),
    retryDelay: (attempt) => Math.min(20_000, 1500 * 2 ** attempt),
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfig>('/api/config'),
    refetchOnWindowFocus: true,
  });
  const categories = config?.categories ?? [];
  const campusPolygons =
    config?.campusPolygons?.filter((ring) => ring.length >= 3) ??
    (config?.campusPolygon && config.campusPolygon.length >= 3
      ? [config.campusPolygon]
      : undefined);

  /* Warm up the location permission once; the map still opens on campus. */
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        // Location is optional; campus remains the default view.
      }
    })();
  }, []);

  /* Deliver any reports queued while offline. */
  useEffect(() => {
    async function flush() {
      const sent = await drainQueue();
      if (sent > 0) {
        void refetch();
        setMessage({ tone: 'info', text: `${sent} offline report${sent === 1 ? '' : 's'} uploaded.` });
      }
      setPending(await queueCount());
    }

    let cleanup = () => {};
    if (Platform.OS === 'web') {
      const handler = () => void flush();
      window.addEventListener('online', handler);
      cleanup = () => window.removeEventListener('online', handler);
    } else {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void flush();
      });
      cleanup = () => sub.remove();
    }
    void queueCount().then(setPending);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Escape closes the card on web, like every other panel in a real app. */
  useEffect(() => {
    if (Platform.OS !== 'web' || !activeBinId || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBin();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBinId]);

  /* Animate the desktop panel / mobile sheet when a bin is selected. */
  useEffect(() => {
    if (!activeBinId) return;
    if (desktop) {
      panelAnim.setValue(380);
      Animated.timing(panelAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      sheetAnim.setValue(46);
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBinId, desktop]);

  const categoryColor = (slug: string) =>
    categories.find((c) => c.slug === slug)?.color ?? CATEGORY_COLORS[slug] ?? COLORS.primary;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const bin of bins ?? []) map.set(bin.category, (map.get(bin.category) ?? 0) + 1);
    return map;
  }, [bins]);

  const visibleBins = useMemo(
    () => (bins ?? []).filter((bin) => categoryFilter === 'all' || bin.category === categoryFilter),
    [bins, categoryFilter],
  );

  const markers: MapMarker[] = visibleBins.map((bin) => ({
    id: bin.id,
    latitude: bin.lat,
    longitude: bin.lng,
    color: categoryColor(bin.category),
    selected: bin.id === activeBinId,
    kind: 'bin',
    title: bin.name ?? `${bin.category.replace(/_/g, ' ')} bin`,
  }));

  async function locateMe() {
    setLocating(true);
    setMessage(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMessage({
          tone: 'error',
          text: 'Location permission is off. Enable it in your browser or device settings.',
        });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      if (haversine(next, CAMPUS_CENTER) <= 12_000) {
        setMapCenter(next);
      } else {
        setMapCenter(CAMPUS_CENTER);
        setMessage({ tone: 'info', text: 'You are off campus — showing the EMU campus map.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not get your location right now.' });
    } finally {
      setLocating(false);
    }
  }

  const bottomNavSpace = Math.max(insets.bottom, 10) + BOTTOM_NAV_HEIGHT + 8;
  const activeCategory = categories.find((c) => c.slug === categoryFilter);

  return (
    <View style={styles.container}>
      <MapView
        markers={markers}
        center={mapCenter}
        zoom={DEFAULT_MAP_ZOOM}
        polygons={campusPolygons}
        maskOutside
        basemap={basemap}
        onPressMarker={openBin}
        onPressMap={handleMapPress}
        style={styles.map}
      />

      {/* Floating header + filters */}
      <View
        style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <View style={styles.topRow} pointerEvents="box-none">
          {!desktop ? <MenuButton /> : null}
          <View style={styles.campusPill}>
            <View style={styles.liveDot} />
            <Text style={styles.campusText}>EMU campus</Text>
            <View style={styles.pillDivider} />
            <Text style={styles.campusCount}>
              {isLoading ? '…' : `${visibleBins.length} bin${visibleBins.length === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {narrow ? (
            <Pressable
              onPress={() => setBasemap((value) => (value === 'streets' ? 'satellite' : 'streets'))}
              accessibilityRole="button"
              accessibilityLabel={
                basemap === 'streets' ? 'Switch to satellite imagery' : 'Switch to the street map'
              }
              style={({ pressed }) => [styles.layerFab, pressed && { opacity: 0.8 }]}
            >
              <Ionicons
                name={basemap === 'streets' ? 'earth-outline' : 'map-outline'}
                size={20}
                color={COLORS.text}
              />
            </Pressable>
          ) : (
            <View style={styles.layerToggle}>
              <LayerChip
                label="Map"
                icon="map-outline"
                active={basemap === 'streets'}
                onPress={() => setBasemap('streets')}
              />
              <LayerChip
                label="Satellite"
                icon="earth-outline"
                active={basemap === 'satellite'}
                onPress={() => setBasemap('satellite')}
              />
            </View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          <FilterChip
            label="All"
            emoji="♻️"
            count={bins?.length ?? 0}
            active={categoryFilter === 'all'}
            onPress={() => setCategoryFilter('all')}
          />
          {categories.map((c) => (
            <FilterChip
              key={c.slug}
              label={c.name}
              emoji={c.emoji}
              count={counts.get(c.slug) ?? 0}
              active={categoryFilter === c.slug}
              onPress={() => setCategoryFilter(c.slug)}
            />
          ))}
        </ScrollView>

        {message ? (
          <View style={styles.noticeWrap}>
            <Notice tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.noticeWrap}>
            <Pressable onPress={() => void refetch()} style={styles.reconnect}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.reconnectText}>Reconnecting… tap to retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Map controls */}
      <View
        style={[
          styles.controls,
          {
            right: desktop && activeBinId ? 422 : 16,
            bottom: desktop ? 24 : bottomNavSpace + 4,
          },
        ]}
        pointerEvents="box-none"
      >
        {pending > 0 ? (
          <Pressable
            style={styles.queuePill}
            onPress={async () => {
              const sent = await drainQueue();
              if (sent > 0) void refetch();
              setPending(await queueCount());
            }}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={COLORS.warning} />
            <Text style={styles.queueText}>
              {pending} queued — send now
            </Text>
          </Pressable>
        ) : null}
        <IconButton
          icon="locate"
          accessibilityLabel="Centre the map on my location"
          onPress={() => void locateMe()}
          size={48}
          iconSize={21}
          color={locating ? COLORS.primary : COLORS.text}
        />
      </View>

      {/* Empty filter state */}
      {!isLoading && visibleBins.length === 0 && !error ? (
        <View style={[styles.emptyPill, { bottom: bottomNavSpace + 16 }]} pointerEvents="box-none">
          <Text style={styles.emptyText}>
            {activeCategory ? `No ${activeCategory.name.toLowerCase()} bins here yet` : 'No bins yet'}
          </Text>
          <Pressable onPress={() => router.push('/report/new')}>
            <Text style={styles.emptyLink}>Add the first one</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : null}

      {/* Bin details: right panel on desktop, anchored bottom sheet on mobile */}
      {activeBinId && desktop ? (
        <Animated.View
          style={[
            styles.panel,
            {
              top: Math.max(insets.top, 12) + 78,
              transform: [{ translateX: panelAnim }],
            },
          ]}
        >
          <BinDetails binId={activeBinId} onClose={closeBin} variant="panel" />
        </Animated.View>
      ) : null}

      {activeBinId && !desktop ? (
        <Animated.View
          style={[
            styles.sheet,
            {
              bottom: bottomNavSpace,
              height: sheetExpanded ? Math.min(height * 0.88, 780) : Math.min(height * 0.66, 560),
              transform: [{ translateY: sheetAnim }],
            },
          ]}
        >
          <Pressable
            onPress={() => setSheetExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={sheetExpanded ? 'Collapse bin details' : 'Expand bin details'}
            style={styles.sheetHandleArea}
          >
            <View style={styles.sheetHandle} />
          </Pressable>
          <BinDetails binId={activeBinId} onClose={closeBin} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function LayerChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.layerChip,
        active && styles.layerChipActive,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Ionicons name={icon} size={14} color={active ? '#FFFFFF' : COLORS.text} />
      <Text style={[styles.layerLabel, active && styles.layerLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({
  label,
  emoji,
  count,
  active,
  onPress,
}: {
  label: string;
  emoji: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={styles.filterEmoji}>{emoji}</Text>
      <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{label}</Text>
      <View style={[styles.filterCount, active && styles.filterCountActive]}>
        <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { flex: 1 },

  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
  },
  campusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 13,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.md,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  campusText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  pillDivider: { width: 1, height: 14, backgroundColor: COLORS.border },
  campusCount: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  layerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.md,
  },
  layerFab: {
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
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  layerChipActive: { backgroundColor: COLORS.primary },
  layerLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  layerLabelActive: { color: '#FFFFFF', fontWeight: '700' },
  filterRow: { flexGrow: 0 },
  filterContent: { gap: 7, paddingHorizontal: 14, paddingVertical: 2 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterEmoji: { fontSize: 13 },
  filterLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.text },
  filterLabelActive: { color: '#FFFFFF', fontWeight: '700' },
  filterCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  filterCountText: { fontSize: 10.5, fontWeight: '700', color: COLORS.textMuted },
  filterCountTextActive: { color: '#FFFFFF' },
  noticeWrap: { paddingHorizontal: 14 },
  reconnect: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(16,20,19,0.86)',
  },
  reconnectText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  controls: {
    position: 'absolute',
    alignItems: 'flex-end',
    gap: 8,
    zIndex: 20,
    elevation: 20,
  },
  queuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...SHADOW.sm,
  },
  queueText: { fontSize: 12, fontWeight: '700', color: COLORS.warning },

  emptyPill: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.md,
  },
  emptyText: { fontSize: 12.5, color: COLORS.textMuted, fontWeight: '600' },
  emptyLink: { fontSize: 12.5, color: COLORS.primary, fontWeight: '800' },
  loading: { position: 'absolute', top: 150, alignSelf: 'center', zIndex: 25 },

  panel: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 396,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    zIndex: 30,
    ...SHADOW.lg,
  },
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    zIndex: 30,
    ...SHADOW.lg,
  },
  sheetHandleArea: { paddingTop: 9, paddingBottom: 4, alignItems: 'center' },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
});
