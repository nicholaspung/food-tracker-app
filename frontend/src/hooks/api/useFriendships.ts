import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { COLLECTIONS } from '@/constants/collections';
import { friendshipKeys } from '@/constants/queryKeys';

export interface Friendship {
  id: string;
  user: string;
  friend: string;
  status: 'pending' | 'accepted' | 'rejected';
  created: string;
  updated: string;
  expand?: {
    user?: {
      id: string;
      name: string;
      email: string;
    };
    friend?: {
      id: string;
      name: string;
      email: string;
    };
  };
}

/**
 * Hook to fetch all friendships for the current user
 * @param options - Query options
 * @returns Query result with friendships array
 */
export function useFriendships(options?: {
  status?: 'pending' | 'accepted' | 'rejected';
  expand?: string;
}): UseQueryResult<Friendship[], Error> {
  const userId = pb.authStore.record?.id;

  return useQuery<Friendship[], Error>({
    queryKey: userId ? friendshipKeys.byUser(userId, options?.status) : friendshipKeys.all,
    queryFn: async () => {
      if (!userId) return [];

      const filters: string[] = [`user = "${userId}" || friend = "${userId}"`];
      if (options?.status) {
        filters.push(`status = "${options.status}"`);
      }

      return await pb.collection(COLLECTIONS.FRIENDSHIPS).getFullList<Friendship>({
        filter: filters.join(' && '),
        expand: options?.expand || 'user,friend',
        sort: '-created',
      });
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single friendship by ID
 * @param friendshipId - The ID of the friendship
 * @param enabled - Whether the query should run
 * @returns Query result with friendship data
 */
export function useFriendship(
  friendshipId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<Friendship | null, Error> {
  return useQuery<Friendship | null, Error>({
    queryKey: friendshipId ? friendshipKeys.detail(friendshipId) : friendshipKeys.all,
    queryFn: async () => {
      if (!friendshipId) return null;
      return await pb.collection(COLLECTIONS.FRIENDSHIPS).getOne<Friendship>(friendshipId, {
        expand: 'user,friend',
      });
    },
    enabled: enabled !== undefined ? enabled : !!friendshipId,
  });
}
