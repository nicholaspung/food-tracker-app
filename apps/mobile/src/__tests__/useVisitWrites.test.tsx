import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { completeSourceNoteAfterEntryWrite } from '../features/notes/sourceNoteCompletion';
import { createVisitApiMutationInput } from '../features/store/featureOutboxOperations';
import { createVisit, updateVisit } from '../features/store/visitsStore';
import { syncVisitMutationCaches } from '../features/store/visitsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useVisitWrites } from '../features/store/useVisitWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/notes/sourceNoteCompletion', () => ({
  completeSourceNoteAfterEntryWrite: jest.fn(),
}));

jest.mock('../features/store/featureOutboxOperations', () => ({
  createVisitApiMutationInput: jest.fn((input: unknown) => ({
    body: input,
    method: 'POST',
    url: '/api/visits',
  })),
}));

jest.mock('../features/store/visitsStore', () => ({
  createVisit: jest.fn(),
  updateVisit: jest.fn(),
}));

jest.mock('../features/store/visitsQuery', () => ({
  syncVisitMutationCaches: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCompleteSourceNoteAfterEntryWrite =
  completeSourceNoteAfterEntryWrite as jest.MockedFunction<typeof completeSourceNoteAfterEntryWrite>;
const mockedCreateVisitApiMutationInput =
  createVisitApiMutationInput as jest.MockedFunction<typeof createVisitApiMutationInput>;
const mockedCreateVisit = createVisit as jest.MockedFunction<typeof createVisit>;
const mockedUpdateVisit = updateVisit as jest.MockedFunction<typeof updateVisit>;
const mockedSyncVisitMutationCaches =
  syncVisitMutationCaches as jest.MockedFunction<typeof syncVisitMutationCaches>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useVisitWrites', () => {
  const queryClient = {};
  const createInput = {
    restaurantName: 'Noodle House',
    items: [{ name: 'Wontons', rating: 4 }],
    visitedAt: '2026-04-20T00:00:00.000Z',
    visitedOn: '2026-04-20',
    visibility: 'friends' as const,
    source: 'visit' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as ReturnType<typeof useQueryClient>);
    mockedCompleteSourceNoteAfterEntryWrite.mockResolvedValue(undefined);
    mockedCreateVisit.mockResolvedValue({ id: 'visit_1', items: [] } as never);
    mockedUpdateVisit.mockResolvedValue({ id: 'visit_1', items: [] } as never);
    mockedSyncVisitMutationCaches.mockResolvedValue(undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useVisitWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useVisitWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useVisitWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('creates visits with API replay when requested', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await hook.createVisit({
        input: createInput,
        hasPhotoUploads: false,
        useApiReplay: true,
      });
    });

    expect(mockedCreateVisitApiMutationInput).toHaveBeenCalledWith(createInput);
    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.create',
        offline: {
          strategy: 'api',
          input: {
            body: createInput,
            method: 'POST',
            url: '/api/visits',
          },
        },
      }),
    );
    expect(mockedCreateVisit).toHaveBeenCalledWith(createInput);
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visit: expect.objectContaining({ id: 'visit_1' }),
      includeUsage: false,
      sourceNoteId: undefined,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues photo or source-note-backed creates through the outbox and completes the source note', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await act(async () => {
      await hook.createVisit({
        input: { ...createInput, sourceNoteId: 'note_1' },
        hasPhotoUploads: true,
        sourceNote: {
          noteId: 'note_1',
          usedAt: '2026-05-20T00:00:00.000Z',
        },
        useApiReplay: false,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.create',
        offline: {
          strategy: 'outbox',
          payload: { ...createInput, sourceNoteId: 'note_1' },
        },
      }),
    );
    expect(mockedCompleteSourceNoteAfterEntryWrite).toHaveBeenCalledWith({
      entryWriteStatus: 'queued',
      noteId: 'note_1',
      queryClient,
      usedAt: '2026-05-20T00:00:00.000Z',
      writeFeature,
    });
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      includeUsage: true,
      sourceNoteId: 'note_1',
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useVisitWrites',
      subject: 'Visit',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates visits through the outbox payload and syncs update caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      restaurantName: 'Updated',
      items: [],
      visitedAt: '2026-04-21T00:00:00.000Z',
      visitedOn: '2026-04-21',
      visibility: 'private' as const,
    };

    await act(async () => {
      await hook.updateVisit({
        visitId: 'visit_1',
        updates,
        includeUsage: true,
        includeVisitPhotos: true,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.update',
        offline: {
          strategy: 'outbox',
          payload: {
            visitId: 'visit_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateVisit).toHaveBeenCalledWith('visit_1', updates);
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visit: expect.objectContaining({ id: 'visit_1' }),
      includeUsage: true,
      includeVisitPhotos: true,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues visit updates through the outbox payload and syncs queued update caches', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const updates = {
      restaurantName: 'Queued Update',
      items: [],
      visitedAt: '2026-04-22T00:00:00.000Z',
      visitedOn: '2026-04-22',
      visibility: 'private' as const,
    };

    await act(async () => {
      await hook.updateVisit({
        visitId: 'visit_1',
        updates,
        includeUsage: false,
        includeVisitPhotos: true,
      });
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.update',
        offline: {
          strategy: 'outbox',
          payload: {
            visitId: 'visit_1',
            updates,
          },
        },
      }),
    );
    expect(mockedUpdateVisit).not.toHaveBeenCalled();
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(queryClient, {
      visitId: 'visit_1',
      includeUsage: false,
      includeVisitPhotos: true,
    });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useVisitWrites',
      subject: 'Visit update',
    });

    await act(async () => {
      renderer.unmount();
    });
  });
});
