import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api-client';
import { COLORS } from '@/lib/constants';
import type { BinDto } from '@/lib/report-service';
import { BIN_CATEGORY_EMOJI, BIN_STATUS_LABEL, binStatusEnum, type BinStatus } from '@/lib/validation';

export default function AdminScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ isAdmin: boolean }>('/api/me'),
    retry: false,
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-bins'],
    queryFn: () => api<BinDto[]>('/api/admin/bins'),
    retry: (count, err) => (err as { status?: number }).status === 403 ? false : count < 3,
  });

  const setStatus = useMutation({
    mutationFn: ({ binId, status }: { binId: string; status: BinStatus }) =>
      api(`/api/admin/bins/${binId}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
    },
  });

  if (me && !me.isAdmin) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.title}>Admins only</Text>
        <Text style={styles.muted}>Ask the sustainability office for moderation access.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Moderation</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.link}>{isFetching ? '…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.muted}>
            {(error as { status?: number }).status === 403
              ? 'Admins only.'
              : 'Could not load bins. Is the server running?'}
          </Text>
        ) : null}

        <FlatList
          data={data ?? []}
          keyExtractor={(bin) => bin.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            isLoading ? <Text style={styles.muted}>Loading…</Text> : <Text style={styles.muted}>No bins yet.</Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <View style={styles.binCard}>
              <Pressable onPress={() => router.push(`/bins/${item.id}`)} style={styles.binRow}>
                <Text style={styles.binEmoji}>{BIN_CATEGORY_EMOJI[item.category]}</Text>
                <View style={{ flexShrink: 1, flex: 1 }}>
                  <Text style={styles.binTitle}>
                    {item.category} bin · {BIN_STATUS_LABEL[item.status as keyof typeof BIN_STATUS_LABEL]}
                  </Text>
                  <Text style={styles.binMeta}>
                    {item.reportCount} report{item.reportCount === 1 ? '' : 's'} ·{' '}
                    {new Date(item.updatedAt ?? item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.statusRow}>
                {binStatusEnum.enumValues.map((status) => (
                  <Pressable
                    key={status}
                    onPress={() => setStatus.mutate({ binId: item.id, status })}
                    style={[styles.statusChip, item.status === status && styles.statusChipActive]}
                  >
                    <Text
                      style={[styles.statusChipText, item.status === status && styles.statusChipTextActive]}
                    >
                      {BIN_STATUS_LABEL[status]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { flex: 1, padding: 20, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  muted: { color: COLORS.textMuted, fontSize: 14 },
  link: { color: COLORS.primary, fontWeight: '600' },
  list: { gap: 10, paddingBottom: 24 },
  binCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  binRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  binEmoji: { fontSize: 24 },
  binTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  binMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  statusChipActive: { backgroundColor: COLORS.primary },
  statusChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  statusChipTextActive: { color: '#fff' },
  backButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backButtonText: { color: '#fff', fontWeight: '700' },
});
