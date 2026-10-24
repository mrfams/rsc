import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeedback } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { displayNote } from '@/lib/notes';
import type { ReviewItemDto } from '@/lib/report-service';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW, timeAgo } from '@/lib/theme';
import { categoryEmoji } from '@/lib/validation';

export function generateMetadata() {
  return siteMetadata({ title: 'Review queue', path: '/review', noIndex: true });
}

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

type Filter = 'all' | 'pending' | 'disputed';
type Choice = 'yes' | 'no' | 'unsure';

type CategoryMeta = { name: string; color: string; emoji: string };

/**
 * The community review queue.
 *
 * Each card is a self-contained review: the photo, the latest note and how
 * many people have seen the bin answer one question, and the member answers
 * with one of three choices. Nothing is sent until Confirm is pressed, so a
 * stray tap can never verify or remove a bin.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const { data: session, isPending } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Bins handled in this session stay out of the list until a refetch. */
  const [handled, setHandled] = useState<Set<string>>(new Set());

  const review = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => api<{ items: ReviewItemDto[] }>('/api/review'),
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

  const categories = config?.categories ?? [];
  const activeSlugs = new Set(
    categories.filter((category) => category.active).map((category) => category.slug),
  );
  const categoryOf = (slug: string): CategoryMeta =>
    categories.find((category) => category.slug === slug) ?? {
      name: slug.replace(/_/g, ' '),
      color: CATEGORY_COLORS[slug] ?? COLORS.primary,
      emoji: categoryEmoji(slug),
    };

  const queue = (review.data?.items ?? [])
    .filter((item) => !handled.has(item.id))
    .filter((item) => activeSlugs.size === 0 || activeSlugs.has(item.category))
    .filter((item) => filter === 'all' || item.status === filter)
    .sort((a, b) => {
      // Missing bins first: they are the most urgent thing to check.
      if (a.status !== b.status) return a.status === 'disputed' ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const all = review.data?.items ?? [];
  const pending = all.filter((item) => item.status === 'pending' && !handled.has(item.id)).length;
  const disputed = all.filter((item) => item.status === 'disputed' && !handled.has(item.id)).length;

  async function refresh() {
    setRefreshing(true);
    await review.refetch();
    setRefreshing(false);
  }

  async function decide(item: ReviewItemDto, choice: Choice) {
    if (busyId) return;
    setHandled((current) => new Set(current).add(item.id));
    if (choice === 'unsure') {
      toast({
        tone: 'info',
        title: 'Skipped for now',
        message: 'No report was sent. You can review it again later.',
      });
      return;
    }

    setBusyId(item.id);
    try {
      if (choice === 'yes') {
        await api('/api/reports', {
          method: 'POST',
          json: { lat: item.lat, lng: item.lng, category: item.category },
        });
        toast({
          tone: 'success',
          title: 'Sighting confirmed',
          message: 'Thanks — an independent sighting keeps the campus map trustworthy.',
        });
      } else {
        await api(`/api/bins/${item.id}/dispute`, { method: 'POST', json: {} });
        toast({
          tone: 'success',
          title: 'Reported missing',
          message: 'The bin is flagged for the campus. A new sighting puts it back.',
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['review-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['bins'] }),
        queryClient.invalidateQueries({ queryKey: ['bin', item.id] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
      ]);
    } catch (error) {
      const status = (error as { status?: number }).status;
      setHandled((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      toast({
        tone: 'error',
        title: status === 401 ? 'Please sign in again' : 'Could not save that review',
        message:
          status === 401
            ? 'Your session expired. Sign in and try once more.'
            : error instanceof Error
              ? error.message
              : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader
        title="Review"
        subtitle="Confirm the bins you can see, and flag the ones that are gone."
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
              Two independent sightings verify a bin. Look at the photo and note, choose what you
              see, then confirm.
            </Text>
          </View>

          <Segmented
            items={[
              { key: 'all' as const, label: 'All', badge: pending + disputed },
              { key: 'pending' as const, label: 'New bins', badge: pending },
              { key: 'disputed' as const, label: 'Missing', badge: disputed },
            ]}
            value={filter}
            onChange={setFilter}
            scrollable
          />

          {review.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.muted}>Loading the review queue…</Text>
            </View>
          ) : review.error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Could not load the queue"
              message={
                review.error instanceof Error
                  ? review.error.message
                  : 'Check your connection and try again.'
              }
              actionLabel="Try again"
              onAction={() => void review.refetch()}
            />
          ) : queue.length === 0 ? (
            <EmptyState
              icon="checkmark-done-circle-outline"
              title={handled.size > 0 ? 'Review saved' : 'Everything is reviewed'}
              message={
                handled.size > 0
                  ? 'Thanks for helping. There is nothing else waiting for you right now.'
                  : 'There are no bins waiting for your second sighting. Add a bin or enjoy the map.'
              }
              actionLabel="Back to the map"
              onAction={() => router.navigate('/')}
            />
          ) : (
            <View style={styles.list}>
              {queue.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  category={categoryOf(item.category)}
                  busy={busyId === item.id}
                  disabled={busyId !== null && busyId !== item.id}
                  onOpenMap={() =>
                    router.navigate({ pathname: '/', params: { bin: item.id } })
                  }
                  onDecide={(choice) => void decide(item, choice)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CHOICES: { key: Choice; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    {
      key: 'yes',
      label: 'Yes, I can see it',
      hint: 'The bin is here and usable',
      icon: 'eye-outline',
    },
    {
      key: 'no',
      label: 'No, it is gone',
      hint: 'Missing, moved or not a bin',
      icon: 'close-circle-outline',
    },
    {
      key: 'unsure',
      label: 'Not sure',
      hint: 'Cannot check it right now',
      icon: 'help-circle-outline',
    },
  ];

function ReviewCard({
  item,
  category,
  busy,
  disabled,
  onOpenMap,
  onDecide,
}: {
  item: ReviewItemDto;
  category: CategoryMeta;
  busy: boolean;
  disabled: boolean;
  onOpenMap: () => void;
  onDecide: (choice: Choice) => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const missing = item.reason === 'missing';
  const note = displayNote(item.note);
  const lastSeen = item.lastReportAt ?? item.updatedAt;

  return (
    <View style={styles.reviewCard}>
      <View style={styles.cardTop}>
        <View style={[styles.thumbWrap, { backgroundColor: `${category.color}12` }]}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.thumb} contentFit="cover" />
          ) : (
            <Text style={styles.thumbEmoji}>{category.emoji}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name?.trim() || `${category.name} bin`}
            </Text>
            <StatusPill status={item.status} compact />
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {category.emoji} {category.name} · {item.reportCount} sighting
            {item.reportCount === 1 ? '' : 's'}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            <Ionicons name="location-outline" size={11} color={COLORS.textMuted} />{' '}
            {item.area?.trim() || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`}
          </Text>
          <Text style={styles.cardTime}>
            {missing ? 'Flagged missing' : 'Added'} {timeAgo(item.updatedAt)} · last sighting{' '}
            {timeAgo(lastSeen)}
          </Text>
        </View>
        <Pressable
          onPress={onOpenMap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open this bin on the map"
          style={({ pressed }) => [styles.mapLink, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="map-outline" size={18} color={COLORS.primary} />
        </Pressable>
      </View>

      {note ? (
        <View style={styles.noteCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.noteText} numberOfLines={2}>
            “{note}”
          </Text>
        </View>
      ) : null}

      <View style={styles.questionBlock}>
        <Text style={styles.question}>
          {missing ? 'Is this bin still here?' : 'Is this bin really at this spot?'}
        </Text>
        <Text style={styles.questionHint}>
          {missing
            ? 'Check the spot before answering — a new sighting restores it.'
            : 'Look at the photo and the place, then pick one answer.'}
        </Text>

        <View style={styles.options}>
          {CHOICES.map((option) => {
            const selected = choice === option.key;
            const tone =
              option.key === 'yes'
                ? COLORS.success
                : option.key === 'no'
                  ? COLORS.danger
                  : COLORS.textMuted;
            return (
              <Pressable
                key={option.key}
                onPress={() => setChoice(option.key)}
                disabled={busy || disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={`${option.label}. ${option.hint}`}
                style={({ pressed }) => [
                  styles.option,
                  selected && { borderColor: tone, backgroundColor: `${tone}0F` },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={[styles.radio, selected && { borderColor: tone }]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: tone }]} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.optionLabel, selected && { color: tone }]}>
                    {option.label}
                  </Text>
                  <Text style={styles.optionHint}>{option.hint}</Text>
                </View>
                <Ionicons name={option.icon} size={16} color={selected ? tone : COLORS.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        title={busy ? 'Saving…' : 'Confirm'}
        icon="checkmark"
        loading={busy}
        disabled={!choice || busy || disabled}
        onPress={() => {
          if (choice) onDecide(choice);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  layout: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },

  summaryGrid: { flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 },
  summaryCard: { flex: 1, minWidth: 0, gap: 2, flexBasis: 0 },
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

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  muted: { fontSize: 12.5, color: COLORS.textMuted },
  list: { gap: 12 },

  reviewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 11,
    ...SHADOW.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  thumbWrap: {
    width: 74,
    height: 74,
    borderRadius: 13,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15.5, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  cardMeta: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16 },
  cardTime: { fontSize: 11, color: COLORS.textMuted },
  mapLink: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: COLORS.text, fontStyle: 'italic' },

  questionBlock: { gap: 4 },
  question: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  questionHint: { fontSize: 12, lineHeight: 16, color: COLORS.textMuted },
  options: { gap: 7, marginTop: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  optionLabel: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  optionHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
});
