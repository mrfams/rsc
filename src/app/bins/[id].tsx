import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api-client';
import { COLORS } from '@/lib/constants';
import { categoryEmoji, BIN_STATUS_LABEL, binStatusEnum, type BinStatus } from '@/lib/validation';
import type { BinDetailDto } from '@/lib/report-service';

export default function BinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ isAdmin: boolean }>('/api/me'),
    retry: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['bin', id],
    queryFn: () => api<BinDetailDto>(`/api/bins/${id}`),
    enabled: Boolean(id),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 3,
  });

  const dispute = useMutation({
    mutationFn: () => api(`/api/bins/${id}/dispute`, { method: 'POST', json: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bin', id] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: BinStatus) =>
      api(`/api/admin/bins/${id}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bin', id] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
    },
  });

  const deleteReport = useMutation({
    mutationFn: (reportId: string) => api(`/api/admin/reports/${reportId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bin', id] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
    },
  });


  function handleDispute() {
    if (dispute.isPending) return;
    Alert.alert(
      'Report bin missing?',
      'This marks the bin as disputed. A new independent sighting clears it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report missing',
          style: 'destructive',
          onPress: () => dispute.mutate(undefined, { onError: (e) => Alert.alert('Failed', e.message) }),
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Bin not found</Text>
        <Pressable onPress={() => router.back()} style={styles.button}>
          <Text style={styles.buttonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>
        {categoryEmoji(data.category)} {data.category} bin
      </Text>

      <View style={styles.statusPill}>
        <Text style={styles.statusText}>
          {BIN_STATUS_LABEL[data.status as keyof typeof BIN_STATUS_LABEL] ?? data.status} ·{' '}
          {data.reportCount} report{data.reportCount === 1 ? '' : 's'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Sighting history</Text>
      {data.reports.length === 0 ? (
        <Text style={styles.muted}>No reports yet.</Text>
      ) : (
        data.reports.map((report) => (
          <View key={report.id} style={styles.reportCard}>
            {report.photoUrl ? (
              <Image source={{ uri: report.photoUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Text style={styles.thumbEmoji}>{categoryEmoji(data.category)}</Text>
              </View>
            )}
            <View style={{ flexShrink: 1, flex: 1 }}>
              <Text numberOfLines={1} style={styles.reportNote}>
                {report.note ?? 'Sighting (no note)'}
              </Text>
              <Text style={styles.reportMeta}>
                {report.userEmail} · {new Date(report.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {me?.isAdmin ? (
              <Pressable
                hitSlop={6}
                onPress={() => deleteReport.mutate(report.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      {data.status !== 'removed' ? (
        <Pressable onPress={handleDispute} style={styles.disputeButton}>
          <Text style={styles.disputeButtonText}>{dispute.isPending ? 'Reporting…' : '⚠️ Report bin missing'}</Text>
        </Pressable>
      ) : null}

      {me?.isAdmin ? (
        <View style={styles.adminCard}>
          <Text style={styles.adminTitle}>Moderation</Text>
          <View style={styles.statusRow}>
            {binStatusEnum.enumValues.map((status) => (
              <Pressable
                key={status}
                onPress={() => setStatus.mutate(status)}
                style={[styles.statusChip, data.status === status && styles.statusChipActive]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    data.status === status && styles.statusChipTextActive,
                  ]}
                >
                  {BIN_STATUS_LABEL[status]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.adminHint}>
            Set the bin lifecycle directly; removed bins no longer appear on the public map.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, gap: 14, paddingBottom: 110 },
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  backRow: { paddingVertical: 8, alignSelf: 'flex-start' },
  backLink: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  statusPill: { alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  statusText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  muted: { color: COLORS.textMuted, fontSize: 14 },
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
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: COLORS.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 20 },
  reportNote: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  reportMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  deleteButton: { paddingHorizontal: 8, paddingVertical: 6 },
  deleteButtonText: { color: COLORS.danger, fontWeight: '700', fontSize: 12 },
  disputeButton: {
    marginTop: 10,
    backgroundColor: '#FEF2F2',
    borderColor: COLORS.danger,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  disputeButtonText: { color: COLORS.danger, fontWeight: '700' },
  adminCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  adminTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  adminHint: { fontSize: 12, color: COLORS.textMuted },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  statusChipActive: { backgroundColor: COLORS.primary },
  statusChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  statusChipTextActive: { color: '#fff' },
  errorText: { fontSize: 16, color: COLORS.danger },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
