/**
 * AppChrome — shared app furniture for phones, tablets and desktop web.
 *
 * Desktop (>=1024px web): a persistent navigation sidebar. The content fills
 * the remaining width, so map/filters/panels behave like a real desktop app.
 * Mobile/tablet: a floating, safe-area-aware tab bar. The drawer is still
 * available from the map for contact, account and secondary actions.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeaderboardCard } from '@/components/LeaderboardCard';
import Sidebar from '@/components/Sidebar';
import { UpdateBanner } from '@/components/updates/UpdateBanner';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { SocialLinks } from '@/components/ui/SocialLinks';
import { useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import { registerPushToken } from '@/lib/register-push';
import { initials, RADIUS, SHADOW } from '@/lib/theme';
import { useHydrated } from '@/lib/use-hydrated';
import { useMe } from '@/lib/use-me';

const WIDE_BREAKPOINT = 1024;
export const DESKTOP_SIDEBAR_WIDTH = 268;

/** Full-screen flows: no tab bar and no desktop sidebar. */
const IMMERSIVE_ROUTES = ['/sign-in', '/sign-up', '/report/new'];
const isImmersive = (pathname: string) =>
  IMMERSIVE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

type NavItem = {
  key: string;
  href: Href;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function navItems(isAdmin: boolean): NavItem[] {
  if (isAdmin) {
    return [
      { key: 'map', href: '/', label: 'Map', icon: 'map-outline' },
      { key: 'review', href: '/admin/review', label: 'Review', icon: 'time-outline' },
      { key: 'profile', href: '/stats', label: 'Profile', icon: 'person-circle-outline' },
      { key: 'admin', href: '/admin', label: 'Admin', icon: 'shield-checkmark-outline' },
    ];
  }
  return [
    { key: 'map', href: '/', label: 'Map', icon: 'map-outline' },
    { key: 'alerts', href: '/alerts', label: 'Alerts', icon: 'notifications-outline' },
    { key: 'stats', href: '/stats', label: 'Stats', icon: 'stats-chart-outline' },
  ];
}

function active(pathname: string, item: NavItem): boolean {
  if (item.key === 'map') return pathname === '/' || pathname === '/map';
  if (item.key === 'review') return pathname === '/admin/review';
  if (item.key === 'admin') return pathname === '/admin';
  const href = String(item.href);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  const pathname = usePathname() ?? '/';
  const desktop = hydrated && Platform.OS === 'web' && width >= WIDE_BREAKPOINT;
  const { data: session } = useSession();

  /*
   * Register for push the moment anyone signs in, from any screen — not only
   * when they happen to open Alerts or Profile. Best-effort and idempotent.
   */
  useEffect(() => {
    if (session?.user) void registerPushToken();
  }, [session?.user]);

  if (isImmersive(pathname)) {
    return <View style={styles.shell}>{children}</View>;
  }

  if (desktop) {
    return (
      <View style={styles.desktopShell}>
        <DesktopSidebar />
        <View style={styles.desktopContent}>
          <UpdateBanner />
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      {children}
      <UpdateBanner />
      <BottomNav />
    </View>
  );
}

/* ------------------------------ Desktop rail ------------------------------ */

export function DesktopSidebar() {
  const pathname = usePathname() ?? '/';
  const { data: session } = useSession();
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const signedIn = Boolean(session?.user);
  const items = navItems(isAdmin);
  const name = me?.user.name ?? session?.user?.name ?? '';
  const email = me?.user.email ?? session?.user?.email ?? '';

  return (
    <View style={styles.rail}>
      <Pressable
        onPress={() => router.navigate('/')}
        style={styles.brand}
        accessibilityRole="link"
        accessibilityLabel="EMU Bin Tracker home"
      >
        <BrandMark size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandName}>EMU Bin Tracker</Text>
          <Text style={styles.brandSub}>Sustainability map</Text>
        </View>
      </Pressable>

      <Button
        title="Add a bin"
        icon="add"
        onPress={() => router.push(signedIn ? '/report/new' : '/sign-in')}
        style={styles.railCta}
      />

      <ScrollView
        style={styles.railScroll}
        contentContainerStyle={styles.railScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.railNav}>
          <Text style={styles.railSection}>Navigate</Text>
          {items.map((item) => {
            const on = active(pathname, item);
            return (
              <Pressable
                key={item.key}
                onPress={() =>
                  router.navigate(signedIn || item.key === 'map' ? item.href : '/sign-in')
                }
                accessibilityRole="link"
                style={({ pressed }) => [
                  styles.railItem,
                  on && styles.railItemActive,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={[styles.railIcon, on && styles.railIconActive]}>
                  <Ionicons
                    name={on ? item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : item.icon}
                    size={19}
                    color={on ? COLORS.primary : COLORS.textMuted}
                  />
                </View>
                <Text style={[styles.railLabel, on && styles.railLabelActive]}>{item.label}</Text>
                {on ? <View style={styles.railDot} /> : null}
              </Pressable>
            );
          })}
        </View>

        <LeaderboardCard compact />
      </ScrollView>

      <View style={styles.railFooter}>
        <Pressable
          onPress={() => router.navigate('/download')}
          style={({ pressed }) => [styles.railDownload, pressed && { opacity: 0.7 }]}
          accessibilityRole="link"
        >
          <Ionicons name="download-outline" size={17} color={COLORS.primary} />
          <Text style={styles.railDownloadText}>Get the app</Text>
        </Pressable>
        <SocialLinks compact label="Community" />
        <Pressable
          onPress={() => router.navigate(session?.user ? '/stats' : '/sign-in')}
          style={({ pressed }) => [styles.accountCard, pressed && { opacity: 0.8 }]}
          accessibilityRole="link"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {session?.user ? initials(name || email) : '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName} numberOfLines={1}>
              {session?.user ? name || 'Member' : 'Guest'}
            </Text>
            <Text style={styles.accountEmail} numberOfLines={1}>
              {session?.user ? email : 'Sign in to contribute'}
            </Text>
          </View>
          <Ionicons
            name={session?.user ? 'chevron-forward' : 'log-in-outline'}
            size={16}
            color={COLORS.textMuted}
          />
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------- Mobile nav ------------------------------- */

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();
  const { data: session } = useSession();
  const isAdmin = me?.isAdmin === true;
  const signedIn = Boolean(session?.user);

  const left: NavItem[] = isAdmin
    ? [
        { key: 'map', href: '/', label: 'Map', icon: 'map-outline' },
        { key: 'review', href: '/admin/review', label: 'Review', icon: 'time-outline' },
      ]
    : [
        { key: 'map', href: '/', label: 'Map', icon: 'map-outline' },
        { key: 'alerts', href: '/alerts', label: 'Alerts', icon: 'notifications-outline' },
      ];
  const right: NavItem[] = isAdmin
    ? [
        { key: 'profile', href: '/stats', label: 'Profile', icon: 'person-circle-outline' },
        { key: 'admin', href: '/admin', label: 'Admin', icon: 'shield-checkmark-outline' },
      ]
    : [{ key: 'stats', href: '/stats', label: 'Stats', icon: 'stats-chart-outline' }];

  const renderItem = (item: NavItem) => {
    const on = active(pathname, item);
    return (
      <Pressable
        key={item.key}
        onPress={() => router.navigate(signedIn || item.key === 'map' ? item.href : '/sign-in')}
        accessibilityRole="link"
        accessibilityState={{ selected: on }}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.65 }]}
      >
        <View style={[styles.tabIcon, on && styles.tabIconActive]}>
          <Ionicons
            name={on ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon}
            size={21}
            color={on ? COLORS.primary : COLORS.textMuted}
          />
        </View>
        <Text style={[styles.tabLabel, on && styles.tabLabelActive]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabBarWrap, { bottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.tabBar}>
        {left.map(renderItem)}
        <Pressable
          onPress={() => router.push(signedIn ? '/report/new' : '/sign-in')}
          accessibilityRole="button"
          accessibilityLabel="Add a bin"
          style={({ pressed }) => [styles.reportTab, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.reportFab}>
            <Ionicons name="add" size={27} color="#FFFFFF" />
          </View>
          <Text style={styles.reportLabel}>Add</Text>
        </Pressable>
        {right.map(renderItem)}
      </View>
    </View>
  );
}

/** Floating menu button for map overlay headers. */
export function MenuButton({ tone = 'glass' }: { tone?: 'glass' | 'solid' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.menuButton,
          tone === 'solid' && { backgroundColor: COLORS.surface },
          pressed && { opacity: 0.75 },
        ]}
      >
        <Ionicons name="menu" size={22} color={COLORS.text} />
      </Pressable>
      <Sidebar isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: COLORS.bg },
  desktopShell: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.bg },
  desktopContent: { flex: 1, minWidth: 0 },

  rail: {
    width: DESKTOP_SIDEBAR_WIDTH,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 4 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  brandName: { fontSize: 15.5, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  brandSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  railCta: { borderRadius: RADIUS.sm },
  railScroll: { flex: 1 },
  railScrollContent: { gap: 14, paddingBottom: 10 },
  railNav: { gap: 3 },
  railSection: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingBottom: 5,
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
  },
  railItemActive: { backgroundColor: COLORS.primarySoft },
  railIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railIconActive: { backgroundColor: 'rgba(14,124,90,0.10)' },
  railLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  railLabelActive: { color: COLORS.text, fontWeight: '700' },
  railDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  railFooter: { gap: 14 },
  railDownload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primarySoft,
  },
  railDownloadText: { fontSize: 13.5, fontWeight: '700', color: COLORS.primary },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  accountName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  accountEmail: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },

  tabBarWrap: { position: 'absolute', left: 12, right: 12, zIndex: 50, elevation: 40 },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    paddingHorizontal: 6,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.lg,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6 },
  tabIcon: {
    width: 38,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: { backgroundColor: COLORS.primarySoft },
  tabLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },
  reportTab: { flex: 1.1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 4 },
  reportFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
    ...SHADOW.md,
  },
  reportLabel: { fontSize: 9.5, fontWeight: '700', color: COLORS.primary, marginTop: 1 },

  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.md,
  },
});
