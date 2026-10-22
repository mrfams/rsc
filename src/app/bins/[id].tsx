import { useLocalSearchParams, useRouter } from 'expo-router';
import type { GenerateMetadataFunction } from 'expo-router/server';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinDetails } from '@/components/bins/BinDetails';
import { COLORS } from '@/lib/constants';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW } from '@/lib/theme';

export const generateMetadata: GenerateMetadataFunction = (_request, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return siteMetadata({
    title: 'Recycling bin',
    path: `/bins/${id}`,
    description:
      'See this recycling bin on the EMU campus map, including its type, status, photos, and recent community sightings.',
  });
};

export default function BinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <BinDetails
            binId={id ?? ''}
            variant="page"
            onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 760,
    height: 760,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.lg,
  },
});
