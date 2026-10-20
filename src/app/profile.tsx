import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { SocialLinks } from '@/components/ui/SocialLinks';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { authClient, useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { registerPushToken } from '@/lib/register-push';
import { initials, RADIUS, SHADOW, timeAgo } from '@/lib/theme';
import { useHydrated } from '@/lib/use-hydrated';
import { useMe } from '@/lib/use-me';
import { categoryEmoji } from '@/lib/validation';

type MyReport = {
  id: string;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin: { id: string; category: string; name: string | null; status: string };
};

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

export default function ProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  const desktop = hydrated && Platform.OS === 'web' && width >= 1024;
  const { data: session, isPending } = useSession();
  const { data: me, refetch: refetchMe } = useMe();
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user) void registerPushToken();
  }, [session?.user]);

  const {
    data: reports,
    refetch: refetchReports,
    isLoading,
  } = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => api<{ reports: MyReport[] }>('/api/reports?mine=1'),
    enabled: Boolean(session?.user),
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
      slug,
      active: true,
    };

  async function refresh() {
    setRefreshing(true);
    await Promise.all([refetchReports(), refetchMe()]);
    setRefreshing(false);
  }

  async function signOut() {
    await authClient.signOut();
    router.replace('/');
  }

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <PageHeader title="Profile" subtitle="Loading your impact…" />
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.guestScroll}>
          <View style={styles.guestCard}>
            <View style={styles.guestMark}>
              <Ionicons name="leaf" size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.guestTitle}>Track your impact</Text>
            <Text style={styles.guestText}>
              Sign in to report bins, confirm sightings, earn trust and see everything you have
              contributed to the campus map.
            </Text>
            <View style={styles.guestActions}>
              <Button
                title="Sign in"
                icon="log-in-outline"
                onPress={() => router.push('/sign-in')}
                style={{ flex: 1 }}
              />
              <Button
                title="Create account"
                variant="secondary"
                icon="person-add-outline"
                onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })}
                style={{ flex: 1 }}
              />
            </View>
            <View style={styles.guestFeatures}>
              <GuestFeature icon="map-outline" text="See every bin on campus" />
              <GuestFeature icon="cloud-offline-outline" text="Report offline, sync later" />
              <GuestFeature icon="shield-checkmark-outline" text="Build a trusted track record" />
            </View>
          </View>
          <View style={styles.guestSocial}>
            <SocialLinks label="Follow or contact us" />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const trust = me?.stats?.trustScore ?? 0;
  const list = reports?.reports ?? [];

  const hero = (
    <View style={styles.heroCard}>
      <View style={styles.heroBlob} />
      <View style={styles.heroTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(session.user.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {session.user.name || 'Member'}
            </Text>
            {me?.isAdmin ? (
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={11} color={COLORS.primary} />
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.email} numberOfLines={1}>
            {session.user.email}
          </Text>
        </View>
        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => [styles.signOutIcon, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="log-out-outline" size={19} color={COLORS.text} />
        </Pressable>
      </View>

      <View style={styles.trustBlock}>
        <View style={styles.trustRow}>
          <Text style={styles.trustLabel}>Trust score</Text>
          <Text style={styles.trustValue}>{trust}/100</Text>
        </View>
        <View style={styles.trustTrack}>
          <View style={[styles.trustFill, { width: `${Math.max(3, trust)}%` }]} />
        </View>
        <Text style={styles.trustHint}>
          {trust >= 60
            ? 'Trusted contributor — your sightings carry weight.'
            : 'Confirm more bins to build trust with the community.'}
        </Text>
      </View>

      <View style={styles.stats}>
        <StatTile value={String(me?.stats?.reportsCount ?? 0)} label="Reports" icon="document-text-outline" />
        <StatTile value={String(me?.stats?.binsContributed ?? 0)} label="Bins found" icon="trash-outline" />
        <StatTile value={String(trust)} label="Trust" icon="ribbon-outline" />
      </View>

      {me?.isAdmin ? (
        <Pressable
          onPress={() => router.push('/admin')}
          style={({ pressed }) => [styles.adminRow, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.adminRowIcon}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminRowTitle}>Admin workspace</Text>
            <Text style={styles.adminRowSub}>Moderate bins, types, people and the geofence.</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={COLORS.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  const reportsColumn = (
    <View style={styles.reportsColumn}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>My reports</Text>
          <Text style={styles.sectionSub}>{list.length} total · newest first</Text>
        </View>
        <Button
          title="Report a bin"
          icon="add"
          size="sm"
          onPress={() => router.push('/report/new')}
        />
      </View>

      {notice ? <Notice tone="success" message={notice} onDismiss={() => setNotice(null)} /> : null}

      {!isLoading && list.length === 0 ? (
        <EmptyState
          icon="leaf-outline"
          title="No reports yet"
          message="Spot a recycling bin on campus? Add it in under a minute and start building trust."
          actionLabel="Report the first bin"
          onAction={() => router.push('/report/new')}
        />
      ) : null}

      {list.map((report) => {
        const cat = categoryOf(report.bin.category);
        return (
          <Pressable
            key={report.id}
            onPress={() => router.push(`/report/${report.id}`)}
            style={({ pressed }) => [styles.reportCard, pressed && { opacity: 0.82 }]}
          >
            {report.photoUrl ? (
              <Image source={{ uri: report.photoUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: `${cat.color}14` }]}>
                <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 5 }}>
              <View style={styles.reportTop}>
                <Text style={styles.reportTitle} numberOfLines={1}>
                  {report.bin.name?.trim() || `${cat.name} bin`}
                </Text>
                <StatusPill status={report.bin.status} compact />
              </View>
              <Text style={styles.reportNote} numberOfLines={1}>
                {cat.emoji} {cat.name} · {report.note?.trim() || 'No note added'}
              </Text>
              <Text style={styles.reportDate}>{timeAgo(report.createdAt)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </Pressable>
        );
      })}

      <View style={styles.socialFooter}>
        <SocialLinks label="Follow or contact us" />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader
        title="Profile"
        subtitle="Your contribution to a cleaner campus."
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
          <View style={[styles.leftColumn, desktop && styles.leftColumnDesktop]}>{hero}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{reportsColumn}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={15} color={COLORS.textMuted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function GuestFeature({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.guestFeature}>
      <Ionicons name={icon} size={17} color={COLORS.primary} />
      <Text style={styles.guestFeatureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  layout: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: 18 },
  layoutDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  leftColumn: { width: '100%' },
  leftColumnDesktop: { width: 370 },

  heroCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    padding: 22,
    gap: 18,
    overflow: 'hidden',
    ...SHADOW.md,
  },
  heroBlob: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -110,
    right: -90,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  name: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, flexShrink: 1 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  email: { fontSize: 12.5, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  signOutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  trustBlock: { gap: 7 },
  trustRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  trustLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase' },
  trustValue: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  trustTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  trustFill: { height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  trustHint: { fontSize: 11.5, lineHeight: 16, color: 'rgba(255,255,255,0.68)' },

  stats: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 },
  statLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase', letterSpacing: 0.5 },

  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 12,
  },
  adminRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminRowTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.text },
  adminRowSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  reportsColumn: { gap: 12, flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  sectionSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 11,
    ...SHADOW.sm,
  },
  thumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: COLORS.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  reportTop: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  reportTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text, flex: 1 },
  reportNote: { fontSize: 12.5, color: COLORS.textMuted },
  reportDate: { fontSize: 11, color: COLORS.textMuted },
  socialFooter: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },

  guestScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 18 },
  guestCard: {
    width: '100%',
    maxWidth: 480,
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
  guestTitle: { fontSize: 25, fontWeight: '800', color: COLORS.text, letterSpacing: -0.7 },
  guestText: { fontSize: 14, lineHeight: 21, color: COLORS.textMuted, textAlign: 'center' },
  guestActions: { flexDirection: 'row', gap: 9, width: '100%', marginTop: 6 },
  guestFeatures: { width: '100%', gap: 10, marginTop: 14 },
  guestFeature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guestFeatureText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  guestSocial: { alignItems: 'center' },
});
