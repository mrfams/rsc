import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api-client';
import { registerPushToken } from '@/lib/register-push';

import { authClient, useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import { categoryEmoji } from '@/lib/validation';

type MyReport = {
  id: string;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin: { category: string };
};

type Me = {
  user: { name: string; email: string };
  isAdmin: boolean;
  stats: { reportsCount: number; binsContributed: number; trustScore: number };
};

export default function ProfileScreen() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Register push notifications for the signed-in member (native only).
  useEffect(() => {
    if (session?.user) void registerPushToken();
  }, [session?.user]);

  const { data, refetch } = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => api<{ reports: MyReport[] }>('/api/reports?mine=1'),
    enabled: Boolean(session?.user),
  });

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    enabled: Boolean(session?.user),
    retry: false,
  });

  if (isPending) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.muted}>You are browsing as a guest.</Text>

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

  async function signOut() {
    await authClient.signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.userCard}>
          <Text style={styles.userName}>{session.user.name}</Text>
          <Text style={styles.userEmail}>{session.user.email}</Text>
          {me ? (
            <View style={styles.trustCard}>
              <Text style={styles.trustTitle}>Trust score: {me.stats.trustScore}/100</Text>
              <Text style={styles.trustSub}>
                {me.stats.binsContributed} bin{me.stats.binsContributed === 1 ? '' : 's'} contributed
                · {me.stats.reportsCount} report{me.stats.reportsCount === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
        </View>

        {me?.isAdmin ? (
          <Pressable style={styles.adminButton} onPress={() => router.push('/admin')}>
            <Text style={styles.primaryButtonText}>🛠 Moderation panel</Text>
          </Pressable>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.sectionTitle}>My reports ({data?.reports.length ?? 0})</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.link}>Refresh</Text>
          </Pressable>
        </View>

        <FlatList
          data={data?.reports ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No reports yet — tap “+ Report bin” on the map.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.reportCard} onPress={() => router.push(`/report/${item.id}`)}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text style={styles.thumbEmoji}>{categoryEmoji(item.bin.category)}</Text>
                </View>
              )}
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.reportTitle}>{item.bin.category} bin</Text>
                <Text style={styles.reportSub} numberOfLines={1}>
                  {item.note ?? 'No note'} · {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </Pressable>
          )}
        />

        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: 20, gap: 14, paddingBottom: 110 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text },
  muted: { color: COLORS.textMuted, fontSize: 15 },
  authCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { alignItems: 'center', paddingVertical: 8 },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '600' },
  userCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  userName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: 14, color: COLORS.textMuted },
  trustCard: {
    marginTop: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  trustTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  trustSub: { fontSize: 12, color: COLORS.textMuted },
  adminButton: {
    backgroundColor: COLORS.text,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  link: { color: COLORS.primary, fontWeight: '600' },
  list: { gap: 10, paddingBottom: 12 },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: COLORS.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 22 },
  reportTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  reportSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  signOutButton: { alignItems: 'center', paddingVertical: 10 },
  signOutText: { color: COLORS.danger, fontWeight: '600' },
});
