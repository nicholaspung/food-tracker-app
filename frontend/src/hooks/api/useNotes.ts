import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { pb, type Note, type NotePhoto } from "@/lib/pocketbase";
import { noteKeys } from '@/constants/queryKeys';
import { repositories } from '@/repositories';

// Re-export types for convenience
export type { Note, NotePhoto };

/**
 * Hook to fetch all notes for the current user
 * @param options - Query options
 * @returns Query result with notes array
 */
export function useNotes(options?: {
  status?: 'draft' | 'used';
  expand?: string;
}): UseQueryResult<Note[], Error> {
  const userId = pb.authStore.record?.id;

  return useQuery<Note[], Error>({
    queryKey: userId ? noteKeys.all : ['notes'],
    queryFn: async () => {
      if (!userId) return [];

      const filters: string[] = [`user = "${userId}"`];
      if (options?.status) {
        filters.push(`status = "${options.status}"`);
      }

      return await repositories.notes.getFullList({
        filter: filters.join(' && '),
        sort: '-created',
        expand: options?.expand || 'restaurant',
      });
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch only unused (draft) notes for the current user
 * @returns Query result with unused notes array
 */
export function useUnusedNotes(options?: {
  expand?: string;
}): UseQueryResult<Note[], Error> {
  const userId = pb.authStore.record?.id;

  return useQuery<Note[], Error>({
    queryKey: userId ? noteKeys.unused(userId) : ['notes', 'unused'],
    queryFn: async () => {
      if (!userId) return [];

      return await repositories.notes.getUnusedNotes(userId, {
        expand: options?.expand || 'restaurant',
      });
    },
    enabled: !!userId,
  });
}

/**
 * Hook to fetch a single note by ID
 * @param noteId - The ID of the note
 * @param enabled - Whether the query should run
 * @returns Query result with note data
 */
export function useNote(
  noteId: string | undefined | null,
  enabled?: boolean
): UseQueryResult<Note | null, Error> {
  return useQuery<Note | null, Error>({
    queryKey: noteId ? noteKeys.detail(noteId) : ['notes'],
    queryFn: async () => {
      if (!noteId) return null;
      return await repositories.notes.getOne(noteId, {
        expand: 'restaurant',
      });
    },
    enabled: enabled !== undefined ? enabled : !!noteId,
  });
}

/**
 * Hook to fetch photos for a specific note
 * @param noteId - The ID of the note
 * @param options - Query options
 * @returns Query result with note photos array
 */
export function useNotePhotos(
  noteId: string | undefined | null,
  options?: { enabled?: boolean }
): UseQueryResult<NotePhoto[], Error> {
  return useQuery<NotePhoto[], Error>({
    queryKey: noteId ? noteKeys.photos(noteId) : ['note_photos'],
    queryFn: async () => {
      if (!noteId) return [];
      return await repositories.notePhotos.getByNote(noteId);
    },
    enabled: options?.enabled !== undefined ? options.enabled : !!noteId,
  });
}
