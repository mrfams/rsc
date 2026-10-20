import { Redirect } from 'expo-router';

/** Legacy route: auth is one screen with Sign in / Create account tabs. */
export default function SignUpScreen() {
  return <Redirect href={{ pathname: '/sign-in', params: { mode: 'signup' } }} />;
}
