import {
  pruneIncrementalIdQueryState,
  updateIncrementalIdQueryState,
} from '../hooks/incrementalIdQueryState';

interface NotePhotoRecord {
  id: string;
  note: string;
}

const getRecordIds = (record: NotePhotoRecord) => [record.note] as const;
const getRecordKey = (record: NotePhotoRecord) => record.id;

function buildPhoto(id: string, note: string): NotePhotoRecord {
  return {
    id,
    note,
  };
}

describe('incrementalIdQueryState', () => {
  it('retains visible ids plus a bounded tail of recent history', () => {
    const nextState = updateIncrementalIdQueryState(
      {
        loadedIds: ['note_1', 'note_2', 'note_3'],
        records: [
          buildPhoto('photo_1', 'note_1'),
          buildPhoto('photo_2', 'note_2'),
          buildPhoto('photo_3', 'note_3'),
        ],
      },
      ['note_4'],
      [buildPhoto('photo_4', 'note_4')],
      ['note_3', 'note_4'],
      getRecordIds,
      getRecordKey,
      1,
    );

    expect(nextState.loadedIds).toEqual(['note_2', 'note_3', 'note_4']);
    expect(nextState.records.map((record) => record.note)).toEqual(['note_2', 'note_3', 'note_4']);
  });

  it('treats refetched ids as most recent when trimming historical ids', () => {
    const nextState = updateIncrementalIdQueryState(
      {
        loadedIds: ['note_1', 'note_2', 'note_3'],
        records: [
          buildPhoto('photo_1', 'note_1'),
          buildPhoto('photo_2_old', 'note_2'),
          buildPhoto('photo_3', 'note_3'),
        ],
      },
      ['note_2'],
      [buildPhoto('photo_2_new', 'note_2')],
      ['note_2'],
      getRecordIds,
      getRecordKey,
      1,
    );

    expect(nextState.loadedIds).toEqual(['note_3', 'note_2']);
    expect(nextState.records).toEqual([
      buildPhoto('photo_3', 'note_3'),
      buildPhoto('photo_2_new', 'note_2'),
    ]);
  });

  it('preserves every current visible id even when the history cap is smaller', () => {
    const currentState = {
      loadedIds: ['note_1', 'note_2', 'note_3'],
      records: [
        buildPhoto('photo_1', 'note_1'),
        buildPhoto('photo_2', 'note_2'),
        buildPhoto('photo_3', 'note_3'),
      ],
    };

    const nextState = pruneIncrementalIdQueryState(currentState, ['note_1', 'note_2', 'note_3'], getRecordIds, 1);

    expect(nextState.loadedIds).toEqual(['note_1', 'note_2', 'note_3']);
    expect(nextState.records).toEqual(currentState.records);
  });

  it('drops non-visible ids when the current window shrinks without fetching', () => {
    const nextState = pruneIncrementalIdQueryState(
      {
        loadedIds: ['note_1', 'note_2', 'note_3'],
        records: [
          buildPhoto('photo_1', 'note_1'),
          buildPhoto('photo_2', 'note_2'),
          buildPhoto('photo_3', 'note_3'),
        ],
      },
      ['note_3'],
      getRecordIds,
      0,
    );

    expect(nextState.loadedIds).toEqual(['note_3']);
    expect(nextState.records).toEqual([buildPhoto('photo_3', 'note_3')]);
  });
});
