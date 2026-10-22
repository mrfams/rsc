import { useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { siteMetadata } from '@/lib/site-metadata';

export function generateMetadata() {
  return siteMetadata({ title: 'Sign in', path: '/sign-in', noIndex: true });
}

export default function SignInScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  return <AuthScreen initialMode={params.mode === 'signup' ? 'signup' : 'signin'} />;
}
