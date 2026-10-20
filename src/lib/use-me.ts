import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';

export type Me = {
  user: { name: string; email: string; role?: string | null };
  isAdmin: boolean;
  stats?: { reportsCount: number; binsContributed: number; trustScore: number };
};

/** Session user + admin flag + contribution stats (shared by every screen). */
export function useMe() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    enabled: Boolean(session?.user),
    retry: false,
  });
}
