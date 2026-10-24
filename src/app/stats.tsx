import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeaderboardCard } from '@/components/LeaderboardCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { SocialLinks } from '@/components/ui/SocialLinks';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { POINT_RULES, type ContributionStats } from '@/lib/points';
import { registerPushToken } from '@/lib/register-push';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW, timeAgo } from '@/lib/theme';
import { useHydrated } from '@/lib/use-hydrated';
import { useMe } from '@/lib/use-me';
import { categoryEmoji } from '@/lib/validation';

export function generateMetadata() {
  return siteMetadata({
    title: 'Campus recycling stats',
    path: '/stats',
    description:
      'See how many recycling bins the EMU community has mapped, which bin types are most common, and who is leading the campus leaderboard.',
  });
}

type BinDto = {
  id: string;
  category: string;
  name: string | null;
  status: string;
  reportCount: number;
  updatedAt: string;
};

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

const LAST_RANK_KEY = 'rsc.last-leaderboard-rank';
/** How many bins the public list shows before it stops. */
const BIN_LIST_LIMIT = 25;

/**
 * The community stats page.
 *
 * This is a public page: guests see the leaderboard, the bins on campus and
 * how points work without signing in. Everything that belongs to one member
 * (their sightings, their account) lives on the Profile tab.
 */
export default function StatsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  const desktop = hydrated && width >= 1024;
  const { data: session } = useSession();
  const { data: me } = useMe();
  const [refreshing, setRefreshing] = useState(false);
  const [rankNotice, setRankNotice] = useState<string | null>(null);
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (session?.user) void registerPushToken();
  }, [session?.user]);

  const { data: bins, isLoading: binsLoading, refetch: refetchBins } = useQuery({
    queryKey: ['bins'],
    queryFn: () => api<BinDto[]>('/api/bins'),
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/api/config'),
    staleTime: 60_000,
  });

  const categories = config?.categories ?? [];
  const categoryOf = (slug: string) =>
    categories.find((c) => c.slug === slug) ?? {
      name: slug.replace(/_/g, ' '),
      color: CATEGORY_COLORS[slug] ?? COLORS.primary,
      emoji: categoryEmoji(slug),
    };

  const rank = me?.stats?.rank ?? null;
  const totalContributors = me?.stats?.totalContributors ?? 0;

  /*
   * The server pushes a notification when a contribution lifts the member's
   * rank. This local snapshot gives them the same signal the next time they
   * open Stats, on devices where push is unavailable.
   */
  useEffect(() => {
    if (!rank) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_RANK_KEY);
        const previous = stored ? Number(stored) : Number.NaN;
        if (!cancelled && Number.isFinite(previous) && previous > rank) {
          const moved = previous - rank;
          setRankNotice(
            `You moved up ${moved} place${moved === 1 ? '' : 's'} — now #${rank} of ${totalContributors} contributors. Keep going!`,
          );
        }
        if (!cancelled) await AsyncStorage.setItem(LAST_RANK_KEY, String(rank));
      } catch {
        // Losing the local snapshot only costs the celebratory notice.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rank, totalContributors]);

  async function refresh() {
    setRefreshing(true);
    await refetchBins();
    setRefreshing(false);
  }

  const list = (bins ?? []).slice(0, BIN_LIST_LIMIT);
  const totalBins = bins?.length ?? 0;

  const pointsGuide = (
    <View style={styles.pointsGuide}>
      <Text style={styles.pointsGuideTitle}>How points work</Text>
      <PointRule icon="add-circle-outline" label="Add a new bin" points={POINT_RULES.newBin} />
      <PointRule
        icon="eye-outline"
        label="Confirm a sighting"
        points={POINT_RULES.confirmation}
      />
      <PointRule icon="camera-outline" label="Attach a photo" points={POINT_RULES.photo} />
      <Text style={styles.pointsGuideFoot}>
        Every contribution moves you up the campus leaderboard. Names appear there only when the
        member allows it.
      </Text>
    </View>
  );

  const binsList = (
    <View style={styles.binsCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.sectionTitle}>Bins on campus</Text>
        <Text style={styles.cardMeta}>
          {totalBins} mapped
          {totalContributors > 0
            ? ` · ${totalContributors} contributor${totalContributors === 1 ? '' : 's'}`
            : ''}
        </Text>
      </View>

      {binsLoading ? (
        <Text style={styles.muted}>Loading the campus bins…</Text>
      ) : list.length === 0 ? (
        <EmptyState
          icon="trash-outline"
          title="No bins yet"
          message="Nobody has reported a bin yet. Be the first — it takes about 30 seconds."
          actionLabel={signedIn ? 'Add the first bin' : 'Sign in to add one'}
          onAction={() => router.push(signedIn ? '/report/new' : '/sign-in')}
        />
      ) : (
        list.map((bin) => {
          const cat = categoryOf(bin.category);
          return (
            <Pressable
              key={bin.id}
              onPress={() => router.push({ pathname: '/', params: { bin: bin.id } })}
              style={({ pressed }) => [styles.binRow, pressed && { opacity: 0.75 }]}
            >
              <View style={[styles.binEmoji, {  }]}>
                <Text style={{ fontSize: 19 }}>{cat.emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.binTitle} numberOfLines={1}>
                  {bin.name?.trim() || `${cat.name} bin`}
                </Text>
                <Text style={styles.binMeta}>
                  {cat.name} · {bin.reportCount} sighting{bin.reportCount === 1 ? '' : 's'} ·{' '}
                  {timeAgo(bin.updatedAt)}
                </Text>
              </View>
              <StatusPill status={bin.status} compact />
              <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
            </Pressable>
          );
        })
      )}
    </View>
  );

  const guestCard = (
    <View style={styles.guestCard}>
      <View style={styles.guestMark}>
        <Ionicons name="people-outline" size={26} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guestTitle}>Join the effort</Text>
        <Text style={styles.guestText}>
          Sign in to add bins, confirm what you see and earn points on the campus leaderboard.
        </Text>
      </View>
      <View style={styles.guestActions}>
        <Button
          title="Sign in"
          icon="log-in-outline"
          size="sm"
          onPress={() => router.push('/sign-in')}
        />
        <Button
          title="Create account"
          variant="secondary"
          size="sm"
          icon="person-add-outline"
          onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader
        title="Stats"
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
        <View style={[styles.layout, desktop && styles.layoutDesktop]}>
          <View style={[styles.leftColumn, desktop && styles.leftColumnDesktop]}>
            {rankNotice ? (
              <Notice
                tone="success"
                message={rankNotice}
                onDismiss={() => setRankNotice(null)}
              />
            ) : null}
            <LeaderboardCard />
            {signedIn && me?.stats ? <StandingCard stats={me.stats} /> : null}
            {pointsGuide}
          </View>
          <View style={[styles.rightColumn, desktop && styles.rightColumnDesktop]}>
            {binsList}
            {!signedIn ? guestCard : null}
            <View style={styles.socialFooter}>
              <SocialLinks label="Follow or contact us" />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The signed-in member's private standing: points, rank among every
 * contributor and exactly what the next contribution is worth.
 */
function StandingCard({ stats }: { stats: ContributionStats }) {
  const hasPoints = stats.points > 0;
  const rankLine = stats.rank
    ? `#${stats.rank} of ${stats.totalContributors} contributor${stats.totalContributors === 1 ? '' : 's'}`
    : 'Not ranked yet';
  const nextLine =
    stats.rank === 1
      ? 'You are #1 on campus — keep it up.'
      : stats.pointsToNextRank
        ? `${stats.pointsToNextRank} point${stats.pointsToNextRank === 1 ? '' : 's'} to move up one place.`
        : 'Add a bin to join the standings.';

  return (
    <View style={styles.standingCard}>
      <View style={styles.standingHeader}>
        <View style={styles.standingTitleRow}>
          <Ionicons name="sparkles-outline" size={15} color={COLORS.primary} />
          <Text style={styles.standingTitle}>Your standing</Text>
        </View>
        <View style={styles.rankPill}>
          <Ionicons name="podium-outline" size={13} color={COLORS.primary} />
          <Text style={styles.rankPillText}>{rankLine}</Text>
        </View>
      </View>

      <View style={styles.standingNumbers}>
        <View>
          <Text style={styles.standingPoints}>{stats.points.toLocaleString()}</Text>
          <Text style={styles.standingPointsLabel}>points</Text>
        </View>
        <View style={styles.standingDivider} />
        <View style={{ flex: 1 }}>
          <Text style={styles.standingNext}>{nextLine}</Text>
          <Text style={styles.standingMeta}>
            {stats.binsContributed} bin{stats.binsContributed === 1 ? '' : 's'} ·{' '}
            {stats.reportsCount} sighting{stats.reportsCount === 1 ? '' : 's'}
            {hasPoints ? '' : ' so far'}
          </Text>
        </View>
      </View>

      <View style={styles.standingBreakdown}>
        <MiniStat
          label="New bins"
          value={stats.breakdown.newBins}
          points={stats.breakdown.newBins * POINT_RULES.newBin}
        />
        <MiniStat
          label="Confirmations"
          value={stats.breakdown.confirmations}
          points={stats.breakdown.confirmations * POINT_RULES.confirmation}
        />
        <MiniStat
          label="Photos"
          value={stats.breakdown.photos}
          points={stats.breakdown.photos * POINT_RULES.photo}
        />
      </View>

      {!stats.leaderboardOptIn ? (
        <Text style={styles.standingPrivate}>
          Your points and rank are private. Opt in to the leaderboard to appear publicly.
        </Text>
      ) : null}
    </View>
  );
}

function MiniStat({ label, value, points }: { label: string; value: number; points: number }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatPoints}>+{points} pts</Text>
    </View>
  );
}

function PointRule({
  icon,
  label,
  points,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  points: number;
}) {
  return (
    <View style={styles.pointRule}>
      <View style={styles.pointRuleIcon}>
        <Ionicons name={icon} size={15} color={COLORS.primary} />
      </View>
      <Text style={styles.pointRuleLabel}>{label}</Text>
      <Text style={styles.pointRuleValue}>+{points} pts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  layout: { width: '100%', alignSelf: 'center', gap: 12 },
  layoutDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  leftColumn: { width: '100%', gap: 14 },
  leftColumnDesktop: { width: 370 },
  rightColumn: { width: '100%', gap: 8, flex: 1 },
  rightColumnDesktop: { minWidth: 0 },

  sectionTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardMeta: { fontSize: 11.5, color: COLORS.textMuted },
  muted: { fontSize: 12.5, color: COLORS.textMuted },

  standingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
    ...SHADOW.sm,
  },
  standingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  standingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  standingTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
  },
  rankPillText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  standingNumbers: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  standingPoints: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  standingPointsLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  standingDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border },
  standingNext: { fontSize: 12.5, fontWeight: '700', color: COLORS.text, lineHeight: 17 },
  standingMeta: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 },
  standingBreakdown: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  miniStat: {
    flex: 1,
    minWidth: 84,
    padding: 9,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  miniStatValue: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  miniStatLabel: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 1 },
  miniStatPoints: { fontSize: 10.5, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  standingPrivate: { fontSize: 11, lineHeight: 16, color: COLORS.textMuted },

  pointsGuide: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 8,
    ...SHADOW.sm,
  },
  pointsGuideTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  pointRule: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pointRuleIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  pointRuleLabel: { flex: 1, fontSize: 12.5, color: COLORS.text, fontWeight: '600' },
  pointRuleValue: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  pointsGuideFoot: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted, marginTop: 2 },

  binsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 4,
    ...SHADOW.sm,
  },
  binRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  binEmoji: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  binTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  binMeta: { fontSize: 12, color: COLORS.textMuted },

  guestCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...SHADOW.sm,
  },
  guestMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  guestText: { fontSize: 12.5, lineHeight: 17, color: COLORS.textMuted, marginTop: 2 },
  guestActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  socialFooter: { marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
});
