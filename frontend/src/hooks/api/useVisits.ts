import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb, Visit } from "@/lib/pocketbase";
import { visitKeys } from "@/constants/queryKeys";
import { COLLECTIONS } from '@/constants/collections';

// Re-export Visit type for convenience
export type { Visit };

// Re-export query keys for backward compatibility
export { visitKeys };

interface UseVisitsOptions {
  expand?: string;
  sort?: string;
  filter?: string;
}

/**
 * Hook to fetch all visits with optional expand
 * @param options - Optional query parameters (expand, sort, filter)
 * @returns Query result with visits array, loading state, error, and refetch function
 */
export function useVisits(
  options: UseVisitsOptions = {}
): UseQueryResult<Visit[], Error> {
  const { expand, sort = "-visitDate", filter } = options;

  return useQuery<Visit[], Error>({
    queryKey: [
      ...visitKeys.all,
      ...(expand ? [expand] : []),
      ...(filter ? [filter] : []),
    ],
    queryFn: async () => {
      return await pb.collection(COLLECTIONS.VISITS).getFullList<Visit>({
        ...(expand && { expand }),
        sort,
        ...(filter && { filter }),
      });
    },
  });
}

/**
 * Hook to fetch visits for a specific user
 * @param userId - The ID of the user to fetch visits for
 * @param enabled - Whether the query should run (default: true if userId is provided)
 * @returns Query result with visits array, loading state, error, and refetch function
 */
export function useVisitsByUser(
  userId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<Visit[], Error> {
  return useQuery<Visit[], Error>({
    queryKey: userId ? visitKeys.byUser(userId) : ["userVisits", "null"],
    queryFn: async () => {
      if (!userId) return [];
      return await pb.collection(COLLECTIONS.VISITS).getFullList<Visit>({
        filter: `user = "${userId}"`,
      });
    },
    enabled: enabled !== undefined ? enabled : !!userId,
  });
}

/**
 * Hook to fetch visits from friends
 * @param userId - The current user's ID
 * @param friendIds - Array of friend user IDs
 * @param enabled - Whether the query should run (default: true if both params are provided)
 * @returns Query result with visits array, loading state, error, and refetch function
 */
export function useFriendVisits(
  userId: string | undefined | null,
  friendIds: string[] = [],
  enabled?: boolean
): UseQueryResult<Visit[], Error> {
  return useQuery<Visit[], Error>({
    queryKey: userId
      ? visitKeys.friendVisits(userId, friendIds.length)
      : ["friendVisits", "null", 0],
    queryFn: async () => {
      if (!userId || friendIds.length === 0) return [];

      // Build filter for friend visits with visibility "friends"
      const filterConditions = friendIds
        .map((id) => `user = "${id}"`)
        .join(" || ");
      return await pb.collection(COLLECTIONS.VISITS).getFullList<Visit>({
        filter: `(${filterConditions}) && visibility = "friends"`,
      });
    },
    enabled: enabled !== undefined
      ? enabled
      : !!(userId && friendIds.length > 0),
  });
}
