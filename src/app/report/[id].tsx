import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api-client';
import { COLORS } from '@/lib/constants';
import { categoryEmoji, BIN_STATUS_LABEL } from '@/lib/validation';

type ReportDetail = {
  id: string;
  binId: string;
  lat: number;
  lng: number;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin: {
    id: string;
    category: string;
    status: keyof typeof BIN_STATUS_LABEL;
    reportCount: number;
  };
};

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api<ReportDetail>(`/api/reports/${id}`),
    enabled: Boolean(id),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 3,
  });

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
        <Text style={styles.errorText}>Report not found</Text>
        <Pressable onPress={() => router.back()} style={styles.button}>
          <Text style={styles.buttonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const date = new Date(data.createdAt);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
        <Text style={styles.backLink}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>
        {categoryEmoji(data.bin.category)} {data.bin.category} bin
      </Text>
      <Text style={styles.subtitle}>
        {BIN_STATUS_LABEL[data.bin.status]} · {date.toLocaleString()}
      </Text>

      {data.photoUrl ? (
        <Image source={{ uri: data.photoUrl }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Text style={styles.photoPlaceholderText}>No photo</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location</Text>
        <Text style={styles.cardValue}>
          {data.lat.toFixed(6)}, {data.lng.toFixed(6)}
        </Text>
        <Text style={styles.cardValue}>
          {data.bin.reportCount} report{data.bin.reportCount === 1 ? '' : 's'} · bin{' '}
          {data.bin.id.slice(0, 8)}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Note</Text>
        <Text style={styles.cardValue}>{data.note ?? 'No note provided.'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, gap: 16, paddingBottom: 110 },
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  backRow: { paddingVertical: 8, alignSelf: 'flex-start' },
  backLink: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 15, color: COLORS.textMuted, marginTop: -8 },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: COLORS.border,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderText: { color: COLORS.textMuted },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  cardValue: { fontSize: 16, color: COLORS.text },
  errorText: { fontSize: 18, color: COLORS.danger, fontWeight: '600' },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    width: '100%',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
