import {
  completeSourceNoteAfterEntryWrite,
  persistSourceNoteUsed,
  promoteSourceNoteUsed,
} from '../features/notes/sourceNoteCompletion';
import { markNoteUsed } from '../features/store/featureStore';
import { promoteCachedNoteToUsed } from '../features/store/notesCache';

jest.mock('../features/store/featureStore', () => ({
  markNoteUsed: jest.fn(),
}));

jest.mock('../features/store/notesCache', () => ({
  promoteCachedNoteToUsed: jest.fn(),
}));

const mockedMarkNoteUsed = markNoteUsed as jest.MockedFunction<typeof markNoteUsed>;
const mockedPromoteCachedNoteToUsed = promoteCachedNoteToUsed as jest.MockedFunction<
  typeof promoteCachedNoteToUsed
>;

describe('source note completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMarkNoteUsed.mockResolvedValue({ id: 'note-1' } as never);
  });

  it('persists queued source note completion through the offline outbox and promotes cache state', async () => {
    const queryClient = {};
    const writeFeature = jest.fn(async ({ execute }) => {
      await execute();
      return { status: 'queued' as const };
    });

    await persistSourceNoteUsed({
      noteId: 'note-1',
      queryClient: queryClient as never,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature: writeFeature as never,
    });

    expect(writeFeature).toHaveBeenCalledWith({
      operationName: 'note.mark-used',
      trackOnlineWrite: false,
      offline: {
        strategy: 'outbox',
        payload: {
          noteId: 'note-1',
          usedAt: '2026-05-20T00:00:00.000Z',
        },
      },
      execute: expect.any(Function),
    });
    expect(mockedMarkNoteUsed).toHaveBeenCalledWith({
      noteId: 'note-1',
      usedAt: '2026-05-20T00:00:00.000Z',
    });
    expect(mockedPromoteCachedNoteToUsed).toHaveBeenCalledWith(queryClient, {
      noteId: 'note-1',
      usedAt: '2026-05-20T00:00:00.000Z',
    });
  });

  it('promotes completed source note completion without queueing another note write', async () => {
    const queryClient = {};
    const writeFeature = jest.fn();

    await completeSourceNoteAfterEntryWrite({
      entryWriteStatus: 'completed',
      noteId: 'note-1',
      queryClient: queryClient as never,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature: writeFeature as never,
    });

    expect(writeFeature).not.toHaveBeenCalled();
    expect(mockedMarkNoteUsed).not.toHaveBeenCalled();
    expect(mockedPromoteCachedNoteToUsed).toHaveBeenCalledWith(queryClient, {
      noteId: 'note-1',
      usedAt: '2026-05-20T00:00:00.000Z',
    });
  });

  it('persists source note completion after queued entry writes', async () => {
    const queryClient = {};
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });

    await completeSourceNoteAfterEntryWrite({
      entryWriteStatus: 'queued',
      noteId: 'note-1',
      queryClient: queryClient as never,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature: writeFeature as never,
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.mark-used',
        trackOnlineWrite: false,
      }),
    );
    expect(mockedPromoteCachedNoteToUsed).toHaveBeenCalledWith(
      queryClient,
      expect.objectContaining({ noteId: 'note-1' }),
    );
  });

  it('does nothing when no source note is attached', async () => {
    const queryClient = {};
    const writeFeature = jest.fn();

    promoteSourceNoteUsed({
      noteId: undefined,
      queryClient: queryClient as never,
      usedAt: '2026-05-20T00:00:00.000Z',
    });
    await completeSourceNoteAfterEntryWrite({
      entryWriteStatus: 'queued',
      noteId: undefined,
      queryClient: queryClient as never,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature: writeFeature as never,
    });

    expect(writeFeature).not.toHaveBeenCalled();
    expect(mockedMarkNoteUsed).not.toHaveBeenCalled();
    expect(mockedPromoteCachedNoteToUsed).not.toHaveBeenCalled();
  });
});
