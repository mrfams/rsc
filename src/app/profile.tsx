import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SocialLinks } from '@/components/ui/SocialLinks';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { authClient, useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { displayNote } from '@/lib/notes';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW, initials, timeAgo } from '@/lib/theme';
import { useMe } from '@/lib/use-me';
import { categoryEmoji } from '@/lib/validation';

export function generateMetadata() {
  return siteMetadata({ title: 'Your profile', path: '/profile', noIndex: true });
}

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

/**
 * The member's own page: who they are, what they reported and the account
 * settings. Community numbers live on the public Stats page.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const { data: session, isPending } = useSession();
  const { data: me } = useMe();
  const [accountModal, setAccountModal] = useState<'edit' | 'delete' | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const { data: reports, isLoading, refetch } = useQuery({
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
    };

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <PageHeader title="Profile" />
      </SafeAreaView>
    );
  }

  // The profile belongs to a member — guests are asked to sign in first.
  if (!session?.user) {
    return <Redirect href="/sign-in" />;
  }

  const list = reports?.reports ?? [];

  

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/');
  }

  function openEditAccount() {
    setNameDraft(session?.user?.name ?? '');
    setAccountError(null);
    setAccountModal('edit');
  }

  function openDeleteAccount() {
    setPasswordDraft('');
    setAccountError(null);
    setAccountModal('delete');
  }

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) {
      setAccountError('Enter a name first.');
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const { error } = await authClient.updateUser({ name });
      if (error) {
        setAccountError(error.message ?? 'Could not update your name.');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setAccountModal(null);
      toast({
        tone: 'success',
        title: 'Profile updated',
        message: 'Thanks — your new name is live.',
      });
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Could not update your name.');
    } finally {
      setAccountBusy(false);
    }
  }

  async function deleteAccount() {
    if (!passwordDraft) {
      setAccountError('Enter your password to delete the account.');
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const { error } = await authClient.deleteUser({ password: passwordDraft });
      if (error) {
        setAccountError(
          error.message?.toLowerCase().includes('session')
            ? 'Your session is too old. Sign in again, then delete the account.'
            : error.message ?? 'Could not delete your account.',
        );
        return;
      }
      queryClient.clear();
      router.replace('/');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Could not delete your account.');
    } finally {
      setAccountBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <PageHeader title="Profile" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.layout}>
          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initials(session.user.name || session.user.email)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
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
            <Button
              title="Sign out"
              variant="secondary"
              size="sm"
              icon="log-out-outline"
              onPress={() => void signOut()}
            />
          </View>

          <View style={styles.linksCard}>
            <LinkRow
              icon="stats-chart-outline"
              title="Campus stats"
              subtitle=""
              onPress={() => router.push('/stats')}
            />
            <LinkRow
              icon="notifications-outline"
              title="My activity"
              subtitle="Updates on your own reports"
              onPress={() => router.push('/alerts')}
            />
            {me?.isAdmin ? (
              <LinkRow
                icon="shield-checkmark-outline"
                title="Admin"
                subtitle="Moderate bins, types, people and the geofence"
                onPress={() => router.push('/admin')}
              />
            ) : null}
          </View>

          <View style={styles.sightingsCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>My sightings</Text>
              <Text style={styles.cardMeta}>{list.length} logged · newest first</Text>
            </View>

            {!isLoading && list.length === 0 ? (
              <EmptyState
                icon="trash-outline"
                title="No bins yet"
                message="Spot a recycling bin on campus? Add it in under a minute."
                actionLabel="Add the first bin"
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
                    <View style={[styles.thumb, { backgroundColor: `${cat.color}14` }]}>
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
                      {cat.emoji} {cat.name} · {displayNote(report.note) ?? 'No note added'}
                    </Text>
                    <Text style={styles.reportDate}>{timeAgo(report.createdAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.socialFooter}>
            <SocialLinks label="Follow or contact us" />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={accountModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!accountBusy) setAccountModal(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!accountBusy) setAccountModal(null);
            }}
            accessibilityLabel="Close dialog"
          />
          <View style={styles.modalCard}>
            {accountModal === 'edit' ? (
              <>
                <Text style={styles.modalTitle}>Edit profile</Text>
                <Text style={styles.modalSub}>
                  This is the name other members see on sightings and the leaderboard.
                </Text>
                <Field
                  label="Name"
                  icon="person-outline"
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="done"
                  onSubmitEditing={() => void saveName()}
                  editable={!accountBusy}
                  error={accountError}
                />
                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    disabled={accountBusy}
                    onPress={() => setAccountModal(null)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Save"
                    loading={accountBusy}
                    onPress={() => void saveName()}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            ) : accountModal === 'delete' ? (
              <>
                <View style={styles.modalDangerIcon}>
                  <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                </View>
                <Text style={styles.modalTitle}>Delete your account?</Text>
                <Text style={styles.modalSub}>
                  This permanently removes your profile, points and sightings. Bins you added stay
                  on the map for everyone else. This cannot be undone.
                </Text>
                <Field
                  label="Password"
                  icon="lock-closed-outline"
                  value={passwordDraft}
                  onChangeText={setPasswordDraft}
                  secureTextEntry
                  autoComplete="current-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void deleteAccount()}
                  editable={!accountBusy}
                  error={accountError}
                />
                <View style={styles.modalActions}>
                  <Button
                    title="Keep account"
                    variant="secondary"
                    disabled={accountBusy}
                    onPress={() => setAccountModal(null)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Delete"
                    variant="danger"
                    loading={accountBusy}
                    onPress={() => void deleteAccount()}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function LinkRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.linkRowIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkRowTitle}>{title}</Text>
        <Text style={styles.linkRowSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  layout: { width: '100%', maxWidth: 780, alignSelf: 'center', gap: 14 },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...SHADOW.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  email: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },

  linksCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
    ...SHADOW.sm,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  linkRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  linkRowSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  sightingsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 4,
    ...SHADOW.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  cardMeta: { fontSize: 11.5, color: COLORS.textMuted },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  thumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: COLORS.surfaceAlt },
  reportTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  reportTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text, flex: 1 },
  reportNote: { fontSize: 12.5, color: COLORS.textMuted },
  reportDate: { fontSize: 11, color: COLORS.textMuted },

  accountCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...SHADOW.sm,
  },
  accountTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  accountRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRowIconDanger: { backgroundColor: COLORS.dangerSoft },
  accountRowTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.text },
  accountRowDanger: { color: COLORS.danger },
  accountRowSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  socialFooter: { marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },

  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 12,
    ...SHADOW.lg,
  },
  modalDangerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  modalSub: { fontSize: 12.5, lineHeight: 18, color: COLORS.textMuted },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 2 },
});
