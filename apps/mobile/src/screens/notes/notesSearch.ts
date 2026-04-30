import type { NoteRecord } from '../../features';
import type { NotesFilter } from './notesTypes';

export const MIN_SERVER_NOTE_SEARCH_LENGTH = 2;
export const NOTE_SEARCH_DEBOUNCE_MS = 250;

export function resolveNoteStatusFilter(activeFilter: NotesFilter): 'all' | 'draft' | 'used' {
  if (activeFilter === 'unused') {
    return 'draft';
  }

  if (activeFilter === 'used') {
    return 'used';
  }

  return 'all';
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
