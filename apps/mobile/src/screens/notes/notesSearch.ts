import type { NoteRecord } from '../../features';
import { matchesNoteSearch } from '../../features/store/notesQuery';
import type { NotesFilter } from './notesTypes';

export { matchesNoteSearch } from '../../features/store/notesQuery';

export const MIN_SERVER_NOTE_SEARCH_LENGTH = 2;
export const NOTE_SEARCH_DEBOUNCE_MS = 250;

export function resolveNoteStatusFilter(activeFilter: NotesFilter): 'draft' | 'used' {
  if (activeFilter === 'unused') {
    return 'draft';
  }

  return 'used';
}

export function buildNotePreview(content: string): string {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return '';
  }

  return trimmedContent
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.trim()) {
        return '';
      }

      return line.replace(/[^\S\n]+/g, ' ').trim();
    })
    .join('\n');
}

export function serverSearchResultsMatchQuery(
  notes: readonly Pick<NoteRecord, 'content' | 'locationText'>[],
  query: string,
): boolean {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return true;
  }

  return notes.every((note) => matchesNoteSearch(note, normalizedQuery));
}
