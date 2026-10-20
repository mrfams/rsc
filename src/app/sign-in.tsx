import { useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/auth/AuthScreen';

export default function SignInScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  return <AuthScreen initialMode={params.mode === 'signup' ? 'signup' : 'signin'} />;
}
