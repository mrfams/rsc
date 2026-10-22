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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { displayNote } from '@/lib/notes';
import { registerPushToken } from '@/lib/register-push';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW, STATUS_META, timeAgo, type StatusKey } from '@/lib/theme';
import { categoryEmoji } from '@/lib/validation';

export function generateMetadata() {
  return siteMetadata({ title: 'Sighting alerts', path: '/alerts', noIndex: true });
}

type MyReport = {
  id: string;
  note: string | null;
  createdAt: string;
  bin: { id: string; category: string; name: string | null; status: string };
};

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

type Filter = 'all' | 'pending' | 'resolved';

export default function AlertsScreen() {
  const router = useRouter();
  const { data: session } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => api<{ reports: MyReport[] }>('/api/reports?mine=1'),
    enabled: Boolean(session?.user),
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/api/config'),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (session?.user) void registerPushToken();
  }, [session?.user]);

  const categories = config?.categories ?? [];
  const categoryOf = (slug: string) =>
    categories.find((c) => c.slug === slug) ?? {
      name: slug.replace(/_/g, ' '),
      color: CATEGORY_COLORS[slug] ?? COLORS.primary,
      emoji: categoryEmoji(slug),
    };

  const reports = data?.reports ?? [];
  const filtered = reports.filter((report) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return report.bin.status === 'pending';
    return report.bin.status !== 'pending';
  });
  const awaiting = reports.filter((r) => r.bin.status === 'pending').length;

  async function refresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.guestScroll}>
          <View style={styles.guestCard}>
            <View style={styles.guestMark}>
              <Ionicons name="notifications-outline" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.guestTitle}>Your bin activity</Text>
            <Text style={styles.guestText}>
              Sign in to follow what happens after you add a bin: community confirmations, missing
              reports and moderation updates.
            </Text>
            <Button
              title="Sign in"
              icon="log-in-outline"
              onPress={() => router.push('/sign-in')}
              style={{ width: '100%' }}
            />
            <Button
              title="Create account"
              variant="secondary"
              onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })}
              style={{ width: '100%' }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader
        title="Alerts"
        subtitle={
          awaiting > 0
            ? `${awaiting} report${awaiting === 1 ? '' : 's'} awaiting review`
            : 'Updates on the bins you added.'
        }
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

      <View style={styles.filterWrap}>
        <Segmented
          items={[
            { key: 'all' as const, label: 'All', badge: reports.length },
            { key: 'pending' as const, label: 'Awaiting', badge: awaiting },
            { key: 'resolved' as const, label: 'Resolved' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        showsVerticalScrollIndicator={false}
      >
        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            icon="sparkles-outline"
            title={filter === 'all' ? 'No activity yet' : 'Nothing here'}
            message={
              filter === 'all'
                ? 'Add your first bin with the Add button — its status updates will show up here.'
                : 'Switch the filter to see the rest of your reports.'
            }
            actionLabel={filter === 'all' ? 'Add a bin' : undefined}
            onAction={filter === 'all' ? () => router.push('/report/new') : undefined}
          />
        ) : null}

        {filtered.map((report) => {
          const cat = categoryOf(report.bin.category);
          const status = (report.bin.status in STATUS_META
            ? report.bin.status
            : 'pending') as StatusKey;
          const meta = STATUS_META[status];
          const note = displayNote(report.note);
          return (
            <Pressable
              key={report.id}
              onPress={() => router.navigate({ pathname: '/', params: { bin: report.bin.id } })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: `${cat.color}16` }]}>
                <Text style={styles.iconEmoji}>{cat.emoji}</Text>
                <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {report.bin.name?.trim() || `${cat.name} bin`}
                  </Text>
                  <StatusPill status={status} compact />
                </View>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {cat.emoji} {cat.name} · {statusCopy(status)}
                </Text>
                {note ? (
                  <Text style={styles.cardNote} numberOfLines={1}>
                    “{note}”
                  </Text>
                ) : null}
                <Text style={styles.cardDate}>{timeAgo(report.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={COLORS.textMuted} />
            </Pressable>
          );
        })}

        {reports.length > 0 ? (
          <Text style={styles.footerHint}>
            Alerts follow the bins you added. Tap any card to open it on the map.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusCopy(status: StatusKey): string {
  switch (status) {
    case 'verified':
      return 'Verified by the community';
    case 'disputed':
      return 'Reported missing — needs a new sighting';
    case 'removed':
      return 'Removed by moderation';
    default:
      return 'Awaiting a second sighting';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  filterWrap: { paddingHorizontal: 22, paddingBottom: 10 },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 10,
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    ...SHADOW.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 21 },
  statusDot: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text, flex: 1 },
  cardSub: { fontSize: 12.5, color: COLORS.textMuted },
  cardNote: { fontSize: 12.5, color: COLORS.text, opacity: 0.8 },
  cardDate: { fontSize: 11, color: COLORS.textMuted },
  footerHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 8 },

  guestScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  guestCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    ...SHADOW.lg,
  },
  guestMark: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  guestTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  guestText: { fontSize: 14, lineHeight: 21, color: COLORS.textMuted, textAlign: 'center' },
});
