import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { reconcileSuccessfulFeatureOutboxReplay } from '../features/store/featureOutboxReplayAdapters';
import { resolveRegisteredFeatureOutboxReplayMetadata } from '../features/store/featureOutboxReplayAdapters';
import { homeFeedQueryKeys } from '../features/store/homeFeedQuery';
import { applyQueuedFeatureWriteBrowseProjection } from '../features/store/queuedFeatureWriteBrowseProjection';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { usageQueryKeys } from '../features/store/usageQuery';
import { visitPhotosQueryKeys } from '../features/store/visitPhotosQuery';
import type { SuccessfulMutationReplayOutcome } from '../offline/types';

function createOutcome(
  operationName: string,
  identity: SuccessfulMutationReplayOutcome['identity'] = {},
  cacheHints: SuccessfulMutationReplayOutcome['cacheHints'] = [],
): SuccessfulMutationReplayOutcome {
  return {
    cacheHints,
    idempotencyKey: `idem_${operationName}`,
    identity,
    operationName,
    originAccountId: 'user_1',
  };
}

describe('feature outbox replay cache effects', () => {
  it.each([
    [
      'visit.update',
      {
        updates: {
          items: [{ id: 'item_1', name: 'Pie', rating: 5, newPhotos: [{ uri: 'photo' }] }],
        },
        visitId: 'visit_1',
      },
      ['usage', 'visit-photos'],
    ],
    [
      'food-product.update',
      { foodProductId: 'food_1', updates: { deletePhotoIds: ['photo_1'] } },
      ['food-product-photos'],
    ],
    ['note.mark-used', { noteId: 'note_1' }, []],
  ] as const)('derives scoped cache hints for %s payloads', (operationName, payload, cacheHints) => {
    expect(resolveRegisteredFeatureOutboxReplayMetadata(operationName, payload)).toMatchObject({
      cacheHints,
    });
  });

  it.each([
    ['visit.create', {}, ['feature', 'homeFeed']],
    ['food-product.update', { foodProductId: 'food_1' }, ['feature', 'foodProducts']],
    ['note.mark-used', { noteId: 'note_1' }, ['feature', 'notes']],
    ['list.create', {}, ['feature', 'restaurantLists', 'my']],
    ['bill.update', { billId: 'bill_1' }, ['feature', 'bills']],
    ['feedback.message.send', { feedbackId: 'feedback_1' }, ['feature', 'feedback-messages', 'feedback_1']],
    ['friend.accept', { friendId: 'friend_1' }, ['feature', 'friends']],
    ['settings.visibility.save', { userId: 'user_1' }, ['feature', 'settings', 'user_1']],
    ['onboarding.more-card.dismiss', { userId: 'user_1' }, ['feature', 'moreFeatureSignals']],
    ['tasting-session.status.update', { sessionId: 'session_1' }, ['feature', 'tasting-sessions', 'session_1']],
  ] as const)(
    'applies the %s domain cache policy',
    async (operationName, identity, expectedQueryKey) => {
      const queryClient = new QueryClient();
      const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

      await reconcileSuccessfulFeatureOutboxReplay(
        queryClient,
        createOutcome(operationName, identity),
      );

      expect(invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expectedQueryKey }),
      );
      queryClient.clear();
    },
  );

  it.each([
    ['visit.create', {}, ['usage', 'visit-photos'], true, true],
    [
      'visit.item.move',
      { destinationVisitId: 'visit_2', itemId: 'item_1' },
      ['visit-photos'],
      true,
      false,
    ],
    ['food-product.create', {}, ['food-product-photos', 'usage'], true, true],
    ['food-product.update', { foodProductId: 'food_1' }, [], false, false],
    ['note.mark-used', { noteId: 'note_1' }, [], false, false],
  ] as const)(
    'scopes photo and usage cache effects after %s replay',
    async (operationName, identity, cacheHints, invalidatesPhotos, invalidatesUsage) => {
      const queryClient = new QueryClient();
      const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

      await reconcileSuccessfulFeatureOutboxReplay(
        queryClient,
        createOutcome(operationName, identity, cacheHints),
      );

      const invalidatedQueryKeys = invalidateQueries.mock.calls.map(
        ([filters]) => filters?.queryKey,
      );
      expect(invalidatedQueryKeys).toEqual(
        invalidatesPhotos
          ? expect.arrayContaining([visitPhotosQueryKeys.root])
          : expect.not.arrayContaining([visitPhotosQueryKeys.root]),
      );
      expect(invalidatedQueryKeys).toEqual(
        invalidatesUsage
          ? expect.arrayContaining([usageQueryKeys.monthlyRoot])
          : expect.not.arrayContaining([usageQueryKeys.monthlyRoot]),
      );
      queryClient.clear();
    },
  );

  it('replaces a pre-replay reconnect result before the optimistic create is removed', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const queryKey = homeFeedQueryKeys.paginated('user_1', 'mine', 'all', 'created', '');
    const canonicalItem = {
      id: 'visit_1',
      source: 'visit',
      visit: { id: 'visit_1', restaurantName: 'Canonical Cafe' },
    };
    let serverItems: object[] = [];
    const observer = new QueryObserver(queryClient, {
      queryFn: async () => ({
        pageParams: [undefined],
        pages: [{ items: serverItems }],
      }),
      queryKey,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await observer.refetch();
    expect(queryClient.getQueryData<{ pages: { items: object[] }[] }>(queryKey)?.pages[0]?.items)
      .toEqual([]);

    const queuedWrite: QueuedFeatureWrite<'visit.create'> = {
      createdAt: 1000,
      id: 'mutation_1',
      idempotencyKey: 'idem_visit_create_1',
      lastError: null,
      operationName: 'visit.create',
      originAccountId: 'user_1',
      payload: {
        items: [],
        restaurantName: 'Optimistic Cafe',
      },
      status: 'in_flight',
    };
    applyQueuedFeatureWriteBrowseProjection(queryClient, [queuedWrite], ['home-feed']);
    unsubscribe();

    serverItems = [canonicalItem];
    await reconcileSuccessfulFeatureOutboxReplay(
      queryClient,
      createOutcome('visit.create'),
    );
    applyQueuedFeatureWriteBrowseProjection(queryClient, [], ['home-feed']);

    expect(queryClient.getQueryData<{ pages: { items: object[] }[] }>(queryKey)?.pages[0]?.items)
      .toEqual([canonicalItem]);

    queryClient.clear();
  });
});
