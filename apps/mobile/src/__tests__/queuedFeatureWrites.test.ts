import {
  getQueuedMutationOperationName,
  parseQueuedFeatureWrite,
  parseQueuedFeatureWrites,
  parseQueuedMutationBody,
} from '../features/store/queuedFeatureWrites';
import type { CreateFeedbackInput } from '../features/store/featureStore';
import type { QueuedMutation } from '../offline/types';

const offlineFeedbackCreatePayload: CreateFeedbackInput = {
  title: 'Offline draft feedback',
  description: 'Offline draft feedback with details',
};

function createQueuedMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: 'mut_1',
    method: 'POST',
    url: 'local://feature/tasting-session.create',
    originAccountId: 'user_1',
    body: JSON.stringify({
      name: 'Friday noodles',
      joinDurationMinutes: 60,
      invitedUserIds: ['user_2'],
    }),
    headers: {
      'X-Mobile-Write-Operation': 'tasting-session.create',
    },
    status: 'pending',
    idempotencyKey: 'idem_1',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: null,
    createdAt: 1000,
    updatedAt: 1000,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('queuedFeatureWrites', () => {
  it('parses queued feature writes with typed operation metadata', () => {
    const parsed = parseQueuedFeatureWrite(createQueuedMutation());

    expect(parsed).toEqual({
      id: 'mut_1',
      operationName: 'tasting-session.create',
      payload: {
        name: 'Friday noodles',
        joinDurationMinutes: 60,
        invitedUserIds: ['user_2'],
      },
      status: 'pending',
      createdAt: 1000,
      idempotencyKey: 'idem_1',
      lastError: null,
      originAccountId: 'user_1',
    });
  });

  it('falls back to the local feature URL when the operation header is missing', () => {
    expect(
      getQueuedMutationOperationName(
        createQueuedMutation({
          headers: {},
          url: 'local://feature/tasting-session.join',
        }),
      ),
    ).toBe('tasting-session.join');
  });

  it('excludes unknown and malformed queue rows from feature UI parsing', () => {
    const parsed = parseQueuedFeatureWrites([
      createQueuedMutation(),
      createQueuedMutation({
        id: 'mut_unknown',
        headers: {
          'X-Mobile-Write-Operation': 'unknown.operation',
        },
        url: 'local://feature/unknown.operation',
      }),
      createQueuedMutation({
        id: 'mut_bad_json',
        body: '{bad-json',
      }),
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('mut_1');
  });

  it('excludes malformed display payloads before patching pending-write UI caches', () => {
    const parsed = parseQueuedFeatureWrites([
      createQueuedMutation({
        id: 'mut_bad_bill',
        headers: {
          'X-Mobile-Write-Operation': 'bill.create',
        },
        url: 'local://feature/bill.create',
        body: JSON.stringify({
          title: 'Dinner',
        }),
      }),
      createQueuedMutation({
        id: 'mut_bad_visit',
        headers: {
          'X-Mobile-Write-Operation': 'visit.create',
        },
        url: 'local://feature/visit.create',
        body: JSON.stringify({
          restaurantName: 'Ramen Shop',
        }),
      }),
      createQueuedMutation({
        id: 'mut_note',
        headers: {
          'X-Mobile-Write-Operation': 'note.create',
        },
        url: 'local://feature/note.create',
        body: JSON.stringify({
          content: 'Try the noodles',
        }),
      }),
    ]);

    expect(parsed.map((write) => write.id)).toEqual(['mut_note']);
  });

  it('returns null for malformed JSON bodies', () => {
    expect(parseQueuedMutationBody(createQueuedMutation({ body: '{bad-json' }))).toBeNull();
  });

  it('documents replay bodies stored for offline write domains', () => {
    const queuedDomainMutations = [
      createQueuedMutation({
        id: 'mut_visit',
        url: 'local://feature/visit.create',
        body: JSON.stringify({
          restaurantName: 'Noodle House',
          visitedAt: '2026-05-01T18:00:00.000Z',
          visibility: 'friends',
          items: [{ name: 'Dan Dan Noodles', rating: 5, notes: 'Extra chili' }],
        }),
        headers: {
          'X-Mobile-Write-Operation': 'visit.create',
        },
      }),
      createQueuedMutation({
        id: 'mut_food_product',
        url: 'local://feature/food-product.create',
        body: JSON.stringify({
          itemName: 'Chili Crisp',
          rating: 5,
          notes: 'Pantry staple',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'food-product.create',
        },
      }),
      createQueuedMutation({
        id: 'mut_note',
        url: 'local://feature/note.create',
        body: JSON.stringify({
          title: 'Try later',
          content: 'Order the dumplings',
          locationText: 'Mission District',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'note.create',
        },
      }),
      createQueuedMutation({
        id: 'mut_list',
        url: 'local://feature/list.create',
        body: JSON.stringify({
          name: 'Date Night',
          description: 'Dinner shortlist',
          visibility: 'private',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'list.create',
        },
      }),
      createQueuedMutation({
        id: 'mut_bill',
        url: 'local://feature/bill.create',
        body: JSON.stringify({
          title: 'Friday dinner',
          restaurantName: 'Noodle House',
          participants: [{ userId: 'user_2', displayName: 'Taylor', owedAmount: 24 }],
          items: [{ name: 'Noodles', amount: 24 }],
          totalAmount: 24,
        }),
        headers: {
          'X-Mobile-Write-Operation': 'bill.create',
        },
      }),
      createQueuedMutation({
        id: 'mut_feedback',
        url: 'local://feature/feedback.create',
        body: JSON.stringify(offlineFeedbackCreatePayload),
        headers: {
          'X-Mobile-Write-Operation': 'feedback.create',
        },
      }),
      createQueuedMutation({
        id: 'mut_friend',
        url: 'local://feature/friend.request.send',
        body: JSON.stringify({
          friendCode: 'ABCD1234',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'friend.request.send',
        },
      }),
      createQueuedMutation({
        id: 'mut_friend_suggestion',
        url: 'local://feature/friend.suggestion.accept',
        body: JSON.stringify({
          inviterId: 'user_inviter',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'friend.suggestion.accept',
        },
      }),
    ];

    const parsed = parseQueuedFeatureWrites(queuedDomainMutations);

    expect(parsed.map((write) => write.operationName)).toEqual([
      'visit.create',
      'food-product.create',
      'note.create',
      'list.create',
      'bill.create',
      'feedback.create',
      'friend.request.send',
      'friend.suggestion.accept',
    ]);
    expect(parsed.map((write) => write.payload)).toEqual(
      queuedDomainMutations.map((mutation) => parseQueuedMutationBody(mutation)),
    );
    expect(
      parsed.map((write) => ({
        id: write.id,
        bodyStoredForReplay:
          typeof queuedDomainMutations.find((mutation) => mutation.id === write.id)?.body === 'string',
      })),
    ).toEqual([
      { id: 'mut_visit', bodyStoredForReplay: true },
      { id: 'mut_food_product', bodyStoredForReplay: true },
      { id: 'mut_note', bodyStoredForReplay: true },
      { id: 'mut_list', bodyStoredForReplay: true },
      { id: 'mut_bill', bodyStoredForReplay: true },
      { id: 'mut_feedback', bodyStoredForReplay: true },
      { id: 'mut_friend', bodyStoredForReplay: true },
      { id: 'mut_friend_suggestion', bodyStoredForReplay: true },
    ]);
  });
});
