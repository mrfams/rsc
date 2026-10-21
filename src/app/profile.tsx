import { Redirect } from 'expo-router';

/**
 * The account dashboard is called Stats now. Keep the old path working for
 * bookmarks, shared links and older builds that still navigate to /profile.
 */
export default function ProfileRedirect() {
  return <Redirect href="/stats" />;
}
