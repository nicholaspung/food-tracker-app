import type { QueryClient } from '@tanstack/react-query';

import type { VisitRecord } from '../features/models';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { notesQueryKeys } from '../features/store/notesQuery';
import { usageQueryKeys } from '../features/store/usageQuery';
import { visitPhotosQueryKeys } from '../features/store/visitPhotosQuery';
import { syncVisitMutationCaches, visitsQueryKeys } from '../features/store/visitsQuery';

function buildVisitRecord(
  overrides: Partial<VisitRecord> = {},
): VisitRecord {
  return {
    id: overrides.id ?? 'visit-1',
    restaurantName: overrides.restaurantName ?? 'Noodle House',
    visitedAt: overrides.visitedAt ?? '2026-04-21T00:00:00.000Z',
    items: overrides.items ?? [],
    source: overrides.source ?? 'visit',
    visibility: overrides.visibility ?? 'friends',
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('visitsQuery', () => {
  it('patches the cached detail entry and invalidates only targeted mutation queries', async () => {
    const queryClient = {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
      setQueryData: jest.fn(),
    } as unknown as QueryClient;
    const visit = buildVisitRecord();

    await syncVisitMutationCaches(queryClient, {
      visit,
      includeUsage: true,
      includeVisitPhotos: true,
      sourceNoteId: 'note-1',
    });

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      visitsQueryKeys.detail(visit.id),
      visit,
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: homeFeedQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitsQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'restaurants', 'visitStats'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitPhotosQueryKeys.visit(visit.id),
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: usageQueryKeys.monthlyRoot,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: notesQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: visitPhotosQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: visitsQueryKeys.detail(visit.id),
    });
  });

  it('invalidates the detail query when only the id is available', async () => {
    const queryClient = {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
      setQueryData: jest.fn(),
    } as unknown as QueryClient;

    await syncVisitMutationCaches(queryClient, {
      visitId: 'visit-2',
    });

    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: visitsQueryKeys.detail('visit-2'),
    });
  });
});
