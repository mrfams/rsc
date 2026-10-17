import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api-client';
import { authClient, useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import { BIN_CATEGORY_EMOJI } from '@/lib/validation';

type MyReport = {
  id: string;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin: { category: keyof typeof BIN_CATEGORY_EMOJI };
};

export default function ProfileScreen() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const { data, refetch } = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => api<{ reports: MyReport[] }>('/api/reports?mine=1'),
    enabled: Boolean(session?.user),
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
        </View>

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
                  <Text style={styles.thumbEmoji}>{BIN_CATEGORY_EMOJI[item.bin.category]}</Text>
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
  content: { flex: 1, padding: 20, gap: 14 },
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
