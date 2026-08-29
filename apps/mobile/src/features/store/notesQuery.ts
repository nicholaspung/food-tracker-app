import type { QueryKey } from '@tanstack/react-query';

import type { NoteRecord } from '../models';
import type { ListNotesPageInput } from './featureStore';

type NoteBrowseStatus = NonNullable<ListNotesPageInput['status']>;
type NotesPaginatedQueryKey =
  | readonly ['feature', 'notes', 'paginated', NoteBrowseStatus]
  | readonly ['feature', 'notes', 'paginated', NoteBrowseStatus, string];

const NOTE_BROWSE_STATUSES = ['all', 'draft', 'used'] as const;

function normalizeNoteIdQueryValue(noteId: string): string {
  return noteId.trim();
}

export const notesQueryKeys = {
  root: ['feature', 'notes'] as const,
  detail: (noteId: string) => ['feature', 'notes', 'detail', normalizeNoteIdQueryValue(noteId)] as const,
  paginated: (status: NoteBrowseStatus, searchQuery = ''): NotesPaginatedQueryKey => {
    const trimmedSearchQuery = searchQuery.trim();
    if (!trimmedSearchQuery) {
      return ['feature', 'notes', 'paginated', status] as const;
    }

    return ['feature', 'notes', 'paginated', status, trimmedSearchQuery] as const;
  },
  summary: ['feature', 'notes', 'summary'] as const,
};

export const notePhotosQueryKeys = {
  root: ['feature', 'notePhotos'] as const,
  detail: (noteId: string) => ['feature', 'notePhotos', normalizeNoteIdQueryValue(noteId)] as const,
};

export function matchesNoteSearch(note: Pick<NoteRecord, 'content' | 'locationText'>, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    note.content.toLowerCase().includes(normalizedQuery) ||
    note.locationText?.toLowerCase().includes(normalizedQuery) === true
  );
}

export function isNoteDetailQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 4 &&
    queryKey[0] === notesQueryKeys.root[0] &&
    queryKey[1] === notesQueryKeys.root[1] &&
    queryKey[2] === 'detail' &&
    typeof queryKey[3] === 'string' &&
    queryKey[3].trim().length > 0
  );
}

export function isPaginatedNotesQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    (queryKey.length === 4 || queryKey.length === 5) &&
    queryKey[0] === notesQueryKeys.root[0] &&
    queryKey[1] === notesQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    NOTE_BROWSE_STATUSES.includes(queryKey[3] as NoteBrowseStatus) &&
    (queryKey.length === 4 || typeof queryKey[4] === 'string')
  );
}

export function isNotesSummaryQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === notesQueryKeys.summary.length &&
    notesQueryKeys.summary.every((segment, index) => queryKey[index] === segment)
  );
}
