/**
 * AppChrome — shared app furniture for phones, tablets and desktop web:
 *
 * - <AppShell>   renders the routed screen plus a floating bottom navigation
 *                bar on phones and tablets. Hidden on auth/report modals and
 *                on wide desktop web (the hamburger drawer covers those).
 * - <MenuButton> the ☰ button that opens the navigation drawer.
 *
 * The last nav slot is context-aware: admins get "Admin", members get
 * "Profile" (everything is also reachable from the drawer).
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Link, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authClient, useSession } from '@/lib/auth-client';
import { api } from '@/lib/api-client';
import { COLORS } from '@/lib/constants';

type Me = {
  user: { name: string; email: string };
  isAdmin: boolean;
};

/** Routes where the bottom bar would overlap a full-screen modal flow. */
const NAVLESS_ROUTES = ['/sign-in', '/sign-up', '/report/new'];

/** Desktop breakpoint — bottom bar phones/tablets only (web). */
const WIDE_BREAKPOINT = 1024;
const isWideWeb = (width: number) => width >= WIDE_BREAKPOINT;

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

/** Map → Report → My Reports → Alerts → (Admin | Profile). */
function buildNavItems(isAdmin: boolean): NavItem[] {
  return [
    { key: 'map', href: '/', label: 'Map', icon: 'map' },
    { key: 'report', href: '/report/new', label: 'Report', icon: 'add-circle' },
    { key: 'my-reports', href: '/profile', label: 'My Reports', icon: 'document-text' },
    { key: 'alerts', href: '/alerts', label: 'Alerts', icon: 'notifications' },
    isAdmin
      ? { key: 'admin', href: '/admin', label: 'Admin', icon: 'shield' }
      : { key: 'profile', href: '/profile', label: 'Profile', icon: 'person' },
  ];
}

/** Human-friendly menu entries for the drawer. */
const DRAWER_ITEMS: NavItem[] = [
  { key: 'map', href: '/', label: 'Map', icon: 'map' },
  { key: 'report', href: '/report/new', label: 'Report bin', icon: 'add-circle' },
  { key: 'my-reports', href: '/profile', label: 'My reports', icon: 'document-text' },
  { key: 'alerts', href: '/alerts', label: 'Alerts', icon: 'notifications' },
  { key: 'admin', href: '/admin', label: 'Admin', icon: 'shield' },
  { key: 'profile', href: '/profile', label: 'Profile', icon: 'person' },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/';
  // "My reports" and "Profile" share /profile — never force-highlight both.
  if (item.key === 'my-reports' && pathname === '/profile') return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const pathname = usePathname() ?? '/';
  const isModal = NAVLESS_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const showBar = Platform.OS !== 'web' || !isWideWeb(width);

  if (isModal) return <View style={styles.shell}>{children}</View>;

  return (
    <View style={styles.shell}>
      {children}
      {showBar ? <BottomNav /> : null}
    </View>
  );
}

/**
 * Bottom navigation bar for phones and tablets. Overlays content with an
 * elevated translucent background; safe-area padded.
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    retry: false,
  });
  const items = buildNavItems(me?.isAdmin === true);

  return (
    <View style={[styles.navBar, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link key={item.key} href={item.href} asChild>
            <Pressable style={styles.navItem} accessibilityRole="link">
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

/** Floating ☰ button for map overlay headers. */
export function MenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.menuButton} onPress={() => setOpen(true)}>
        <Ionicons name="menu" size={22} color={COLORS.text} />
      </Pressable>
      <NavDrawer visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Left-side navigation drawer (works on native and web via Modal). */
export function NavDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? '/';
  const insets = useSafeAreaInsets();
  const { data: session, isPending } = useSession();
  const { data: me, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    retry: false,
  });
  // Refetch me when the drawer opens so a fresh role upgrade shows Admin.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible && !wasOpen.current) {
      wasOpen.current = true;
      void refetch();
    } else if (!visible && wasOpen.current) {
      wasOpen.current = false;
    }
  }, [visible, refetch]);

  const signedIn = Boolean(session?.user);
  const items = DRAWER_ITEMS.filter((i) => i.key !== 'admin' || me?.isAdmin === true);

  async function signOut() {
    await authClient.signOut();
    // Full reload clears cached role state on every platform.
    if (Platform.OS === 'web') window.location.href = '/';
    else onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerScrim}>
        <Pressable style={styles.drawerScrimTouch} onPress={onClose} accessibilityLabel="Close menu" />
        <View
          style={[
            styles.drawer,
            { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <View style={styles.drawerHeader}>
            <Ionicons name="leaf" size={26} color={COLORS.primary} />
            <View style={styles.drawerHeaderText}>
              <Text style={styles.drawerTitle}>EMU Bin Tracker</Text>
              <Text style={styles.drawerSubtitle}>Report and verify campus bins</Text>
            </View>
          </View>

          <View style={styles.drawerList}>
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link key={item.key} href={item.href} asChild onPress={onClose}>
                  <Pressable style={[styles.drawerItem, active && styles.drawerItemActive]}>
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={active ? COLORS.primary : COLORS.text}
                    />
                    <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>

          <View style={styles.drawerFooter}>
            {isPending ? null : signedIn ? (
              <>
                <Text style={styles.drawerUser} numberOfLines={1}>
                  {session?.user?.email}
                </Text>
                <Pressable style={styles.drawerAction} onPress={signOut}>
                  <Ionicons name="log-out-outline" size={18} color={COLORS.text} />
                  <Text style={styles.drawerActionText}>Sign out</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Link href="/sign-in" asChild onPress={onClose}>
                  <Pressable style={[styles.drawerAction, styles.drawerActionPrimary]}>
                    <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                    <Text style={[styles.drawerActionText, { color: '#FFFFFF' }]}>Sign in</Text>
                  </Pressable>
                </Link>
                <Link href="/sign-up" asChild onPress={onClose}>
                  <Pressable style={styles.drawerAction}>
                    <Ionicons name="person-add-outline" size={18} color={COLORS.text} />
                    <Text style={styles.drawerActionText}>Create account</Text>
                  </Pressable>
                </Link>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: COLORS.bg },
  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 24,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  navLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  navLabelActive: { color: COLORS.primary },
  menuButton: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  drawerScrim: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)' },
  drawerScrimTouch: { flex: 1 },
  drawer: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  drawerHeaderText: { flex: 1 },
  drawerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  drawerSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  drawerList: { flexShrink: 1 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  drawerItemActive: { backgroundColor: COLORS.primarySoft },
  drawerItemText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  drawerItemTextActive: { color: COLORS.primary },
  drawerFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: 10 },
  drawerUser: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  drawerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  drawerActionPrimary: { backgroundColor: COLORS.primary, marginVertical: 2 },
  drawerActionText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
});