/**
 * Alerts — activity on the signed-in member's own reports: pending review,
 * verified, disputed and removed bins. Drive-by push-token registration for
 * native installs so future server alerts arrive as notifications.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { registerPushToken } from '@/lib/register-push';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/api-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';

type MyReport = {
  id: string;
  note: string | null;
  createdAt: string;
  bin: { id: string; category: string; status: string };
};

type AlertCopy = {
  id: string;
  binId: string;
  dotKey: string;
  title: string;
  subtitle: string;
  note: string | null;
  pending: boolean;
};

export default function AlertsScreen() {
  const router = useRouter();
  const { data: session } = useSession();

  // Register push notifications for the signed-in member (native only).
  useEffect(() => {
    if (session?.user) void registerPushToken();
  }, [session?.user]);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => api<{ reports: MyReport[] }>('/api/reports?mine=1'),
    enabled: Boolean(session?.user),
  });

  const alerts: AlertCopy[] = (data?.reports ?? []).map(alertCopy);
  const awaiting = alerts.filter((a) => a.pending).length;

  if (!session?.user) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <View style={styles.emptyWrap}>
          <Ionicons name="notifications" size={40} color={COLORS.primary} />
          <Text style={styles.title}>Alerts</Text>
          <Text style={styles.muted}>Sign in to see activity on your reports.</Text>
          <View style={styles.authCard}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/sign-in')}>
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/sign-up')}>
              <Text style={styles.secondaryButtonText}>Create account</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, !alerts.length && styles.center]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
        <Text style={styles.headerSubtitle}>
          {isLoading
            ? 'Loading…'
            : awaiting > 0
              ? `${awaiting} report${awaiting === 1 ? '' : 's'} awaiting review`
              : alerts.length
                ? 'You are all caught up'
                : 'No activity yet'}
        </Text>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        refreshing={isLoading}
        onRefresh={refetch}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="sparkles" size={36} color={COLORS.primary} />
            <Text style={styles.muted}>
              Add your first bin with “Report” — status updates will show up here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.alertCard} onPress={() => router.push(`/bins/${item.binId}`)}>
            <View
              style={[styles.dot, { backgroundColor: CATEGORY_COLORS[item.dotKey] ?? COLORS.primary }]}
            />
            <View style={styles.alertBody}>
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.alertSub}>{item.subtitle}</Text>
              {item.note ? (
                <Text style={styles.alertNote} numberOfLines={2}>
                  {item.note}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function alertCopy(report: MyReport): AlertCopy {
  const status = report.bin?.status ?? 'pending';
  const date = new Date(report.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const emoji = categoryIcon(report.bin?.category ?? '');
  const common = {
    id: report.id,
    binId: report.bin?.id ?? '',
    dotKey: report.bin?.category ?? '',
    note: report.note ?? null,
  };
  switch (status) {
    case 'verified':
      return { ...common, title: `${emoji} Bin verified — thanks!`, subtitle: `Checked by a moderator · ${date}`, pending: false };
    case 'disputed':
      return { ...common, title: `${emoji} Bin disputed`, subtitle: `A moderator flagged this bin · ${date}`, pending: false };
    case 'removed':
      return { ...common, title: `${emoji} Bin removed`, subtitle: `Removed by moderation · ${date}`, pending: false };
    default:
      return { ...common, title: `${emoji} Bin added — awaiting review`, subtitle: `Under moderator review · ${date}`, pending: true };
  }
}

function categoryIcon(category: string) {
  switch (category) {
    case 'plastic': return '🥤';
    case 'paper': return '📄';
    case 'glass': return '🍾';
    case 'metal': return '🥫';
    case 'battery': return '🔋';
    case 'food_waste': return '🥐';
    default: return '🗑️';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  headerSubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  listContent: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  alertSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  alertNote: { fontSize: 13, color: COLORS.text, marginTop: 6, opacity: 0.8 },
  emptyWrap: { alignItems: 'center', gap: 16, padding: 48 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  muted: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  authCard: { flexDirection: 'row', gap: 12, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: '100%',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: '100%',
  },
  secondaryButtonText: { color: COLORS.text, fontWeight: '600', fontSize: 15, textAlign: 'center' },
});
