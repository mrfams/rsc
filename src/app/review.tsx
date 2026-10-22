import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinDetails } from '@/components/bins/BinDetails';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { RADIUS, SHADOW, timeAgo } from '@/lib/theme';
import { categoryEmoji } from '@/lib/validation';

type BinDto = {
  id: string;
  category: string;
  name: string | null;
  area: string | null;
  status: string;
  reportCount: number;
  updatedAt: string;
};

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

type Filter = 'all' | 'pending' | 'disputed';

/**
 * The community review queue.
 *
 * A bin needs help when it was just mapped by one person (pending) or when a
 * member reported it missing (disputed). Tapping a card opens the same bin
 * card as the map, where "I see it too" or "This bin is gone" does the work.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { data: session, isPending } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: bins, isLoading, refetch } = useQuery({
    queryKey: ['bins'],
    queryFn: () => api<BinDto[]>('/api/bins'),
    enabled: Boolean(session?.user),
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/api/config'),
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <PageHeader title="Review" />
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return <Redirect href="/sign-in" />;
  }

  const activeSlugs = new Set(
    (config?.categories ?? []).filter((category) => category.active).map((c) => c.slug),
  );
  const categories = config?.categories ?? [];
  const categoryOf = (slug: string) =>
    categories.find((category) => category.slug === slug) ?? {
      name: slug.replace(/_/g, ' '),
      color: CATEGORY_COLORS[slug] ?? COLORS.primary,
      emoji: categoryEmoji(slug),
    };

  const queue = (bins ?? [])
    .filter((bin) => bin.status === 'pending' || bin.status === 'disputed')
    .filter((bin) => activeSlugs.size === 0 || activeSlugs.has(bin.category))
    .sort((a, b) => {
      // Missing bins first: they are the most urgent thing to check.
      if (a.status !== b.status) return a.status === 'disputed' ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const pending = queue.filter((bin) => bin.status === 'pending').length;
  const disputed = queue.filter((bin) => bin.status === 'disputed').length;
  const list = filter === 'all' ? queue : queue.filter((bin) => bin.status === filter);

  async function refresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader
        title="Review"
        subtitle="Confirm the bins you can see, and flag the ones that are gone."
        right={
          <Button
            title="Refresh"
            variant="secondary"
            size="sm"
            icon="refresh-outline"
            onPress={() => void refresh()}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.layout}>
          <View style={styles.summaryGrid}>
            <Card style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: COLORS.warningSoft }]}>
                <Ionicons name="time-outline" size={18} color={COLORS.warning} />
              </View>
              <Text style={styles.summaryValue}>{pending}</Text>
              <Text style={styles.summaryLabel}>Need a second sighting</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: COLORS.dangerSoft }]}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
              </View>
              <Text style={styles.summaryValue}>{disputed}</Text>
              <Text style={styles.summaryLabel}>Reported missing</Text>
            </Card>
          </View>

          <View style={styles.intro}>
            <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.primary} />
            <Text style={styles.introText}>
              Two independent sightings verify a bin. A quick confirmation here keeps the campus
              map trustworthy for everyone.
            </Text>
          </View>

          <Segmented
            items={[
              { key: 'all' as const, label: 'All', badge: queue.length },
              { key: 'pending' as const, label: 'New bins', badge: pending },
              { key: 'disputed' as const, label: 'Missing', badge: disputed },
            ]}
            value={filter}
            onChange={setFilter}
            scrollable
          />

          {isLoading ? (
            <Text style={styles.muted}>Loading the review queue…</Text>
          ) : list.length === 0 ? (
            <EmptyState
              icon="checkmark-done-circle-outline"
              title={queue.length === 0 ? 'Everything is reviewed' : 'Nothing in this view'}
              message={
                queue.length === 0
                  ? 'There are no bins waiting for a second sighting right now. Add a bin or enjoy the map.'
                  : 'Switch filters to see the rest of the queue.'
              }
              actionLabel="Back to the map"
              onAction={() => router.navigate('/')}
            />
          ) : (
            <View style={styles.list}>
              {list.map((bin) => {
                const category = categoryOf(bin.category);
                return (
                  <Pressable
                    key={bin.id}
                    onPress={() => setSelected(bin.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Review ${bin.name ?? `${category.name} bin`}`}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                  >
                    <View style={[styles.emoji, { backgroundColor: `${category.color}16` }]}>
                      <Text style={{ fontSize: 22 }}>{category.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {bin.name?.trim() || `${category.name} bin`}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {category.name} · {bin.reportCount} sighting
                        {bin.reportCount === 1 ? '' : 's'} · {timeAgo(bin.updatedAt)}
                      </Text>
                    </View>
                    <StatusPill status={bin.status} compact />
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelected(null)}
            accessibilityRole="button"
            accessibilityLabel="Close bin review"
          />
          <View style={[styles.modalPanel, { height: Math.min(height * 0.9, 820) }]}>
            {selected ? (
              <BinDetails binId={selected} onClose={() => setSelected(null)} variant="page" />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  layout: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },

  summaryGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  summaryCard: { flex: 1, minWidth: 160, gap: 2 },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  summaryValue: { fontSize: 25, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  summaryLabel: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16 },

  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
  },
  introText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.text },

  muted: { fontSize: 12.5, color: COLORS.textMuted },
  list: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    ...SHADOW.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  emoji: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  rowMeta: { fontSize: 12, color: COLORS.textMuted },

  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 14, 12, 0.45)',
  },
  modalPanel: {
    width: '100%',
    maxWidth: 760,
    height: '90%',
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
    ...SHADOW.lg,
  },
});
