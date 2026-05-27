import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { createNote, deleteNote, markNoteUsed, updateNote } from '../features/store/notesStore';
import { notesQueryKeys } from '../features/store/notesQuery';
import { promoteCachedNoteToUsed, removeCachedNote } from '../features/store/notesCache';
import { useNoteWrites } from '../features/store/useNoteWrites';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/notesStore', () => ({
  createNote: jest.fn(),
  deleteNote: jest.fn(),
  markNoteUsed: jest.fn(),
  updateNote: jest.fn(),
}));

jest.mock('../features/store/notesCache', () => ({
  promoteCachedNoteToUsed: jest.fn(),
  removeCachedNote: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateNote = createNote as jest.MockedFunction<typeof createNote>;
const mockedDeleteNote = deleteNote as jest.MockedFunction<typeof deleteNote>;
const mockedMarkNoteUsed = markNoteUsed as jest.MockedFunction<typeof markNoteUsed>;
const mockedUpdateNote = updateNote as jest.MockedFunction<typeof updateNote>;
const mockedPromoteCachedNoteToUsed = promoteCachedNoteToUsed as jest.MockedFunction<
  typeof promoteCachedNoteToUsed
>;
const mockedRemoveCachedNote = removeCachedNote as jest.MockedFunction<typeof removeCachedNote>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useNoteWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
    setQueryData: jest.fn(),
  };

  beforeEach(() => {
    queryClient.invalidateQueries.mockReset();
    queryClient.removeQueries.mockReset();
    queryClient.setQueryData.mockReset();
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);
    mockedCreateNote.mockReset();
    mockedDeleteNote.mockReset();
    mockedMarkNoteUsed.mockReset();
    mockedUpdateNote.mockReset();
    mockedPromoteCachedNoteToUsed.mockReset();
    mockedRemoveCachedNote.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedShowQueuedOfflineAlert.mockReset();
  });

  async function renderHook(): Promise<{
    getHook: () => ReturnType<typeof useNoteWrites>;
    hook: ReturnType<typeof useNoteWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useNoteWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useNoteWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return {
      getHook: () => {
        if (!hook) {
          throw new Error('Expected hook to render.');
        }
        return hook;
      },
      hook,
      renderer,
    };
  }

  it('runs Note creation online and applies Note cache effects', async () => {
    const savedNote = {
      id: 'note_1',
      title: 'Lunch',
      content: 'Good noodles',
      status: 'draft',
      createdAt: '2026-05-19T12:00:00.000Z',
      updatedAt: '2026-05-19T12:00:00.000Z',
    } as Awaited<ReturnType<typeof createNote>>;
    mockedCreateNote.mockResolvedValue(savedNote);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      content: 'Good noodles',
      photos: [],
      title: 'Lunch',
    };

    let result: Awaited<ReturnType<typeof hook.createNote>> | undefined;
    await act(async () => {
      result = await hook.createNote(input);
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
      }),
    );
    expect(mockedCreateNote).toHaveBeenCalledWith(input);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(notesQueryKeys.detail('note_1'), savedNote);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: notesQueryKeys.root });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'notePhotos'] });
    expect(result).toEqual({ status: 'completed', result: savedNote });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues Note creation through the feature outbox payload', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      content: 'Good noodles',
      title: 'Lunch',
    };

    let result: Awaited<ReturnType<typeof hook.createNote>> | undefined;
    await act(async () => {
      result = await hook.createNote(input);
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
      }),
    );
    expect(mockedCreateNote).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: notesQueryKeys.root });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useNoteWrites',
      subject: 'Note',
    });
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('runs Note update online and applies Note cache effects', async () => {
    const savedNote = {
      id: 'note_1',
      title: 'Lunch update',
      content: 'Better noodles',
      status: 'draft',
      createdAt: '2026-05-19T12:00:00.000Z',
      updatedAt: '2026-05-19T13:00:00.000Z',
    } as Awaited<ReturnType<typeof updateNote>>;
    mockedUpdateNote.mockResolvedValue(savedNote);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      content: 'Better noodles',
      newPhotos: [
        {
          mimeType: 'image/jpeg',
          name: 'note-photo.jpg',
          uri: 'file://note-photo.jpg',
        },
      ],
      title: 'Lunch update',
    };

    let result: Awaited<ReturnType<typeof hook.updateNote>> | undefined;
    await act(async () => {
      result = await hook.updateNote({ noteId: 'note_1', updates });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.update',
        offline: {
          strategy: 'outbox',
          payload: {
            noteId: 'note_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateNote).toHaveBeenCalledWith('note_1', updates);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(notesQueryKeys.detail('note_1'), savedNote);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: notesQueryKeys.root });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'notePhotos'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'notePhotos', 'note_1'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'usage', 'monthly'],
    });
    expect(result).toEqual({ status: 'completed', result: savedNote });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues Note update through the shared submit lifecycle', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      content: 'Better noodles',
      title: 'Lunch update',
    };

    let result: Awaited<ReturnType<typeof hook.updateNote>> | undefined;
    await act(async () => {
      result = await hook.updateNote({ noteId: 'note_1', updates });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.update',
        offline: {
          strategy: 'outbox',
          payload: {
            noteId: 'note_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateNote).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: notesQueryKeys.root });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Note update');
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('removes Note cache after queued delete', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.deleteNote>> | undefined;
    await act(async () => {
      result = await hook.deleteNote({ noteId: 'note_1' });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.delete',
        offline: {
          strategy: 'outbox',
          payload: { noteId: 'note_1' },
        },
      }),
    );
    expect(mockedDeleteNote).not.toHaveBeenCalled();
    expect(mockedRemoveCachedNote).toHaveBeenCalledWith(queryClient, 'note_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: notesQueryKeys.root });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'notePhotos'] });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useNoteWrites',
      subject: 'Note delete',
    });
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('surfaces failed Note writes through the shared submit lifecycle', async () => {
    const writeFeature = jest.fn().mockRejectedValue(new Error('Network unavailable'));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { getHook, hook, renderer } = await renderHook();

    let caughtError: unknown;
    await act(async () => {
      try {
        await hook.createNote({
          content: 'Good noodles',
          title: 'Lunch',
        });
      } catch (error) {
        caughtError = error;
      }
    });

    expect(caughtError).toEqual(new Error('Network unavailable'));
    expect(getHook().errorMessage).toBe('Network unavailable');
    expect(getHook().isSubmitting).toBe(false);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('marks a Note used through the shared used-state write seam', async () => {
    const writeFeature = jest.fn(async ({ execute }) => {
      await execute();
      return { status: 'completed' as const, result: undefined };
    });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      noteId: 'note_1',
      usedAt: '2026-05-20T00:00:00.000Z',
    };

    let result: Awaited<ReturnType<typeof hook.markNoteUsed>> | undefined;
    await act(async () => {
      result = await hook.markNoteUsed(input);
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'note.mark-used',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
      }),
    );
    expect(mockedMarkNoteUsed).toHaveBeenCalledWith(input);
    expect(mockedPromoteCachedNoteToUsed).toHaveBeenCalledWith(queryClient, input);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: notesQueryKeys.root });
    expect(result).toEqual({ status: 'completed', result: undefined });

    await act(async () => {
      renderer.unmount();
    });
  });
});
