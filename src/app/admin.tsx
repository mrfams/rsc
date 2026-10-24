import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminMapTab } from '@/components/admin/AdminMapTab';
import { BinDetails } from '@/components/bins/BinDetails';
import { BrandMark } from '@/components/ui/BrandMark';
import MapView from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { useFeedback } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Segmented } from '@/components/ui/Segmented';
import { StatusPill } from '@/components/ui/StatusPill';
import { api } from '@/lib/api-client';
import { CAMPUS_CENTER, CAMPUS_POLYGONS, COLORS } from '@/lib/constants';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW, STATUS_META, initials, timeAgo } from '@/lib/theme';
import { useMe } from '@/lib/use-me';
import { BIN_STATUS_LABEL, categoryEmoji, type BinStatus } from '@/lib/validation';

export function generateMetadata() {
  return siteMetadata({ title: 'Admin', path: '/admin', noIndex: true });
}

type Tab = 'overview' | 'map' | 'bins' | 'types' | 'people' | 'geofence';

type BinDto = {
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
};

type CategoryDto = {
  slug: string;
  name: string;
  color: string;
  emoji: string;
  active: boolean;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  leaderboardOptIn: boolean;
  disabledAt: string | null;
  createdAt: string;
};

type CampusPoint = { latitude: number; longitude: number };
type CampusResponse = {
  campusPolygons?: CampusPoint[][];
  campusPolygon?: CampusPoint[];
  defaultPolygons?: CampusPoint[][];
  defaultPolygon?: CampusPoint[];
};

const TABS = [
  {
    key: 'overview' as const,
    label: 'Overview',
    icon: 'grid-outline' as const,
    hint: 'Stats and recent activity',
  },
  {
    key: 'map' as const,
    label: 'Map studio',
    icon: 'map-outline' as const,
    hint: 'Add, rename and move bins',
  },
  {
    key: 'bins' as const,
    label: 'Bins',
    icon: 'trash-outline' as const,
    hint: 'Review and verify',
  },
  {
    key: 'types' as const,
    label: 'Bin types',
    icon: 'pricetags-outline' as const,
    hint: 'Categories and colours',
  },
  {
    key: 'people' as const,
    label: 'People',
    icon: 'people-outline' as const,
    hint: 'Members and moderators',
  },
  {
    key: 'geofence' as const,
    label: 'Geofence',
    icon: 'scan-outline' as const,
    hint: 'Campus boundary editor',
  },
];

const SWATCHES = [
  '#0E7C5A',
  '#0284C7',
  '#7C3AED',
  '#059669',
  '#EA580C',
  '#DC2626',
  '#16A34A',
  '#52525B',
];

type NoticeState = { tone: 'error' | 'success' | 'info'; text: string } | null;

const STATUSES: BinStatus[] = ['pending', 'verified', 'disputed', 'removed'];

function isTab(value: unknown): value is Tab {
  return typeof value === 'string' && TABS.some((item) => item.key === value);
}

function isBinsFilter(value: unknown): value is 'all' | BinStatus {
  return value === 'all' || (typeof value === 'string' && STATUSES.includes(value as BinStatus));
}

export default function AdminScreen() {
  return <AdminWorkspace />;
}

/** Shared workspace so /admin/review can open straight into the pending queue. */
export function AdminWorkspace({
  initialTab = 'overview',
  initialFilter = 'all',
}: {
  initialTab?: Tab;
  initialFilter?: 'all' | BinStatus;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ tab?: string; filter?: string }>();
  const { data: me, isLoading } = useMe();
  const tab: Tab = isTab(params.tab) ? params.tab : initialTab;
  const binsFilter: 'all' | BinStatus = isBinsFilter(params.filter)
    ? params.filter
    : initialFilter;
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const current = TABS.find((item) => item.key === tab) ?? TABS[0];

  /** Keep the section in the URL so Review, Profile and Admin stay in sync. */
  function selectTab(next: Tab, nextFilter?: 'all' | BinStatus) {
    const nextParams = {
      tab: next,
      filter: next === 'bins' ? (nextFilter ?? 'all') : undefined,
    };
    if (pathname === '/admin') {
      router.setParams(nextParams);
    } else {
      router.replace({ pathname: '/admin', params: nextParams });
    }
  }

  function changeBinsFilter(next: 'all' | BinStatus) {
    selectTab('bins', next);
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!me?.isAdmin) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <View style={styles.deniedCard}>
          <View style={styles.deniedIcon}>
            <Ionicons name="lock-closed-outline" size={30} color={COLORS.primary} />
          </View>
          <Text style={styles.deniedTitle}>Admins only</Text>
          <Text style={styles.deniedText}>
            This workspace is for moderators. Ask the sustainability office for access, or sign in
            with an admin account.
          </Text>
          <Button title="Back to the map" icon="map-outline" onPress={() => router.replace('/')} />
          <Button
            title="Sign in"
            variant="secondary"
            onPress={() => router.push('/sign-in')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.adminHeader}>
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open admin menu"
          style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="menu" size={21} color={COLORS.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.adminSectionTitle}>{current.label}</Text>
        </View>
        <View style={styles.roleBadge}>
          <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} />
          <Text style={styles.roleBadgeText}>Admin</Text>
        </View>
      </View>

      <AdminMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        tab={tab}
        name={me?.user.name ?? ''}
        email={me?.user.email ?? ''}
        onSelect={(next) => {
          selectTab(next);
          setMenuOpen(false);
        }}
      />

      <View style={styles.body}>
        {tab === 'overview' ? (
          <OverviewTab
            onOpenBin={setSelectedBinId}
            onGoTab={selectTab}
            onOpenBins={(filter) => selectTab('bins', filter)}
            onOpenPeople={() => selectTab('people')}
          />
        ) : null}
        {tab === 'map' ? <AdminMapTab onOpenBin={setSelectedBinId} /> : null}
        {tab === 'bins' ? (
          <BinsTab
            onOpenBin={setSelectedBinId}
            filter={binsFilter}
            onFilterChange={changeBinsFilter}
          />
        ) : null}
        {tab === 'types' ? <TypesTab /> : null}
        {tab === 'people' ? <PeopleTab /> : null}
        {tab === 'geofence' ? <GeofenceTab /> : null}
      </View>

      {selectedBinId ? (
        <BinOverlay binId={selectedBinId} onClose={() => setSelectedBinId(null)} desktop={desktop} />
      ) : null}
    </SafeAreaView>
  );
}

/* ------------------------------ Admin menu -------------------------------- */

function AdminMenu({
  open,
  onClose,
  tab,
  name,
  email,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  tab: Tab;
  name: string;
  email: string;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} label="admin menu">
      <View style={styles.menuPanel}>
        <View style={styles.menuHeader}>
          <BrandMark size={38} radius={12} />
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Admin</Text>
            <Text style={styles.menuSub} numberOfLines={1}>
              {name || 'Moderator'} · {email}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close admin menu"
            style={styles.menuClose}
          >
            <Ionicons name="close" size={18} color={COLORS.text} />
          </Pressable>
        </View>

        <Text style={styles.menuSectionLabel}>Sections</Text>
        <View style={{ gap: 3 }}>
          {TABS.map((item) => {
            const on = item.key === tab;
            return (
              <Pressable
                key={item.key}
                onPress={() => onSelect(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.menuItem,
                  on && styles.menuItemActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.menuItemIcon, on && styles.menuItemIconActive]}>
                  <Ionicons name={item.icon} size={19} color={on ? COLORS.primary : COLORS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemLabel, on && styles.menuItemLabelActive]}>
                    {item.label}
                  </Text>
                  <Text style={styles.menuItemHint}>{item.hint}</Text>
                </View>
                {on ? <View style={styles.menuActiveDot} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1 }} />
        <Text style={styles.menuFootnote}>
          Changes you make here are live for everyone on the map immediately.
        </Text>
      </View>
    </Drawer>
  );
}

/* -------------------------------- Overview -------------------------------- */

function OverviewTab({
  onOpenBin,
  onGoTab,
  onOpenBins,
  onOpenPeople,
}: {
  onOpenBin: (id: string) => void;
  onGoTab: (tab: Tab) => void;
  onOpenBins: (filter: 'all' | BinStatus) => void;
  onOpenPeople: () => void;
}) {
  const {
    data: bins,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-bins'],
    queryFn: () => api<BinDto[]>('/api/admin/bins'),
  });
  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<AdminUser[]>('/api/admin/users'),
  });
  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<CategoryDto[]>('/api/admin/categories'),
  });

  // Cards and map-health numbers ignore bins whose type has been switched off.
  // Only count categories that are active AND have at least one bin.
  const allBins = bins ?? [];
  const activeCategoriesWithBins = (categories ?? []).filter(
    (category) => category.active && (allBins ?? []).some((bin) => bin.category === category.slug),
  );
  const activeSlugs = new Set(
    activeCategoriesWithBins.map((category) => category.slug),
  );
  const list = activeCategoriesWithBins.length
    ? allBins.filter((bin) => activeSlugs.has(bin.category))
    : allBins;
  const pending = list.filter((b) => b.status === 'pending').length;
  const verified = list.filter((b) => b.status === 'verified').length;
  const disputed = list.filter((b) => b.status === 'disputed').length;
  const removed = list.filter((b) => b.status === 'removed').length;
  const recent = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  const breakdown = [
    { key: 'verified', count: verified, color: STATUS_META.verified.color },
    { key: 'pending', count: pending, color: STATUS_META.pending.color },
    { key: 'disputed', count: disputed, color: STATUS_META.disputed.color },
    { key: 'removed', count: removed, color: STATUS_META.removed.color },
  ];

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.muted}>Loading campus data…</Text>
        </View>
      ) : null}

      {isError ? (
        <Notice
          tone="error"
          message={`Could not load admin data: ${error instanceof Error ? error.message : 'unknown error'}`}
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : null}

      <View style={styles.statsGrid}>
        <StatCard
          label="Total bins"
          value={String(list.filter((b) => b.status !== 'removed').length)}
          icon="trash-outline"
          tone={COLORS.primary}
          onPress={() => onOpenBins('all')}
        />
        <StatCard
          label="Awaiting review"
          value={String(pending)}
          icon="time-outline"
          tone={COLORS.warning}
          onPress={() => onOpenBins('pending')}
        />
        <StatCard
          label="Verified"
          value={String(verified)}
          icon="checkmark-circle-outline"
          tone={COLORS.success}
          onPress={() => onOpenBins('verified')}
        />
        <StatCard
          label="Reported missing"
          value={String(disputed)}
          icon="alert-circle-outline"
          tone={COLORS.danger}
          onPress={() => onOpenBins('disputed')}
        />
        <StatCard
          label="Members"
          value={String(users?.length ?? 0)}
          icon="people-outline"
          tone={COLORS.info}
          onPress={onOpenPeople}
        />
      </View>

      <Card style={{ gap: 12 }}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Map health</Text>
          <Text style={styles.cardMeta}>
            {activeCategoriesWithBins.length} active types
          </Text>
        </View>
        <View style={styles.breakdownBar}>
          {breakdown.map((part) =>
            part.count > 0 ? (
              <View
                key={part.key}
                style={{ flex: part.count, backgroundColor: part.color, height: '100%' }}
              />
            ) : null,
          )}
          {list.length === 0 ? <View style={{ flex: 1, backgroundColor: COLORS.border }} /> : null}
        </View>
        <View style={styles.legend}>
          {breakdown.map((part) => (
            <View key={part.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: part.color }]} />
              <Text style={styles.legendText}>
                {BIN_STATUS_LABEL[part.key as BinStatus]} {part.count}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.quickActions}>
        <Button
          title="Review pending"
          icon="time-outline"
          variant="secondary"
          size="sm"
          onPress={() => onOpenBins('pending')}
        />
        <Button
          title="Edit types"
          icon="pricetags-outline"
          variant="secondary"
          size="sm"
          onPress={() => onGoTab('types')}
        />
        <Button
          title="Draw geofence"
          icon="scan-outline"
          variant="secondary"
          size="sm"
          onPress={() => onGoTab('geofence')}
        />
      </View>

      <DownloadLinkCard />

      <Card padded={false}>
        <View style={[styles.cardHeaderRow, styles.cardHeaderPad]}>
          <Text style={styles.cardTitle}>Recently updated</Text>
          <Pressable onPress={() => onGoTab('bins')}>
            <Text style={styles.textLink}>View all</Text>
          </Pressable>
        </View>
        {recent.length === 0 ? (
          <Text style={[styles.muted, { padding: 18 }]}>No bins yet.</Text>
        ) : (
          recent.map((bin) => (
            <Pressable
              key={bin.id}
              onPress={() => onOpenBin(bin.id)}
              style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.recentEmoji}>{categoryEmoji(bin.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentTitle}>
                  {bin.name ?? `${bin.category.replace(/_/g, ' ')} bin`}
                </Text>
                <Text style={styles.recentMeta}>
                  {bin.category.replace(/_/g, ' ')} · {bin.reportCount} sightings ·{' '}
                  {timeAgo(bin.updatedAt)}
                </Text>
              </View>
              <StatusPill status={bin.status} compact />
              <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
            </Pressable>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

/* ---------------------------- Download link -------------------------------- */

/**
 * Where the “Get the app” page sends people.
 *
 * Every EAS build produces its own APK artifact URL, so the link is edited
 * here instead of in code: paste the new URL after a build and the download
 * page (and the QR code on it) points at it straight away.
 */
function DownloadLinkCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  // The field follows the server value until the admin starts typing.
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['admin-download'],
    queryFn: () => api<{ androidUrl: string }>('/api/admin/download'),
  });

  const value = edited ?? data?.androidUrl ?? '';

  const save = useMutation({
    mutationFn: () =>
      api<{ androidUrl: string }>('/api/admin/download', {
        method: 'PUT',
        json: { androidUrl: value },
      }),
    onSuccess: (result) => {
      setError(null);
      setEdited(result.androidUrl);
      queryClient.invalidateQueries({ queryKey: ['admin-download'] });
      queryClient.invalidateQueries({ queryKey: ['download'] });
      toast({
        tone: 'success',
        title: 'Download link updated',
        message: 'The download page and its QR code now point at the new build.',
      });
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>App download link</Text>
        <Pressable
          onPress={() => router.push('/download')}
          accessibilityRole="link"
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.textLink}>Open page</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>
        Paste the APK link of the latest EAS build. Everyone who opens “Get the app” — and scans
        the QR code — gets that build, without a new app release.
      </Text>
      <Field
        label="Android APK link"
        value={value}
        onChangeText={setEdited}
        placeholder="https://expo.dev/artifacts/eas/….apk"
        autoCapitalize="none"
        autoCorrect={false}
        error={error}
      />
      <Button
        title="Save link"
        icon="save-outline"
        size="sm"
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Open ${label.toLowerCase()}`}
      style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.statIcon, { backgroundColor: `${tone}16` }]}>
        <Ionicons name={icon} size={17} color={tone} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statArrow}>
        <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
      </View>
    </Pressable>
  );
}

/* ---------------------------------- Bins ---------------------------------- */

function BinsTab({
  onOpenBin,
  filter,
  onFilterChange,
}: {
  onOpenBin: (id: string) => void;
  filter: 'all' | BinStatus;
  onFilterChange: (filter: 'all' | BinStatus) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bins'],
    queryFn: () => api<BinDto[]>('/api/admin/bins'),
  });

  const setStatus = useMutation({
    mutationFn: ({ binId, status }: { binId: string; status: BinStatus }) =>
      api(`/api/admin/bins/${binId}`, { method: 'PATCH', json: { status } }),
    onSuccess: (_data, vars) => {
      setNotice(null);
      toast({
        tone: 'success',
        title: `Bin marked ${BIN_STATUS_LABEL[vars.status].toLowerCase()}`,
        message: 'The public map and everyone following this bin see it now.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
      queryClient.invalidateQueries({ queryKey: ['bins'] });
      queryClient.invalidateQueries({ queryKey: ['bin', vars.binId] });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const filtered = (data ?? []).filter((bin) => {
    if (filter !== 'all' && bin.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      bin.category.toLowerCase().includes(q) ||
      (bin.name ?? '').toLowerCase().includes(q) ||
      (bin.area ?? '').toLowerCase().includes(q) ||
      bin.id.toLowerCase().includes(q)
    );
  });

  return (
    <FlatList
      data={filtered}
      keyExtractor={(bin) => bin.id}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionTitle}>Bins</Text>
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={17} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search place, category or bin id"
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>
          <Segmented
            items={[
              { key: 'all' as const, label: 'All', badge: data?.length },
              { key: 'pending' as const, label: 'Pending' },
              { key: 'verified' as const, label: 'Verified' },
              { key: 'disputed' as const, label: 'Disputed' },
              { key: 'removed' as const, label: 'Removed' },
            ]}
            value={filter}
            onChange={onFilterChange}
            scrollable
          />
          {notice ? (
            <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.muted}>{isLoading ? 'Loading bins…' : 'No bins match this view.'}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.binCard}>
          <Pressable
            onPress={() => onOpenBin(item.id)}
            style={({ pressed }) => [styles.binRow, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.binEmojiWrap}>
              <Text style={styles.binEmoji}>{categoryEmoji(item.category)}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.binTitle} numberOfLines={1}>
                {item.name ?? `${item.category.replace(/_/g, ' ')} bin`}
              </Text>
              <Text style={styles.binMeta}>
                {item.category.replace(/_/g, ' ')} · {item.reportCount} sighting
                {item.reportCount === 1 ? '' : 's'} · updated {timeAgo(item.updatedAt)}
              </Text>
            </View>
            <StatusPill status={item.status} compact />
            <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
          </Pressable>
          <View style={styles.statusRow}>
            {(['pending', 'verified', 'disputed', 'removed'] as BinStatus[]).map((status) => {
              const active = item.status === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setStatus.mutate({ binId: item.id, status })}
                  disabled={setStatus.isPending}
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
      )}
    />
  );
}

/* --------------------------------- Types ---------------------------------- */

function TypesTab() {
  const queryClient = useQueryClient();
  const { toast, showDialog } = useFeedback();
  const [notice, setNotice] = useState<NoticeState>(null);
  const [mode, setMode] = useState<'new' | 'edit' | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [emoji, setEmoji] = useState('♻️');
  const [color, setColor] = useState('#0E7C5A');
  const [active, setActive] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api<CategoryDto[]>('/api/admin/categories'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    queryClient.invalidateQueries({ queryKey: ['config'] });
  };

  function resetForm() {
    setMode(null);
    setEditingSlug(null);
    setEditorError(null);
    setConfirmDelete(false);
    setNotice(null);
    setName('');
    setSlug('');
    setEmoji('♻️');
    setColor('#0E7C5A');
    setActive(true);
  }

  function startCreate() {
    resetForm();
    setMode('new');
  }

  function startEdit(category: CategoryDto) {
    resetForm();
    setMode('edit');
    setEditingSlug(category.slug);
    setName(category.name);
    setSlug(category.slug);
    setEmoji(category.emoji);
    setColor(category.color);
    setActive(category.active);
  }

  const create = useMutation({
    mutationFn: () =>
      api('/api/admin/categories', {
        method: 'POST',
        json: { slug, name, emoji, color },
      }),
    onSuccess: (_data, _vars) => {
      showDialog({
        tone: 'success',
        title: 'Bin type created',
        message: `${name.trim() || 'The new type'} is now available in filters and the add-bin form.`,
        confirmLabel: 'Great',
      });
      resetForm();
      invalidate();
    },
    onError: (err) => setEditorError(err.message),
  });

  const patch = useMutation({
    mutationFn: (payload: { slug: string; body: Record<string, unknown> }) =>
      api('/api/admin/categories', { method: 'PATCH', json: { slug: payload.slug, ...payload.body } }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Bin type updated' });
      resetForm();
      invalidate();
    },
    onError: (err) => setEditorError(err.message),
  });

  const remove = useMutation({
    mutationFn: (slugToDelete: string) =>
      api('/api/admin/categories', { method: 'DELETE', json: { slug: slugToDelete } }),
    onSuccess: () => {
      toast({
        tone: 'success',
        title: 'Bin type deleted',
        message: 'It is gone from the filters and the report picker.',
      });
      resetForm();
      invalidate();
    },
    onError: (err) => {
      setConfirmDelete(false);
      setEditorError(err.message);
    },
  });

  // Toggling visibility from the list must not reset an open editor.
  const toggle = useMutation({
    mutationFn: (payload: { slug: string; active: boolean }) =>
      api('/api/admin/categories', {
        method: 'PATCH',
        json: { slug: payload.slug, active: payload.active },
      }),
    onSuccess: (_data, vars) => {
      toast({
        tone: 'success',
        title: vars.active ? 'Type visible on the map' : 'Type hidden',
        message: vars.active
          ? 'Members can now filter and report this type.'
          : 'Historical bins keep their type; it is just hidden from pickers.',
      });
      invalidate();
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const canSubmit = name.trim().length > 0 && (mode === 'edit' || slug.trim().length > 0);
  const editing = mode === 'edit';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.listHeaderRow}>
        <Text style={[styles.sectionTitle, { flex: 1 }]}>Bin types</Text>
        <Button
          title="New type"
          icon="add"
          size="sm"
          onPress={startCreate}
          style={styles.headerButton}
        />
      </View>

      {notice ? (
        <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
      ) : null}

      <Modal
        visible={mode !== null}
        transparent
        animationType="fade"
        onRequestClose={resetForm}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editorRoot}
        >
          <Pressable
            style={styles.editorBackdrop}
            onPress={resetForm}
            accessibilityRole="button"
            accessibilityLabel="Close bin type editor"
          />
          <View style={styles.editorCard}>
            <ScrollView
              contentContainerStyle={styles.editorContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.editorHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editorTitle}>
                    {mode === 'new' ? 'New bin type' : 'Edit bin type'}
                  </Text>
                  <Text style={styles.editorSub}>
                    {mode === 'new'
                      ? 'It appears in filters and the report picker immediately.'
                      : editingSlug}
                  </Text>
                </View>
                <Pressable
                  onPress={resetForm}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={({ pressed }) => [styles.editorClose, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="close" size={18} color={COLORS.text} />
                </Pressable>
              </View>

              {editorError ? (
                <Notice
                  tone="error"
                  message={editorError}
                  onDismiss={() => setEditorError(null)}
                />
              ) : null}

              <View style={styles.formRow}>
            <View style={{ flex: 2 }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="Food waste" />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Emoji"
                value={emoji}
                onChangeText={setEmoji}
                placeholder="♻️"
                maxLength={4}
              />
            </View>
          </View>
          {mode === 'new' ? (
            <Field
              label="Slug"
              value={slug}
              onChangeText={(v) => setSlug(v.toLowerCase().replace(/\s+/g, '_'))}
              placeholder="food_waste"
              autoCapitalize="none"
              hint="Lowercase letters, numbers and underscores."
            />
          ) : null}
          <View style={{ gap: 7 }}>
            <Text style={styles.fieldLabel}>Colour</Text>
            <View style={styles.swatches}>
              {SWATCHES.map((swatch) => (
                <Pressable
                  key={swatch}
                  onPress={() => setColor(swatch)}
                  accessibilityLabel={`Use colour ${swatch}`}
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch },
                    color.toLowerCase() === swatch.toLowerCase() && styles.swatchActive,
                  ]}
                />
              ))}
              <TextInput
                value={color}
                onChangeText={setColor}
                style={styles.hexInput}
                autoCapitalize="characters"
                maxLength={7}
              />
            </View>
          </View>
          {mode === 'edit' ? (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Visible in the app</Text>
                <Text style={styles.switchSub}>Hidden types stay on historical bins.</Text>
              </View>
              <Switch
                value={active}
                onValueChange={setActive}
                trackColor={{ true: COLORS.primary, false: COLORS.border }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}
              {confirmDelete ? (
                <View style={styles.deletePanel}>
                  <Ionicons name="warning-outline" size={18} color={COLORS.danger} />
                  <Text style={styles.deletePanelText}>
                    Deleting “{name || editingSlug}” cannot be undone. Types used by existing bins
                    cannot be deleted — hide them instead.
                  </Text>
                  <View style={styles.deletePanelActions}>
                    <Button
                      title="Keep type"
                      variant="secondary"
                      size="sm"
                      onPress={() => setConfirmDelete(false)}
                    />
                    <Button
                      title="Delete permanently"
                      variant="danger"
                      size="sm"
                      loading={remove.isPending}
                      onPress={() => {
                        if (editingSlug) remove.mutate(editingSlug);
                      }}
                    />
                  </View>
                </View>
              ) : null}

              <View style={styles.editorActions}>
                {editing ? (
                  <Button
                    title="Delete"
                    variant="danger"
                    size="sm"
                    icon="trash-outline"
                    onPress={() => setConfirmDelete(true)}
                  />
                ) : null}
                <View style={{ flex: 1 }} />
                <Button title="Cancel" variant="secondary" size="sm" onPress={resetForm} />
                <Button
                  title={editing ? 'Save changes' : 'Create type'}
                  size="sm"
                  loading={create.isPending || patch.isPending}
                  disabled={!canSubmit}
                  onPress={() => {
                    if (mode === 'new') {
                      create.mutate();
                    } else if (editingSlug) {
                      patch.mutate({
                        slug: editingSlug,
                        body: { name, emoji, color, active },
                      });
                    }
                  }}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {isLoading ? <ActivityIndicator color={COLORS.primary} /> : null}

      {(data ?? []).map((category) => (
        <View key={category.slug} style={styles.typeCard}>
          <View style={[styles.typeEmoji, { backgroundColor: `${category.color}16` }]}>
            <Text style={{ fontSize: 21 }}>{category.emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.typeName}>{category.name}</Text>
            <Text style={styles.typeMeta}>
              {category.slug} · {category.color}
            </Text>
          </View>
          <View style={[styles.activePill, !category.active && styles.hiddenPill]}>
            <Text style={[styles.activePillText, !category.active && styles.hiddenPillText]}>
              {category.active ? 'Visible' : 'Hidden'}
            </Text>
          </View>
          <Pressable
            onPress={() => startEdit(category)}
            style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.6 }]}
            accessibilityLabel={`Edit ${category.name}`}
          >
            <Ionicons name="create-outline" size={17} color={COLORS.text} />
          </Pressable>
          <Switch
            value={category.active}
            onValueChange={(value) => toggle.mutate({ slug: category.slug, active: value })}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor="#FFFFFF"
          />
        </View>
      ))}
    </ScrollView>
  );
}

/* --------------------------------- People --------------------------------- */

function PeopleTab() {
  const queryClient = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const { data: me } = useMe();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<AdminUser[]>('/api/admin/users'),
  });

  const setRole = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      api(`/api/admin/users/${id}`, { method: 'PATCH', json: { isAdmin } }),
    onSuccess: (_data, vars) => {
      setNotice(null);
      toast({
        tone: 'success',
        title: vars.isAdmin ? 'Moderator access granted' : 'Moderator access removed',
        message: vars.isAdmin
          ? 'They can now open the admin tools.'
          : 'They keep their reports; only admin tools are gone.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const setDisabled = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      api(`/api/admin/users/${id}`, { method: 'PATCH', json: { disabled } }),
    onSuccess: (_data, vars) => {
      setNotice(null);
      toast({
        tone: 'success',
        title: vars.disabled ? 'Account disabled' : 'Account re-enabled',
        message: vars.disabled
          ? 'Their sessions are revoked and they cannot sign in until you re-enable them.'
          : 'They can sign in again and keep their previous reports.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api(`/api/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setNotice(null);
      toast({
        tone: 'success',
        title: 'Account deleted',
        message: 'Their sightings and photos are gone; bins they added stay on the map.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-bins'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (err) => setNotice({ tone: 'error', text: err.message }),
  });

  const users = (data ?? []).filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
  });

  return (
    <FlatList
      data={users}
      keyExtractor={(user) => user.id}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>People</Text>
            <Text style={styles.sectionSub}>
              {data?.length ?? 0} members · promote trusted contributors.
            </Text>
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={17} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name or email"
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>
          {notice ? (
            <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={[styles.muted, styles.emptyWrap]}>
          {isLoading ? 'Loading members…' : 'No members match.'}
        </Text>
      }
      renderItem={({ item }) => {
        const isAdmin = item.role === 'admin';
        const disabled = Boolean(item.disabledAt);
        const isSelf = me?.user.email.toLowerCase() === item.email.toLowerCase();
        const busy = setRole.isPending || setDisabled.isPending || deleteUser.isPending;
        return (
          <View style={[styles.userCard, disabled && { opacity: 0.74 }]}>
            <View style={styles.userTop}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{initials(item.name || item.email)}</Text>
              </View>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text style={styles.userName} numberOfLines={1}>
                  {item.name || 'Member'}
                  {isSelf ? ' (you)' : ''}
                </Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
              <View style={[styles.activePill, !isAdmin && styles.hiddenPill]}>
                <Text style={[styles.activePillText, !isAdmin && styles.hiddenPillText]}>
                  {isAdmin ? 'Admin' : 'Member'}
                </Text>
              </View>
              {disabled ? (
                <View style={styles.disabledPill}>
                  <Text style={styles.disabledPillText}>Disabled</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.userActions}>
              <Button
                title={isAdmin ? 'Remove admin' : 'Make admin'}
                size="sm"
                variant={isAdmin ? 'secondary' : 'primary'}
                disabled={isSelf || busy}
                onPress={() => {
                  if (isAdmin) {
                    confirm({
                      tone: 'warning',
                      title: `Remove ${item.name || item.email}?`,
                      message: 'They will immediately lose access to the admin tools.',
                      confirmLabel: 'Remove access',
                      cancelLabel: 'Keep admin',
                      destructive: true,
                      onConfirm: () => setRole.mutate({ id: item.id, isAdmin: false }),
                    });
                  } else {
                    setRole.mutate({ id: item.id, isAdmin: true });
                  }
                }}
              />
              <Button
                title={disabled ? 'Enable' : 'Disable'}
                size="sm"
                variant="secondary"
                disabled={isSelf || busy}
                onPress={() => {
                  if (!disabled) {
                    confirm({
                      tone: 'warning',
                      title: `Disable ${item.name || item.email}?`,
                      message:
                        'They are signed out everywhere and cannot sign in again until you re-enable the account. Their sightings stay on the map.',
                      confirmLabel: 'Disable account',
                      cancelLabel: 'Keep active',
                      destructive: true,
                      onConfirm: () => setDisabled.mutate({ id: item.id, disabled: true }),
                    });
                  } else {
                    setDisabled.mutate({ id: item.id, disabled: false });
                  }
                }}
              />
              <Pressable
                onPress={() =>
                  confirm({
                    tone: 'warning',
                    title: `Delete ${item.name || item.email}?`,
                    message:
                      'This permanently deletes the account, its points, its sightings and its photos. Bins they added stay on the map. This cannot be undone.',
                    confirmLabel: 'Delete forever',
                    cancelLabel: 'Cancel',
                    destructive: true,
                    onConfirm: () => deleteUser.mutate(item.id),
                  })
                }
                disabled={isSelf || busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name || item.email}`}
                style={({ pressed }) => [
                  styles.userDelete,
                  (isSelf || busy) && { opacity: 0.4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

/* -------------------------------- Geofence -------------------------------- */

function GeofenceTab() {
  const queryClient = useQueryClient();
  const { toast, showDialog, confirm } = useFeedback();
  const [notice, setNotice] = useState<NoticeState>(null);
  const [polygons, setPolygons] = useState<CampusPoint[][] | null>(null);
  const [selectedRing, setSelectedRing] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [focus, setFocus] = useState<CampusPoint | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [basemap, setBasemap] = useState<'streets' | 'satellite'>(
    Platform.OS === 'web' ? 'satellite' : 'streets',
  );
  const lastMarkerPress = useRef(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-campus'],
    queryFn: () => api<CampusResponse>('/api/admin/campus'),
  });

  const serverPolygons = useMemo<CampusPoint[][]>(() => {
    if (data?.campusPolygons?.length) return data.campusPolygons;
    if (data?.campusPolygon?.length) return [data.campusPolygon];
    return CAMPUS_POLYGONS;
  }, [data]);
  const editingPolygons = polygons ?? serverPolygons;
  const ringIndex = Math.min(selectedRing, Math.max(0, editingPolygons.length - 1));
  const editing = useMemo(
    () => editingPolygons[ringIndex] ?? [],
    [editingPolygons, ringIndex],
  );

  // The map must not recentre on every added point. The area centre is derived
  // from the saved ring; selecting a vertex temporarily centres on that vertex.
  const areaCenter = useMemo(() => {
    const ring = serverPolygons[ringIndex] ?? [];
    return ring.length >= 3 ? centroid(ring) : CAMPUS_CENTER;
  }, [serverPolygons, ringIndex]);
  const mapCenter = focus ?? areaCenter;

  function setRing(next: CampusPoint[]) {
    setPolygons(editingPolygons.map((ring, index) => (index === ringIndex ? next : ring)));
  }

  const mapPolygons = useMemo(
    () => editingPolygons.filter((ring) => ring.length >= 3),
    [editingPolygons],
  );

  const markers: MapMarker[] = editing.map((point, index) => ({
    id: `pt-${index}`,
    latitude: point.latitude,
    longitude: point.longitude,
    kind: 'numbered',
    label: String(index + 1),
    color: selectedIndex === index ? COLORS.primary : '#334155',
    selected: selectedIndex === index,
  }));

  const save = useMutation({
    mutationFn: () =>
      api('/api/admin/campus', {
        method: 'PUT',
        json: { campusPolygons: editingPolygons },
      }),
    onSuccess: () => {
      setNotice(null);
      setPolygons(null);
      setSelectedIndex(null);
      setFocus(null);
      setMoveMode(false);
      setDrawMode(false);
      queryClient.invalidateQueries({ queryKey: ['admin-campus'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
      void refetch();
      showDialog({
        tone: 'success',
        title: 'Geofence saved',
        message:
          'Bins, the add-bin form and the public map now use these exact boundaries. No deploy needed.',
        confirmLabel: 'Great',
      });
    },
    onError: (err) => {
      setNotice({ tone: 'error', text: err.message });
      toast({ tone: 'error', title: 'Could not save the geofence', message: err.message });
    },
  });

  function updatePoint(index: number, point: CampusPoint) {
    setRing(editing.map((p, i) => (i === index ? point : p)));
    setFocus(point);
    setMoveMode(false);
  }

  function selectPoint(index: number) {
    const point = editing[index];
    if (!point) return;
    setSelectedIndex(index);
    setFocus(point);
    setMoveMode(false);
  }

  function onMapPress(lat: number, lng: number) {
    // Ignore the map event that can accompany a native marker press.
    if (Date.now() - lastMarkerPress.current < 350) return;
    setNotice(null);
    if (moveMode && selectedIndex !== null) {
      updatePoint(selectedIndex, { latitude: lat, longitude: lng });
      toast({ tone: 'success', title: `Point ${selectedIndex + 1} moved` });
      return;
    }
    if (!drawMode) {
      // Browsing the map must never mutate the boundary by accident.
      setSelectedIndex(null);
      return;
    }
    if (editing.length >= 128) {
      setNotice({ tone: 'error', text: 'A boundary ring can have at most 128 points.' });
      return;
    }
    setRing([...editing, { latitude: lat, longitude: lng }]);
    setSelectedIndex(editing.length);
  }

  function addArea() {
    if (editingPolygons.length >= 8) {
      setNotice({ tone: 'error', text: 'The campus can have at most 8 separate areas.' });
      return;
    }
    setPolygons([...editingPolygons, []]);
    setSelectedRing(editingPolygons.length);
    setSelectedIndex(null);
    setDrawMode(true);
    setMoveMode(false);
    setNotice({
      tone: 'info',
      text: 'New area started. Tap the map at least three times to outline it.',
    });
  }

  function removeArea() {
    if (editingPolygons.length <= 1) {
      setNotice({ tone: 'error', text: 'Keep at least one campus area.' });
      return;
    }
    confirm({
      tone: 'warning',
      title: 'Delete this area?',
      message: `Area ${ringIndex + 1} will be removed once you save the geofence.`,
      confirmLabel: 'Delete area',
      cancelLabel: 'Keep it',
      destructive: true,
      onConfirm: () => {
        const next = editingPolygons.filter((_, index) => index !== ringIndex);
        setPolygons(next);
        setSelectedRing(Math.max(0, ringIndex - 1));
        setSelectedIndex(null);
        setFocus(null);
        setDrawMode(false);
        setMoveMode(false);
        toast({ tone: 'info', title: 'Area removed', message: 'Save the geofence to apply it.' });
      },
    });
  }

  function removePoint(index: number) {
    const point = editing[index];
    if (!point) return;
    confirm({
      tone: 'warning',
      title: `Delete point ${index + 1}?`,
      message: `Point ${index + 1} at ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(
        5,
      )} will be removed from area ${ringIndex + 1}. The outline closes around the remaining points.`,
      confirmLabel: 'Delete point',
      cancelLabel: 'Keep it',
      destructive: true,
      onConfirm: () => {
        setRing(editing.filter((_, i) => i !== index));
        setSelectedIndex((current) => {
          if (current === null) return null;
          if (current === index) return null;
          return current > index ? current - 1 : current;
        });
        setFocus(null);
        setMoveMode(false);
        toast({ tone: 'info', title: `Point ${index + 1} removed`, message: 'Save the geofence to apply it.' });
      },
    });
  }

  function removeSelected() {
    if (selectedIndex === null) return;
    removePoint(selectedIndex);
  }

  function undo() {
    if (editing.length === 0) return;
    setRing(editing.slice(0, -1));
    setSelectedIndex(null);
    setMoveMode(false);
  }

  async function addCurrentLocation() {
    setNotice(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNotice({ tone: 'error', text: 'Location permission is off.' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setRing([...editing, point]);
      setSelectedIndex(editing.length);
      setFocus(point);
    } catch {
      setNotice({ tone: 'error', text: 'Could not get your location.' });
    }
  }

  const selected = selectedIndex !== null ? editing[selectedIndex] : null;
  const validGeofence =
    editingPolygons.length > 0 && editingPolygons.every((ring) => ring.length >= 3);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.listHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Campus geofence</Text>
          <Text style={styles.sectionSub}>
            The outline is a visual reference for the campus edge. Every numbered corner is listed
            below so you can identify it, zoom to it, and delete it before saving. Bins can still be
            placed anywhere — inside or outside the outline.
          </Text>
        </View>
        <View style={styles.pointBadge}>
          <Text style={styles.pointBadgeText}>
            {editingPolygons.length} area{editingPolygons.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <View style={styles.geoTip}>
        <Ionicons name="bulb-outline" size={16} color={COLORS.info} />
        <Text style={styles.geoTipText}>
          Tap “Draw corners”, then place points around the campus on the map. Numbers on the map match
          the numbered list below — tap any point to see exactly which corner it is before deleting
          it. You never need to type coordinates.
        </Text>
      </View>

      {notice ? (
        <Notice tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />
      ) : null}

      <Segmented
        items={editingPolygons.map((ring, index) => ({
          key: String(index),
          label:
            index === 0
              ? `Main campus · ${ring.length}`
              : index === 1
                ? `Medical north · ${ring.length}`
                : index === 2
                  ? `Medical south · ${ring.length}`
                  : `Area ${index + 1} · ${ring.length}`,
        }))}
        value={String(ringIndex)}
        onChange={(key) => {
          setSelectedRing(Number(key));
          setSelectedIndex(null);
          setFocus(null);
          setMoveMode(false);
        }}
        scrollable
      />

      <View style={styles.geoMapCard}>
        <MapView
          markers={markers}
          center={mapCenter}
          zoom={focus ? 17 : 15}
          polygons={mapPolygons}
          basemap={basemap}
          onPressMap={onMapPress}
          onPressMarker={(id) => {
            lastMarkerPress.current = Date.now();
            const index = Number(id.replace('pt-', ''));
            if (Number.isInteger(index)) selectPoint(index);
          }}
          style={styles.geoMap}
        />
        <View style={styles.geoMapTop}>
          <Pressable
            onPress={() => {
              setDrawMode((value) => !value);
              setMoveMode(false);
              setNotice(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: drawMode }}
            style={({ pressed }) => [
              styles.drawToggle,
              drawMode && styles.drawToggleActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name={drawMode ? 'pencil' : 'pencil-outline'}
              size={15}
              color={drawMode ? '#FFFFFF' : COLORS.primary}
            />
            <Text style={[styles.drawToggleText, drawMode && { color: '#FFFFFF' }]}>
              {drawMode ? 'Drawing' : 'Draw corners'}
            </Text>
          </Pressable>
          <Segmented
            items={[
              { key: 'streets' as const, label: 'Map' },
              { key: 'satellite' as const, label: 'Satellite' },
            ]}
            value={basemap}
            onChange={setBasemap}
            tone="surface"
          />
        </View>
        <View style={styles.geoHint}>
          <Ionicons
            name={moveMode ? 'move-outline' : drawMode ? 'add-circle-outline' : 'hand-left-outline'}
            size={14}
            color={COLORS.primary}
          />
          <Text style={styles.geoHintText}>
            {moveMode
              ? 'Tap the map to move the selected point.'
              : drawMode
                ? 'Tap to place the next corner · tap a number to select a point.'
                : 'Tap a number on the map or in the list below to identify that corner.'}
          </Text>
        </View>
      </View>

      <Card padded={false}>
        <View style={styles.vertexHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              Area {ringIndex + 1} corners · {editing.length} point{editing.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.vertexHint}>
              Tap a row to highlight that corner on the map. The last point closes back to point 1.
            </Text>
          </View>
          {editing.length > 0 ? (
            <View style={styles.pointBadge}>
              <Text style={styles.pointBadgeText}>1 → {editing.length} → 1</Text>
            </View>
          ) : null}
        </View>
        {editing.length === 0 ? (
          <View style={styles.vertexEmpty}>
            <Ionicons name="pencil-outline" size={18} color={COLORS.textMuted} />
            <Text style={styles.vertexEmptyText}>
              No corners yet. Switch on Draw corners and tap the map, or use “Add an area”.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.vertexScroll}
            contentContainerStyle={{ paddingBottom: 4 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {editing.map((point, index) => {
              const active = selectedIndex === index;
              return (
                <Pressable
                  key={`vertex-${index}`}
                  onPress={() => selectPoint(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select point ${index + 1}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.vertexRow,
                    active && styles.vertexRowActive,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <View style={[styles.vertexDot, active && styles.vertexDotActive]}>
                    <Text style={styles.vertexDotText}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vertexTitle}>
                      Point {index + 1}
                      {index === 0 ? ' · start' : index === editing.length - 1 ? ' · end' : ''}
                    </Text>
                    <Text style={styles.vertexCoords}>
                      {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      removePoint(index);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete point ${index + 1}`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.vertexDelete, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Card>

      {selected ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              Point {selectedIndex! + 1} of {editing.length} · Area {ringIndex + 1}
            </Text>
            <Pressable
              onPress={() => {
                setSelectedIndex(null);
                setFocus(null);
              }}
            >
              <Text style={styles.textLink}>Deselect</Text>
            </Pressable>
          </View>
          <Text style={styles.coords}>
            {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
          </Text>
          <View style={styles.formActions}>
            <Button
              title={moveMode ? 'Cancel move' : 'Move point'}
              icon="move-outline"
              size="sm"
              variant={moveMode ? 'secondary' : 'primary'}
              onPress={() => setMoveMode((v) => !v)}
              style={{ flex: 1 }}
            />
            <Button
              title="Remove point"
              icon="trash-outline"
              size="sm"
              variant="danger"
              onPress={removeSelected}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : null}

      <View style={styles.geoActions}>
        <Button
          title="Undo point"
          icon="arrow-undo-outline"
          size="sm"
          variant="secondary"
          onPress={undo}
        />
        <Button
          title="Use my location"
          icon="locate-outline"
          size="sm"
          variant="secondary"
          onPress={() => void addCurrentLocation()}
        />
        <Button
          title="Add an area"
          icon="add-outline"
          size="sm"
          variant="secondary"
          onPress={addArea}
        />
        <Button
          title="Delete area"
          icon="trash-outline"
          size="sm"
          variant="secondary"
          onPress={removeArea}
        />
        <Button
          title="Reset to real campus"
          icon="refresh-outline"
          size="sm"
          variant="secondary"
          onPress={() => {
            setPolygons(data?.defaultPolygons ?? CAMPUS_POLYGONS);
            setSelectedRing(0);
            setSelectedIndex(null);
            setFocus(null);
            setDrawMode(false);
            setMoveMode(false);
            setNotice({
              tone: 'info',
              text: 'The accurate OpenStreetMap campus boundary is loaded. Press Save to apply it.',
            });
          }}
        />
      </View>

      <View style={styles.geoSaveRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.geoSaveTitle}>
            {!validGeofence ? 'Every area needs at least 3 points' : 'Ready to save'}
          </Text>
          <Text style={styles.geoSaveSub}>
            The last point connects back to the first automatically. Changes apply immediately
            after saving.
          </Text>
        </View>
        <Button
          title="Save geofence"
          icon="checkmark"
          loading={save.isPending}
          disabled={!validGeofence}
          onPress={() =>
            confirm({
              tone: 'info',
              title: 'Apply this geofence?',
              message: `${editingPolygons.length} area${
                editingPolygons.length === 1 ? '' : 's'
              } with ${editingPolygons.reduce(
                (total, ring) => total + ring.length,
                0,
              )} points will become the campus outline. Bins and reports work anywhere, so this only changes the outline shown on maps.`,
              confirmLabel: 'Save & apply',
              cancelLabel: 'Keep editing',
              onConfirm: () => save.mutate(),
            })
          }
        />
      </View>

      {isLoading ? <ActivityIndicator color={COLORS.primary} /> : null}
    </ScrollView>
  );
}

function centroid(points: CampusPoint[]): CampusPoint {
  if (points.length === 0) return CAMPUS_CENTER;
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.latitude, lng: acc.lng + p.longitude }),
    { lat: 0, lng: 0 },
  );
  return { latitude: sum.lat / points.length, longitude: sum.lng / points.length };
}

/* -------------------------------- Bin modal -------------------------------- */

function BinOverlay({
  binId,
  onClose,
  desktop,
}: {
  binId: string;
  onClose: () => void;
  desktop: boolean;
}) {
  return (
    <Modal visible transparent animationType={desktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={styles.overlayRoot}>
        <Pressable style={styles.overlayBackdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={desktop ? styles.overlayPanel : styles.overlaySheet}>
          <BinDetails binId={binId} onClose={onClose} variant={desktop ? 'panel' : 'sheet'} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 22 },

  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  adminEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: COLORS.primary,
  },
  adminSectionTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.7,
    marginTop: 1,
  },
  headerGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerGhostText: { fontSize: 12.5, fontWeight: '700', color: COLORS.text },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 11,
    borderRadius: 19,
    backgroundColor: COLORS.primarySoft,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },

  menuPanel: { flex: 1, paddingHorizontal: 18, gap: 10 },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
    paddingBottom: 6,
  },
  menuTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  menuSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  menuClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginTop: 8,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 9,
    borderRadius: RADIUS.md,
  },
  menuItemActive: { backgroundColor: COLORS.primarySoft },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemIconActive: { backgroundColor: 'rgba(14,124,90,0.12)' },
  menuItemLabel: { fontSize: 14.5, fontWeight: '600', color: COLORS.text },
  menuItemLabelActive: { fontWeight: '800' },
  menuItemHint: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  menuActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  menuFootnote: {
    fontSize: 11.5,
    lineHeight: 16,
    color: COLORS.textMuted,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  body: { flex: 1, width: '100%', maxWidth: 1180, alignSelf: 'center' },
  tabWrap: { paddingHorizontal: 22, paddingBottom: 10 },
  scrollContent: { padding: 20, paddingBottom: 120, gap: 12 },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },

  deniedCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    ...SHADOW.lg,
  },
  deniedIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedTitle: { fontSize: 23, fontWeight: '800', color: COLORS.text },
  deniedText: { fontSize: 13.5, lineHeight: 20, color: COLORS.textMuted, textAlign: 'center' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  statCard: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 140,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 4,
    ...SHADOW.sm,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  statLabel: { fontSize: 11.5, color: COLORS.textMuted, fontWeight: '600' },
  statArrow: { position: 'absolute', top: 12, right: 12 },

  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  cardMeta: { fontSize: 11.5, color: COLORS.textMuted },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardHeaderPad: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  breakdownBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: COLORS.border,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, color: COLORS.textMuted, fontWeight: '600' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  recentEmoji: { fontSize: 20 },
  recentTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  recentMeta: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  listHeader: { gap: 10, paddingBottom: 4 },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  sectionSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  textLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 13,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, paddingVertical: 10 },

  binCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  binRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  binEmojiWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  binEmoji: { fontSize: 20 },
  binTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, textTransform: 'capitalize' },
  binMeta: { fontSize: 11.5, color: COLORS.textMuted },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 13,
    paddingBottom: 11,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statusChipText: { fontSize: 10.5, fontWeight: '700', color: COLORS.textMuted },
  statusChipTextActive: { color: '#FFFFFF' },

  sectionHeader: { gap: 2 },
  emptyWrap: { paddingVertical: 40, alignItems: 'center' },
  muted: { fontSize: 13, color: COLORS.textMuted },

  formRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 2 },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: COLORS.text },
  hexInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xs,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: COLORS.text,
    minWidth: 86,
    backgroundColor: COLORS.surface,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  switchSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  formActions: { flexDirection: 'row', gap: 8 },
  headerButton: { flexShrink: 0 },

  editorRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  editorBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
  },
  editorCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  editorContent: { padding: 18, gap: 13 },
  editorHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  editorTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, letterSpacing: -0.4 },
  editorSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  editorClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  deletePanel: {
    gap: 7,
    padding: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(217,45,32,0.18)',
  },
  deletePanelText: { fontSize: 12, lineHeight: 17, color: COLORS.danger },
  deletePanelActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 11,
    ...SHADOW.sm,
  },
  typeEmoji: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  typeName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  typeMeta: { fontSize: 11.5, color: COLORS.textMuted },
  activePill: {
    backgroundColor: COLORS.successSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hiddenPill: { backgroundColor: COLORS.surfaceAlt },
  activePillText: { fontSize: 10.5, fontWeight: '700', color: COLORS.success },
  hiddenPillText: { color: COLORS.textMuted },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  userCard: {
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 11,
    ...SHADOW.sm,
  },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  userDelete: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  disabledPill: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  disabledPillText: { fontSize: 10.5, fontWeight: '700', color: COLORS.textMuted },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },
  userName: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: 11.5, color: COLORS.textMuted },

  pointBadge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pointBadgeText: { fontSize: 11.5, fontWeight: '800', color: COLORS.primary },
  geoMapCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...SHADOW.sm,
  },
  geoMap: { height: 410, width: '100%' },
  geoMapTop: {
    position: 'absolute',
    top: 10,
    right: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  drawToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.md,
  },
  drawToggleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  drawToggleText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  geoTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.infoSoft,
    borderRadius: RADIUS.md,
    padding: 12,
  },
  geoTipText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.text },
  geoHint: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    ...SHADOW.sm,
  },
  geoHintText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: COLORS.primary },
  coords: { fontSize: 12, color: COLORS.textMuted, fontVariant: ['tabular-nums'] },
  vertexHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  vertexHint: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted, marginTop: 2 },
  vertexScroll: { maxHeight: 260 },
  vertexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  vertexRowActive: { backgroundColor: COLORS.primarySoft },
  vertexDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertexDotActive: { backgroundColor: COLORS.primary },
  vertexDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  vertexTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.text },
  vertexCoords: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  vertexDelete: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerSoft,
  },
  vertexEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 14,
  },
  vertexEmptyText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.textMuted },
  geoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  geoSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 13,
  },
  geoSaveTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  geoSaveSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  overlayRoot: { flex: 1 },
  overlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
  },
  overlayPanel: {
    position: 'absolute',
    top: 16,
    right: 16,
    bottom: 16,
    width: 430,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    ...SHADOW.lg,
  },
  overlaySheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: '78%',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    ...SHADOW.lg,
  },
});
