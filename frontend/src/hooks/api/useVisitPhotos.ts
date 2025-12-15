import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb, VisitPhoto } from "@/lib/pocketbase";
import { COLLECTIONS } from '@/constants/collections';
import { visitPhotoKeys } from '@/constants/queryKeys';

// Re-export VisitPhoto type for convenience
export type { VisitPhoto };

/**
 * Hook to fetch visit photos for a specific visit
 * @param visitId - The ID of the visit
 * @param options - Query options
 * @returns Query result with visit photos array
 */
export function useVisitPhotos(
  visitId: string | undefined | null,
  options?: { enabled?: boolean }
): UseQueryResult<VisitPhoto[], Error> {
  return useQuery<VisitPhoto[], Error>({
    queryKey: visitId ? visitPhotoKeys.byVisit(visitId) : visitPhotoKeys.all,
    queryFn: async () => {
      if (!visitId) return [];
      return await pb.collection(COLLECTIONS.VISIT_PHOTOS).getFullList<VisitPhoto>({
        filter: `visit = "${visitId}"`,
        sort: '-created',
      });
    },
    enabled: options?.enabled !== undefined ? options.enabled : !!visitId,
  });
}

/**
 * Hook to fetch all visit photos for the current user
 * @param options - Query options
 * @returns Query result with visit photos array
 */
export function useAllVisitPhotos(options?: {
  filter?: string;
  expand?: string;
}): UseQueryResult<VisitPhoto[], Error> {
  const userId = pb.authStore.record?.id;

  return useQuery<VisitPhoto[], Error>({
    queryKey: userId ? visitPhotoKeys.byUser(userId, options?.filter) : visitPhotoKeys.all,
    queryFn: async () => {
      if (!userId) return [];

      const filters: string[] = [`user = "${userId}"`];
      if (options?.filter) {
        filters.push(options.filter);
      }

      return await pb.collection(COLLECTIONS.VISIT_PHOTOS).getFullList<VisitPhoto>({
        filter: filters.join(' && '),
        expand: options?.expand,
        sort: '-created',
      });
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single visit photo by ID
 * @param photoId - The ID of the photo
 * @param enabled - Whether the query should run
 * @returns Query result with photo data
 */
export function useVisitPhoto(
  photoId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<VisitPhoto | null, Error> {
  return useQuery<VisitPhoto | null, Error>({
    queryKey: photoId ? visitPhotoKeys.detail(photoId) : visitPhotoKeys.all,
    queryFn: async () => {
      if (!photoId) return null;
      return await pb.collection(COLLECTIONS.VISIT_PHOTOS).getOne<VisitPhoto>(photoId);
    },
    enabled: enabled !== undefined ? enabled : !!photoId,
  });
}
