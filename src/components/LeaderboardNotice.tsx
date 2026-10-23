import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api-client';
import { COLORS } from '@/lib/constants';
import { RADIUS, SHADOW } from '@/lib/theme';
import { useMe } from '@/lib/use-me';

const NOTICE_KEY = 'rsc.leaderboard-notice-v1';

/**
 * First-point leaderboard notice.
 *
 * Members are visible by default. The moment they earn their first point they
 * are told — once — and offered the choice to stay or hide. Both choices keep
 * their points; only the name on the public board changes.
 */
export function LeaderboardNotice() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(NOTICE_KEY)
      .then((seen) => {
        if (!active) return;
        setChecked(true);
        if (!seen) setVisible(true);
      })
      .catch(() => {
        // If storage is unavailable, showing the notice once per session is
        // still better than silently changing a privacy default.
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setOptIn = useMutation({
    mutationFn: (leaderboardOptIn: boolean) =>
      api('/api/me', { method: 'PATCH', json: { leaderboardOptIn } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });

  const eligible =
    checked &&
    Boolean(me) &&
    me?.leaderboardOptIn === true &&
    (me?.stats?.points ?? 0) > 0;

  const show = visible && eligible && !setOptIn.isSuccess;

  function remember() {
    setVisible(false);
    void AsyncStorage.setItem(NOTICE_KEY, '1').catch(() => {});
  }

  function choose(nextVisible: boolean) {
    setOptIn.mutate(nextVisible, { onSettled: remember });
  }

  return (
    <Modal
      visible={show}
      transparent
      animationType="fade"
      onRequestClose={remember}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.mark}>
            <Ionicons name="trophy" size={26} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>You are on the leaderboard</Text>
          <Text style={styles.body}>
            Your first point puts your name and points on the public campus leaderboard, visible
            to everyone — including guests. You can hide yourself at any time and still keep
            earning points.
          </Text>
          <View style={styles.actions}>
            <Button
              title="Hide me"
              variant="secondary"
              icon="eye-off-outline"
              loading={setOptIn.isPending && setOptIn.variables === false}
              onPress={() => choose(false)}
              style={{ flex: 1 }}
            />
            <Button
              title="Keep me visible"
              icon="checkmark"
              loading={setOptIn.isPending && setOptIn.variables === true}
              onPress={() => choose(true)}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={styles.footnote}>
            Change this whenever you like from Stats or the profile page.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(9, 14, 12, 0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 26,
    alignItems: 'center',
    gap: 11,
    ...SHADOW.lg,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(2px)' } : {}),
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
  actions: { flexDirection: 'row', gap: 9, width: '100%' },
  footnote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
});
