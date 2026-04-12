import type { QueryKey } from '@tanstack/react-query';

import type { ListNotesPageInput } from './featureStore';

type NoteBrowseStatus = NonNullable<ListNotesPageInput['status']>;

const NOTE_BROWSE_STATUSES = ['all', 'draft', 'used'] as const;

export const notesQueryKeys = {
  root: ['feature', 'notes'] as const,
  detail: (noteId: string) => ['feature', 'notes', 'detail', noteId] as const,
  paginated: (status: NoteBrowseStatus) => ['feature', 'notes', 'paginated', status] as const,
  summary: ['feature', 'notes', 'summary'] as const,
};

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
    queryKey.length === 4 &&
    queryKey[0] === notesQueryKeys.root[0] &&
    queryKey[1] === notesQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    NOTE_BROWSE_STATUSES.includes(queryKey[3] as NoteBrowseStatus)
  );
}

export function isNotesSummaryQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === notesQueryKeys.summary.length &&
    notesQueryKeys.summary.every((segment, index) => queryKey[index] === segment)
  );
}
