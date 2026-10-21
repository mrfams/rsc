import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import type { PublicLeaderboard } from '@/lib/points';
import { RADIUS } from '@/lib/theme';
import { useMe } from '@/lib/use-me';

const PROMPT_KEY = 'rsc.leaderboard-prompt-dismissed';

/**
 * Top-10 board for the navigation menu. Names only appear for members who
 * explicitly allowed it. A declined prompt is remembered without blocking the
 * compact "Join" action, so nobody has to clear storage to change their mind.
 */
export function LeaderboardCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: session } = useSession();
  const { data: me } = useMe();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PROMPT_KEY)
      .then((value) => {
        if (active && value === '1') setDismissed(true);
      })
      .catch(() => {
        // A failed read only means the prompt may be shown again.
      });
    return () => {
      active = false;
    };
  }, []);

  function dismissPrompt() {
    setDismissed(true);
    void AsyncStorage.setItem(PROMPT_KEY, '1').catch(() => {});
  }

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
      // Do not immediately re-ask someone who just chose to hide.
      if (leaderboardOptIn) {
        void AsyncStorage.removeItem(PROMPT_KEY).catch(() => {});
      } else {
        dismissPrompt();
      }
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
  const canAsk = signedIn && me !== undefined && !optedIn && !dismissed;
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

      {canAsk ? (
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>Join the top 10?</Text>
          <Text style={styles.permissionText}>
            Allow your name and points to be shown on the public leaderboard.
          </Text>
          <View style={styles.permissionActions}>
            <Button
              title="Allow"
              size="sm"
              icon="checkmark"
              loading={setOptIn.isPending}
              onPress={() => setOptIn.mutate(true)}
            />
            <Pressable
              onPress={dismissPrompt}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={({ pressed }) => [styles.notNow, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.notNowText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {signedIn && !optedIn && dismissed ? (
        <Pressable
          onPress={() => setOptIn.mutate(true)}
          accessibilityRole="button"
          accessibilityLabel="Join the leaderboard"
          style={({ pressed }) => [styles.joinRow, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="add-circle-outline" size={13} color={COLORS.primary} />
          <Text style={styles.joinText}>Join the leaderboard</Text>
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
            ? 'Nobody has agreed to share a rank yet. Be the first.'
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
        <Text style={styles.footnote}>Only members who allow it appear by name.</Text>
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
  permission: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.sm,
    padding: 10,
    gap: 4,
    marginBottom: 3,
  },
  permissionTitle: { fontSize: 12.5, fontWeight: '800', color: COLORS.text },
  permissionText: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted },
  permissionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  notNow: { paddingVertical: 4, paddingHorizontal: 2 },
  notNowText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
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
