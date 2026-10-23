import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/ui/Feedback';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import type { PublicLeaderboard } from '@/lib/points';
import { RADIUS } from '@/lib/theme';
import { useMe } from '@/lib/use-me';

/**
 * Top-10 board for the navigation menu.
 *
 * Members are public by default; the first-point notice offers the choice to
 * hide, and this card is the always-available way to change it later.
 */
export function LeaderboardCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: session } = useSession();
  const { data: me } = useMe();

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api<PublicLeaderboard>('/api/leaderboard'),
  });

  const setOptIn = useMutation({
    mutationFn: (leaderboardOptIn: boolean) =>
      api('/api/me', { method: 'PATCH', json: { leaderboardOptIn } }),
    onSuccess: (_data, leaderboardOptIn) => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      toast({
        tone: 'success',
        title: leaderboardOptIn ? 'You are on the leaderboard' : 'Hidden from the leaderboard',
        message: leaderboardOptIn
          ? 'Your name and points are now visible in the top 10.'
          : 'Your points stay private. You can join again any time.',
      });
    },
    onError: (error) =>
      toast({ tone: 'error', title: 'Could not update your choice', message: error.message }),
  });

  const signedIn = Boolean(session?.user);
  const optedIn = me?.leaderboardOptIn === true;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  function leaveBoard() {
    confirm({
      tone: 'warning',
      title: 'Leave the leaderboard?',
      message: 'Your name and points will no longer be shown publicly.',
      confirmLabel: 'Hide me',
      cancelLabel: 'Stay',
      destructive: true,
      onConfirm: () => setOptIn.mutate(false),
    });
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="trophy" size={14} color={COLORS.primary} />
          <Text style={styles.title}>Leaderboard</Text>
        </View>
        <Text style={styles.meta}>
          {total > 0 ? `${total} sharing` : 'Top 10'}
        </Text>
      </View>

      {signedIn && me !== undefined && !optedIn ? (
        <Pressable
          onPress={() => setOptIn.mutate(true)}
          disabled={setOptIn.isPending}
          accessibilityRole="button"
          accessibilityLabel="Join the leaderboard"
          style={({ pressed }) => [styles.joinRow, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="add-circle-outline" size={13} color={COLORS.primary} />
          <Text style={styles.joinText}>You are hidden — join the leaderboard</Text>
        </Pressable>
      ) : null}

      {optedIn ? (
        <View style={styles.youRow}>
          <Ionicons name="eye-outline" size={13} color={COLORS.primary} />
          <Text style={styles.youText}>
            {(me?.stats?.points ?? 0) > 0
              ? 'Your name is visible'
              : 'You appear after your first contribution'}
          </Text>
          <Pressable
            onPress={leaveBoard}
            accessibilityRole="button"
            accessibilityLabel="Hide me from the leaderboard"
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.leaveText}>Hide me</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <Text style={styles.empty}>Loading the board…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          {signedIn
            ? 'Nobody has earned a rank yet. Add a bin to be the first.'
            : 'No shared ranks yet. Sign in to join the top 10.'}
        </Text>
      ) : (
        rows.map((row) => (
          <View
            key={`${row.rank}-${row.name}`}
            style={[styles.row, compact && styles.rowCompact, row.isYou && styles.rowYou]}
          >
            <Text style={[styles.rank, row.rank <= 3 && styles.rankTop]}>{row.rank}</Text>
            <Text
              style={[styles.name, compact && styles.nameCompact, row.isYou && styles.nameYou]}
              numberOfLines={1}
            >
              {row.isYou ? 'You' : row.name}
            </Text>
            <Text style={[styles.points, compact && styles.pointsCompact]}>
              {row.points.toLocaleString()}
            </Text>
          </View>
        ))
      )}

      {!signedIn ? (
        <Text style={styles.footnote}>Members appear once they earn a point.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 5,
  },
  cardCompact: { padding: 10, gap: 3 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13.5, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  meta: { fontSize: 10.5, color: COLORS.textMuted, fontWeight: '600' },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  joinText: { fontSize: 10.5, fontWeight: '700', color: COLORS.primary },
  youRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  youText: { flex: 1, fontSize: 10.5, color: COLORS.textMuted },
  leaveText: { fontSize: 10.5, fontWeight: '700', color: COLORS.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: RADIUS.xs,
  },
  rowCompact: { paddingVertical: 3, gap: 6 },
  rowYou: { backgroundColor: COLORS.primarySoft },
  rank: {
    width: 18,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  rankTop: { color: COLORS.primary },
  name: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.text },
  nameCompact: { fontSize: 11.5 },
  nameYou: { fontWeight: '800', color: COLORS.primaryDark },
  points: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  pointsCompact: { fontSize: 10.5 },
  empty: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted, paddingVertical: 4 },
  footnote: { fontSize: 10, lineHeight: 14, color: COLORS.textMuted, marginTop: 2 },
});

export default LeaderboardCard;
