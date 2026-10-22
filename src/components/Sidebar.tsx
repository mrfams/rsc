import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeaderboardCard } from '@/components/LeaderboardCard';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { SocialLinks } from '@/components/ui/SocialLinks';
import { useFeedback } from '@/components/ui/Feedback';
import { authClient, useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import { initials, RADIUS } from '@/lib/theme';
import { useMe } from '@/lib/use-me';

type DrawerItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  hint?: string;
};

/** Routes that stay open for guests — the map, the stats page and the download page. */
const PUBLIC_ROUTES = new Set(['/', '/stats', '/download']);

function drawerItems(isAdmin: boolean, signedIn: boolean): DrawerItem[] {
  const items: DrawerItem[] = [
    { key: 'map', label: 'Campus map', icon: 'map-outline', href: '/', hint: 'Find and add bins' },
  ];

  if (signedIn) {
    items.push({
      key: 'review',
      label: 'Review bins',
      icon: 'time-outline',
      href: isAdmin ? '/admin/review' : '/review',
      hint: 'Help confirm what needs a second look',
    });
  }

  items.push(
    {
      key: 'stats',
      label: 'Stats & leaderboard',
      icon: 'stats-chart-outline',
      href: '/stats',
      hint: 'Campus leaderboard, points and bins',
    },
    {
      key: 'download',
      label: 'Get the app',
      icon: 'download-outline',
      href: '/download',
      hint: 'Install it on your phone',
    },
  );

  if (signedIn) {
    items.push({
      key: 'alerts',
      label: 'My activity',
      icon: 'notifications-outline',
      href: '/alerts',
      hint: 'Updates on the bins you reported',
    });
  }

  if (isAdmin) {
    items.push({
      key: 'admin',
      label: 'Admin',
      icon: 'shield-checkmark-outline',
      href: '/admin',
      hint: 'Moderation and settings',
    });
  }

  return items;
}

function isActive(pathname: string, item: DrawerItem): boolean {
  if (item.key === 'map') return pathname === '/' || pathname === '/map';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname() ?? '/';
  const { data: session } = useSession();
  const { data: me } = useMe();
  const { showDialog } = useFeedback();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const signedIn = Boolean(session?.user);
  const name = me?.user.name ?? session?.user?.name ?? '';
  const email = me?.user.email ?? session?.user?.email ?? '';
  const items = drawerItems(me?.isAdmin === true, signedIn);

  function go(href: string) {
    onClose();
    if (!signedIn && !PUBLIC_ROUTES.has(href)) {
      router.push('/sign-in');
      return;
    }
    router.navigate(href as never);
  }

  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      onClose();
      router.replace('/');
      showDialog({
        tone: 'success',
        title: 'Signed out',
        message: 'You can still browse the map as a guest.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={isOpen} onClose={onClose} label="app menu">
      <View style={styles.panel}>
        <View style={styles.header}>
          <Pressable onPress={() => go('/')} style={styles.brand} accessibilityRole="link">
            <BrandMark size={40} />
            <View>
              <Text style={styles.brandName}>EMU Bin Tracker</Text>
              <Text style={styles.brandSub}>Sustainability map</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={19} color={COLORS.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Button
            title="Add a bin"
            icon="add"
            onPress={() => {
              onClose();
              router.push(signedIn ? '/report/new' : '/sign-in');
            }}
          />

          <Text style={styles.sectionLabel}>Navigate</Text>
          <View style={styles.nav}>
            {items.map((item) => {
              const on = isActive(pathname, item);
              return (
                <Pressable
                  key={item.key}
                  onPress={() => go(item.href)}
                  accessibilityRole="link"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    styles.item,
                    on && styles.itemActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.itemIcon, on && styles.itemIconActive]}>
                    <Ionicons
                      name={on ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon}
                      size={19}
                      color={on ? COLORS.primary : COLORS.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, on && styles.itemLabelActive]}>
                      {item.label}
                    </Text>
                    {item.hint ? <Text style={styles.itemHint}>{item.hint}</Text> : null}
                  </View>
                  {on ? <View style={styles.activeDot} /> : null}
                </Pressable>
              );
            })}
          </View>

          <LeaderboardCard />

          <View style={styles.social}>
            <SocialLinks label="Community" />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {signedIn ? (
            <>
              <Pressable
                onPress={() => go('/profile')}
                style={({ pressed }) => [styles.account, pressed && { opacity: 0.8 }]}
                accessibilityRole="link"
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(name || email)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {name || 'Member'}
                  </Text>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {email}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
              </Pressable>
              <Button
                title="Sign out"
                variant="secondary"
                icon="log-out-outline"
                size="sm"
                loading={busy}
                onPress={() => void signOut()}
              />
            </>
          ) : (
            <Button
              title="Sign in or create account"
              icon="log-in-outline"
              onPress={() => go('/sign-in')}
            />
          )}
        </View>
      </View>
    </Drawer>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, paddingHorizontal: 18, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 15.5, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  brandSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { gap: 12, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginTop: 8,
    marginLeft: 4,
  },
  nav: { gap: 3 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 9,
    borderRadius: RADIUS.md,
  },
  itemActive: { backgroundColor: COLORS.primarySoft },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  itemIconActive: { backgroundColor: 'rgba(14,124,90,0.12)' },
  itemLabel: { fontSize: 14.5, fontWeight: '600', color: COLORS.text },
  itemLabelActive: { fontWeight: '800' },
  itemHint: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  social: { marginTop: 8, paddingHorizontal: 2 },
  footer: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },
  accountName: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  accountEmail: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
});
