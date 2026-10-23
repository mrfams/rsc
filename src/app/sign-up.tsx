import { Redirect } from 'expo-router';

import { siteMetadata } from '@/lib/site-metadata';

export function generateMetadata() {
  return siteMetadata({ title: 'Create account', path: '/sign-up', noIndex: true });
}

/** Legacy route: auth is one screen with Sign in / Create account tabs. */
export default function SignUpScreen() {
  return <Redirect href={{ pathname: '/sign-in', params: { mode: 'signup' } }} />;
}
