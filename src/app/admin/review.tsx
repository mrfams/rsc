import { AdminWorkspace } from '@/app/admin';

/**
 * Admin review queue. A dedicated route lets the admin bottom nav open pending
 * bins directly and highlight the Review tab.
 */
export default function AdminReviewScreen() {
  return <AdminWorkspace initialTab="bins" initialFilter="pending" />;
}
