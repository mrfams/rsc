import { AdminWorkspace } from '@/app/admin';
import { siteMetadata } from '@/lib/site-metadata';

export function generateMetadata() {
  return siteMetadata({ title: 'Admin review', path: '/admin/review', noIndex: true });
}

/**
 * Admin review queue. A dedicated route lets the admin bottom nav open pending
 * bins directly and highlight the Review tab.
 */
export default function AdminReviewScreen() {
  return <AdminWorkspace initialTab="bins" initialFilter="pending" />;
}
