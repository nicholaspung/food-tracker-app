import {
  isNoteDetailQueryKey,
  isNotesSummaryQueryKey,
  isPaginatedNotesQueryKey,
  notesQueryKeys,
} from '../features/store/notesQuery';

describe('notesQuery', () => {
  it('uses the canonical note detail key', () => {
    expect(notesQueryKeys.detail('note_1')).toEqual(['feature', 'notes', 'detail', 'note_1']);
    expect(isNoteDetailQueryKey(notesQueryKeys.detail('note_1'))).toBe(true);
  });

  it('uses the canonical paginated notes browse key', () => {
    expect(notesQueryKeys.paginated('draft')).toEqual(['feature', 'notes', 'paginated', 'draft']);
    expect(isPaginatedNotesQueryKey(notesQueryKeys.paginated('draft'))).toBe(true);
  });

  it('does not treat the legacy overview alias as the persisted browse key', () => {
    expect(isPaginatedNotesQueryKey(['feature', 'notes', 'overview', 'draft'])).toBe(false);
  });

  it('uses the canonical notes summary key', () => {
    expect(notesQueryKeys.summary).toEqual(['feature', 'notes', 'summary']);
    expect(isNotesSummaryQueryKey(notesQueryKeys.summary)).toBe(true);
  });
});
