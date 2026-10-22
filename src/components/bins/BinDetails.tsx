import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { useFeedback } from '@/components/ui/Feedback';
import { Notice } from '@/components/ui/Notice';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { CATEGORY_COLORS, COLORS } from '@/lib/constants';
import { displayArea, displayNote } from '@/lib/notes';
import { preparePhoto } from '@/lib/photo-client';
import { RADIUS, timeAgo } from '@/lib/theme';
import { useMe } from '@/lib/use-me';
import { BIN_STATUS_LABEL, binStatusEnum, categoryEmoji, type BinStatus } from '@/lib/validation';

type Report = {
  id: string;
  userId: string;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  userEmail: string;
  lat: number;
  lng: number;
};

type BinDetail = {
  id: string;
  category: string;
  name: string | null;
  lat: number;
  lng: number;
  area: string | null;
  status: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
  reports: Report[];
  /** Server-computed for the signed-in viewer, not limited to recent history. */
  hasSighted?: boolean;
};

type Config = {
  categories: { slug: string; name: string; color: string; emoji: string; active: boolean }[];
};

export function BinDetails({
  binId,
  onClose,
  variant = 'sheet',
}: {
  binId: string;
  onClose?: () => void;
  variant?: 'sheet' | 'panel' | 'page';
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: me } = useMe();
  const { toast, confirm, showDialog } = useFeedback();
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(
    null,
  );

  const { data: bin, isLoading, error } = useQuery({
    queryKey: ['bin', binId],
    queryFn: () => api<BinDetail>(`/api/bins/${binId}`),
    enabled: Boolean(binId),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  });

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/api/config'),
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bin', binId] });
    queryClient.invalidateQueries({ queryKey: ['bins'] });
    queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
    queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    // Points/rank changed, so the private standing and shared board are stale.
    queryClient.invalidateQueries({ queryKey: ['me'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const dispute = useMutation({
    mutationFn: () => api(`/api/bins/${binId}/dispute`, { method: 'POST', json: {} }),
    onSuccess: () => {
      invalidate();
      toast({
        tone: 'success',
        title: 'Thanks — marked as missing',
        message: 'A new sighting from the community will put it back on the map.',
      });
    },
    onError: (err) =>
      setNotice({
        tone: 'error',
        text:
          (err as { status?: number }).status === 401
            ? 'Sign in to report a missing bin.'
            : err.message,
      }),
  });

  const sighting = useMutation({
    mutationFn: () =>
      api('/api/reports', {
        method: 'POST',
        json: {
          lat: bin?.lat,
          lng: bin?.lng,
          category: bin?.category,
        },
      }),
    onSuccess: () => {
      invalidate();
      showDialog({
        tone: 'success',
        title: 'Sighting added',
        message:
          'Thank you — every independent sighting keeps this map trustworthy. The bin status has been updated.',
        confirmLabel: 'Done',
      });
    },
    onError: (err) => {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        setNotice({ tone: 'info', text: 'Sign in to confirm this bin.' });
        router.push('/sign-in');
        return;
      }
      setNotice({ tone: 'error', text: err.message });
    },
  });

  /*
   * Add a photo to an *existing* bin: it is stored as an extra sighting on
   * this exact bin (the server links by proximity), and the card then shows
   * it as the community photo.
   */
  const addPhoto = useMutation({
    mutationFn: (photoBase64: string) =>
      api<{ warning?: string | null }>('/api/reports', {
        method: 'POST',
        json: {
          lat: bin?.lat,
          lng: bin?.lng,
          category: bin?.category,
          note: 'Added a photo of this bin',
          photoBase64,
        },
      }),
    onSuccess: (result) => {
      invalidate();
      if (result?.warning) {
        showDialog({
          tone: 'warning',
          title: 'Sighting added, photo not saved',
          message: result.warning,
          confirmLabel: 'Okay',
        });
        return;
      }
      showDialog({
        tone: 'success',
        title: 'Photo added',
        message: 'Thanks — everyone scanning the map will recognise this bin now.',
        confirmLabel: 'Done',
      });
    },
    onError: (err) => {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        setNotice({ tone: 'info', text: 'Sign in to add a photo.' });
        router.push('/sign-in');
        return;
      }
      setNotice({ tone: 'error', text: err.message });
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: BinStatus) =>
      api(`/api/admin/bins/${binId}`, { method: 'PATCH', json: { status } }),
    onSuccess: (_data, status) => {
      invalidate();
      toast({
        tone: 'success',
        title: `Bin marked ${BIN_STATUS_LABEL[status].toLowerCase()}`,
        message: 'The public map is already updated.',
      });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const deleteReport = useMutation({
    mutationFn: (reportId: string) =>
      api(`/api/admin/reports/${reportId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Report removed' });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.muted}>Loading this bin…</Text>
      </View>
    );
  }

  if (error || !bin) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Ionicons name="help-circle-outline" size={26} color={COLORS.textMuted} />
        </View>
        <Text style={styles.errorTitle}>This bin is no longer available</Text>
        <Text style={styles.muted}>It may have been removed by a moderator.</Text>
        {onClose ? <Button title="Close" variant="secondary" size="sm" onPress={onClose} /> : null}
      </View>
    );
  }

  const category =
    config?.categories.find((c) => c.slug === bin.category) ??
    ({
      name: bin.category.replace(/_/g, ' '),
      color: CATEGORY_COLORS[bin.category],
      emoji: categoryEmoji(bin.category),
    } as const);
  const color = category.color ?? COLORS.primary;
  const latestPhoto = bin.reports.find((r) => r.photoUrl)?.photoUrl ?? null;
  const latestNote = bin.reports.map((r) => displayNote(r.note)).find((note) => note !== null) ?? null;
  const isAdmin = me?.isAdmin === true;
  const signedIn = Boolean(session?.user);
  const removed = bin.status === 'removed';
  const alreadySighted = bin.hasSighted === true;
  const displayName = bin.name?.trim() || `${category.name} bin`;
  // A member confirms once. A later "gone" flag makes confirmation useful again.
  const needsSighting = !bin.hasSighted || bin.status === 'disputed';
  const sightingLabel = bin.status === 'disputed' ? 'Report this bin' : 'I see it too';

  function directions() {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${bin?.lat},${bin?.lng}`;
    void Linking.openURL(url);
  }

  function askMissing() {
    if (!signedIn) {
      setNotice({ tone: 'info', text: 'Sign in to report a missing bin.' });
      router.push('/sign-in');
      return;
    }
    confirm({
      tone: 'warning',
      title: 'Is this bin gone?',
      message:
        'It will be marked as missing for the whole campus. A new independent sighting restores it automatically.',
      confirmLabel: 'Yes, it’s gone',
      cancelLabel: 'It’s still here',
      destructive: true,
      onConfirm: () => dispute.mutate(),
    });
  }

  function addSighting() {
    if (!signedIn) {
      setNotice({ tone: 'info', text: 'Sign in to add a sighting.' });
      router.push('/sign-in');
      return;
    }
    sighting.mutate();
  }

  async function addPhotoFrom(source: 'camera' | 'library') {
    if (!signedIn) {
      setNotice({ tone: 'info', text: 'Sign in to add a photo.' });
      router.push('/sign-in');
      return;
    }
    if (addPhoto.isPending) return;
    setNotice(null);
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setNotice({
            tone: 'error',
            text: 'Camera access is off. Allow it in settings, or choose a photo instead.',
          });
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
        exif: false,
      };
      const result =
        source === 'camera' && Platform.OS !== 'web'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]?.uri) return;

      // Same pipeline as the report form: resize/compress until it fits.
      const prepared = await preparePhoto(result.assets[0].uri);
      addPhoto.mutate(prepared.base64);
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not process that photo. Try another one.',
      });
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={[styles.categoryIcon, { backgroundColor: `${color}18` }]}>
          <Text style={styles.categoryEmoji}>{category.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {category.name} · {bin.reportCount} sighting{bin.reportCount === 1 ? '' : 's'} ·{' '}
            {timeAgo(bin.updatedAt)}
          </Text>
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close bin details"
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={19} color={COLORS.text} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {latestPhoto ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: latestPhoto }} style={styles.photo} contentFit="cover" />
            <View style={styles.photoBadge}>
              <Ionicons name="camera-outline" size={12} color="#FFFFFF" />
              <Text style={styles.photoBadgeText}>Community photo</Text>
            </View>
            <Pressable
              onPress={() => void addPhotoFrom('camera')}
              disabled={addPhoto.isPending}
              accessibilityRole="button"
              accessibilityLabel="Add another photo of this bin"
              style={({ pressed }) => [
                styles.photoAdd,
                addPhoto.isPending && { opacity: 0.6 },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Ionicons name="camera" size={14} color="#FFFFFF" />
              <Text style={styles.photoAddText}>
                {addPhoto.isPending ? 'Saving…' : 'Add photo'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.photoEmpty, { backgroundColor: `${color}10` }]}>
            <Text style={styles.photoEmoji}>{category.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoEmptyTitle}>{category.name} bin</Text>
              <Text style={styles.photoEmptyText}>
                No photo yet. Add one now and help everyone recognise this bin.
              </Text>
              <View style={styles.photoEmptyActions}>
                <Pressable
                  onPress={() => void addPhotoFrom('camera')}
                  disabled={addPhoto.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.photoEmptyBtn,
                    addPhoto.isPending && { opacity: 0.6 },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Ionicons name="camera-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.photoEmptyBtnText}>
                    {addPhoto.isPending ? 'Saving…' : 'Camera'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void addPhotoFrom('library')}
                  disabled={addPhoto.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.photoEmptyBtn,
                    addPhoto.isPending && { opacity: 0.6 },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Ionicons name="images-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.photoEmptyBtnText}>Photos</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <View style={styles.chipRow}>
          <StatusPill status={bin.status} />
          {displayArea(bin.area) ? (
            <View style={styles.areaPill}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.areaText} numberOfLines={1}>
                {displayArea(bin.area)}
              </Text>
            </View>
          ) : null}
        </View>

        {notice ? (
          <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
        ) : null}

        {latestNote ? (
          <View style={styles.quoteCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={COLORS.textMuted} />
            <Text style={styles.quoteText} numberOfLines={3}>
              “{latestNote}”
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Directions"
            icon="navigate-outline"
            onPress={directions}
            style={{ flex: 1 }}
          />
          {!removed && needsSighting ? (
            <Button
              title={sighting.isPending ? 'Saving…' : sightingLabel}
              icon={bin.status === 'disputed' ? 'refresh-outline' : 'eye-outline'}
              variant="secondary"
              loading={sighting.isPending}
              onPress={addSighting}
              style={{ flex: 1 }}
            />
          ) : !removed ? (
            <Button
              title="This bin is gone"
              icon="flag-outline"
              variant="danger"
              onPress={askMissing}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>

        {alreadySighted && !needsSighting ? (
          <View style={styles.sightedNote}>
            <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
            <Text style={styles.sightedNoteText}>
              You already confirmed this bin — thanks. We won’t ask you again unless it gets
              flagged.
            </Text>
          </View>
        ) : null}

        {!removed && needsSighting ? (
          <Pressable
            onPress={askMissing}
            accessibilityRole="button"
            style={({ pressed }) => [styles.missingLink, pressed && { opacity: 0.65 }]}
          >
            <Ionicons name="flag-outline" size={14} color={COLORS.danger} />
            <Text style={styles.missingLinkText}>This bin is gone</Text>
          </Pressable>
        ) : null}

        <View style={styles.statsRow}>
          <Stat label="Sightings" value={String(bin.reportCount)} icon="eye-outline" />
          <Stat
            label="Status"
            value={BIN_STATUS_LABEL[bin.status as BinStatus] ?? bin.status}
            icon="shield-checkmark-outline"
          />
          <Stat label="Added" value={timeAgo(bin.createdAt)} icon="calendar-outline" />
        </View>

        {isAdmin ? (
          <View style={styles.adminCard}>
            <View style={styles.adminHeader}>
              <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
              <Text style={styles.adminTitle}>Moderation</Text>
              <Text style={styles.adminHint}>Applies instantly</Text>
            </View>
            <View style={styles.statusChips}>
              {binStatusEnum.enumValues.map((status) => {
                const active = bin.status === status;
                return (
                  <Pressable
                    key={status}
                    onPress={() => setStatus.mutate(status)}
                    disabled={setStatus.isPending || active}
                    style={[styles.statusChip, active && styles.statusChipActive]}
                  >
                    <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                      {BIN_STATUS_LABEL[status]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sighting history</Text>
          <Text style={styles.sectionMeta}>{bin.reports.length} recent</Text>
        </View>

        {bin.reports.length === 0 ? (
          <Text style={styles.muted}>No sightings recorded yet.</Text>
        ) : (
          bin.reports.map((report) => (
            <View key={report.id} style={styles.reportRow}>
              {report.photoUrl ? (
                <Image source={{ uri: report.photoUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: `${color}14` }]}>
                  <Text style={{ fontSize: 18 }}>{category.emoji}</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.reportNote} numberOfLines={2}>
                  {displayNote(report.note) ?? 'Sighting confirmed'}
                </Text>
                <Text style={styles.reportMeta}>
                  {isAdmin ? report.userEmail : 'Community member'} · {timeAgo(report.createdAt)}
                </Text>
              </View>
              {isAdmin ? (
                <Pressable
                  onPress={() =>
                    confirm({
                      tone: 'warning',
                      title: 'Delete this sighting?',
                      message: 'The report is removed permanently. The bin stays on the map.',
                      confirmLabel: 'Delete',
                      destructive: true,
                      onConfirm: () => deleteReport.mutate(report.id),
                    })
                  }
                  hitSlop={8}
                  accessibilityLabel="Delete report"
                  style={({ pressed }) => [styles.delete, pressed && { opacity: 0.5 }]}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        {!signedIn && variant === 'page' ? (
          <Button
            title="Sign in to contribute"
            icon="log-in-outline"
            onPress={() => router.push('/sign-in')}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={15} color={COLORS.textMuted} />
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 28,
    backgroundColor: COLORS.surface,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  categoryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 22 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 26, gap: 13 },
  photoWrap: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 16 / 10, backgroundColor: COLORS.surfaceAlt },
  photoBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(16,20,19,0.62)',
  },
  photoBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' },
  photoAdd: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,20,19,0.66)',
  },
  photoAddText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  photoEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: RADIUS.lg,
    padding: 16,
    minHeight: 96,
  },
  photoEmoji: { fontSize: 40 },
  photoEmptyTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  photoEmptyText: { fontSize: 12, lineHeight: 17, color: COLORS.textMuted, marginTop: 2 },
  photoEmptyActions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  photoEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  photoEmptyBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  chipRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', alignItems: 'center' },
  areaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: '70%',
  },
  areaText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted },
  quoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    padding: 12,
  },
  quoteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.text, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 9 },
  sightedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: COLORS.successSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  sightedNoteText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: COLORS.text },
  missingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  missingLinkText: { fontSize: 12.5, fontWeight: '700', color: COLORS.danger },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 3,
  },
  statValue: { fontSize: 13.5, fontWeight: '800', color: COLORS.text },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  adminCard: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    padding: 13,
    gap: 9,
  },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adminTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  adminHint: { flex: 1, textAlign: 'right', fontSize: 10.5, color: COLORS.primary, fontWeight: '700' },
  statusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statusChipText: { fontSize: 11.5, fontWeight: '600', color: COLORS.text },
  statusChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  sectionMeta: { fontSize: 11.5, color: COLORS.textMuted },
  muted: { fontSize: 13, color: COLORS.textMuted },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 9,
  },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: COLORS.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  reportNote: { fontSize: 13.5, fontWeight: '600', color: COLORS.text },
  reportMeta: { fontSize: 11.5, color: COLORS.textMuted },
  delete: { padding: 6 },
});
