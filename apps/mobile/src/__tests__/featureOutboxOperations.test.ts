import {
  replayFeatureOutboxMutation,
} from '../features/store/featureOutboxOperations';
import { replayRegisteredFeatureOutboxOperation } from '../features/store/featureOutboxReplayAdapters';
import {
  createCollectionRecord,
  getCollectionRecord,
  listCollectionPage,
  saveAuthRecord,
  updateCollectionRecord,
} from '../features/store/pocketbaseGateway';
import {
  createBill,
  deleteBill,
  markBillParticipantPaid,
  updateBill,
} from '../features/store/billsStore';
import {
  convertVisitItemToFoodProduct,
  createFeedback,
  createFoodProduct,
  createRestaurantList,
  createVisit,
  inviteFriend,
  markNoteUsed,
  updateVisit,
} from '../features/store/featureStore';
import type { CreateFeedbackInput } from '../features/store/featureStore';
import type { QueuedMutation } from '../offline/types';

const offlineFeedbackCreatePayload: CreateFeedbackInput = {
  title: 'Offline draft feedback',
  description: 'Offline draft feedback with details',
};

jest.mock('../features/store/featureStore', () => ({
  addRestaurantVisitRatingsToList: jest.fn(),
  createBill: jest.fn(),
  createDefaultRestaurantList: jest.fn(),
  createFeedback: jest.fn(),
  createFoodProduct: jest.fn(),
  convertVisitItemToFoodProduct: jest.fn(),
  createNote: jest.fn(),
  createRestaurantList: jest.fn(),
  createVisit: jest.fn(),
  deleteBill: jest.fn(),
  deleteFoodProduct: jest.fn(),
  deleteNote: jest.fn(),
  deleteRestaurantList: jest.fn(),
  deleteVisit: jest.fn(),
  inviteFriend: jest.fn(),
  markBillParticipantPaid: jest.fn(),
  markFriendInviteAccepted: jest.fn(),
  markNoteUsed: jest.fn(),
  moveRestaurantListRestaurant: jest.fn(),
  removeFriend: jest.fn(),
  removeRestaurantListSourceRating: jest.fn(),
  removeRestaurantListUserRating: jest.fn(),
  saveRestaurantFoodItemToList: jest.fn(),
  sendFeedbackMessage: jest.fn(),
  updateBill: jest.fn(),
  updateFoodProduct: jest.fn(),
  updateNote: jest.fn(),
  updateRestaurantList: jest.fn(),
  updateVisit: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  createCollectionRecord: jest.fn(),
  getAuthRecord: jest.fn(),
  getCollectionRecord: jest.fn(),
  listCollectionPage: jest.fn(),
  saveAuthRecord: jest.fn(),
  updateCollectionRecord: jest.fn(),
}));

jest.mock('../features/store/billsStore', () => ({
  createBill: jest.fn(),
  deleteBill: jest.fn(),
  markBillParticipantPaid: jest.fn(),
  updateBill: jest.fn(),
}));

jest.mock('../features/store/tastingSessionsApiStore', () => ({
  createTastingSession: jest.fn(),
  joinTastingSession: jest.fn(),
  setTastingSessionStatus: jest.fn(),
}));

const mockedCreateBill = createBill as jest.MockedFunction<typeof createBill>;
const mockedDeleteBill = deleteBill as jest.MockedFunction<typeof deleteBill>;
const mockedMarkBillParticipantPaid = markBillParticipantPaid as jest.MockedFunction<
  typeof markBillParticipantPaid
>;
const mockedUpdateBill = updateBill as jest.MockedFunction<typeof updateBill>;
const mockedCreateVisit = createVisit as jest.MockedFunction<typeof createVisit>;
const mockedCreateFoodProduct = createFoodProduct as jest.MockedFunction<typeof createFoodProduct>;
const mockedCreateRestaurantList = createRestaurantList as jest.MockedFunction<typeof createRestaurantList>;
const mockedCreateFeedback = createFeedback as jest.MockedFunction<typeof createFeedback>;
const mockedInviteFriend = inviteFriend as jest.MockedFunction<typeof inviteFriend>;
const mockedConvertVisitItemToFoodProduct = convertVisitItemToFoodProduct as jest.MockedFunction<
  typeof convertVisitItemToFoodProduct
>;
const mockedMarkNoteUsed = markNoteUsed as jest.MockedFunction<typeof markNoteUsed>;
const mockedUpdateVisit = updateVisit as jest.MockedFunction<typeof updateVisit>;
const mockedGetCollectionRecord = getCollectionRecord as jest.MockedFunction<typeof getCollectionRecord>;
const mockedCreateCollectionRecord = createCollectionRecord as jest.MockedFunction<typeof createCollectionRecord>;
const mockedListCollectionPage = listCollectionPage as jest.MockedFunction<typeof listCollectionPage>;
const mockedSaveAuthRecord = saveAuthRecord as jest.MockedFunction<typeof saveAuthRecord>;
const mockedUpdateCollectionRecord = updateCollectionRecord as jest.MockedFunction<typeof updateCollectionRecord>;

function createQueuedMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: 'mut_1',
    method: 'POST',
    url: 'local://feature/visit.create',
    body: JSON.stringify({
      restaurantName: 'Noodle House',
      items: [
        {
          name: 'Spicy Wontons',
          rating: 5,
        },
      ],
    }),
    headers: {
      'X-Mobile-Write-Operation': 'visit.create',
    },
    status: 'pending',
    idempotencyKey: 'idem_123',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('featureOutboxOperations', () => {
  beforeEach(() => {
    mockedCreateBill.mockReset();
    mockedDeleteBill.mockReset();
    mockedMarkBillParticipantPaid.mockReset();
    mockedUpdateBill.mockReset();
    mockedCreateVisit.mockReset();
    mockedCreateFoodProduct.mockReset();
    mockedCreateRestaurantList.mockReset();
    mockedCreateFeedback.mockReset();
    mockedInviteFriend.mockReset();
    mockedConvertVisitItemToFoodProduct.mockReset();
    mockedMarkNoteUsed.mockReset();
    mockedUpdateVisit.mockReset();
    mockedCreateCollectionRecord.mockReset();
    mockedGetCollectionRecord.mockReset();
    mockedListCollectionPage.mockReset();
    mockedSaveAuthRecord.mockReset();
    mockedUpdateCollectionRecord.mockReset();
    mockedListCollectionPage.mockResolvedValue({
      items: [{ id: 'notification-preferences-1' }],
      page: 1,
      pageSize: 1,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
    });
  });

  it('passes queued idempotency headers into replayed local feature writes', async () => {
    mockedCreateVisit.mockResolvedValue({
      id: 'visit-1',
      restaurantName: 'Noodle House',
      visitedAt: '2026-04-23T18:00:00.000Z',
      items: [],
      source: 'visit',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:00:00.000Z',
    } as Awaited<ReturnType<typeof createVisit>>);

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Mobile-Write-Operation': 'visit.create',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedCreateVisit).toHaveBeenCalledWith(
      {
        restaurantName: 'Noodle House',
        items: [
          {
            name: 'Spicy Wontons',
            rating: 5,
          },
        ],
      },
      {
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Mobile-Write-Operation': 'visit.create',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays visit item conversion through local feature writes', async () => {
    mockedConvertVisitItemToFoodProduct.mockResolvedValue({
      deletedSourceVisit: false,
      foodProductId: 'food-product-1',
      sourceVisitId: 'visit-1',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/visit.item.convert-to-food-product',
        body: JSON.stringify({
          itemId: 'item-1',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'visit.item.convert-to-food-product',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedConvertVisitItemToFoodProduct).toHaveBeenCalledWith(
      {
        itemId: 'item-1',
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'visit.item.convert-to-food-product',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays visit updates through the public feature outbox replay interface', async () => {
    mockedUpdateVisit.mockResolvedValue({
      id: 'visit-1',
      restaurantName: 'Updated Noodle House',
      visitedAt: '2026-04-23T18:00:00.000Z',
      items: [],
      source: 'visit',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:05:00.000Z',
    } as Awaited<ReturnType<typeof updateVisit>>);

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/visit.update',
        body: JSON.stringify({
          visitId: 'visit-1',
          updates: {
            restaurantName: 'Updated Noodle House',
          },
        }),
        headers: {
          'X-Mobile-Write-Operation': 'visit.update',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateVisit).toHaveBeenCalledWith(
      'visit-1',
      {
        restaurantName: 'Updated Noodle House',
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'visit.update',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays food product creates through the public feature outbox replay interface', async () => {
    mockedCreateFoodProduct.mockResolvedValue({
      id: 'food-product-1',
      itemName: 'Chili Crisp',
      restaurantName: '',
      rating: 5,
      source: 'food-product',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:00:00.000Z',
    } as Awaited<ReturnType<typeof createFoodProduct>>);

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/food-product.create',
        body: JSON.stringify({
          itemName: 'Chili Crisp',
          rating: 5,
        }),
        headers: {
          'X-Mobile-Write-Operation': 'food-product.create',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedCreateFoodProduct).toHaveBeenCalledWith(
      {
        itemName: 'Chili Crisp',
        rating: 5,
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'food-product.create',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays note mark-used writes through the public feature outbox replay interface', async () => {
    mockedMarkNoteUsed.mockResolvedValue();

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/note.mark-used',
        body: JSON.stringify({
          noteId: 'note-1',
          usedAt: '2026-04-23T18:00:00.000Z',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'note.mark-used',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedMarkNoteUsed).toHaveBeenCalledWith(
      {
        noteId: 'note-1',
        usedAt: '2026-04-23T18:00:00.000Z',
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'note.mark-used',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays restaurant list creation through the adapter registry', async () => {
    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/list.create',
        body: JSON.stringify({
          name: 'Date Night',
          description: 'Dinner shortlist',
          visibility: 'friends',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'list.create',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedCreateRestaurantList).toHaveBeenCalledWith(
      {
        name: 'Date Night',
        description: 'Dinner shortlist',
        visibility: 'friends',
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'list.create',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays feedback creation through the adapter registry', async () => {
    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/feedback.create',
        body: JSON.stringify(offlineFeedbackCreatePayload),
        headers: {
          'X-Mobile-Write-Operation': 'feedback.create',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedCreateFeedback).toHaveBeenCalledWith(
      offlineFeedbackCreatePayload,
      {
        headers: {
          'X-Mobile-Write-Operation': 'feedback.create',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays friend request sends through the adapter registry', async () => {
    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/friend.request.send',
        body: JSON.stringify({
          friendCode: 'ABCD1234',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'friend.request.send',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedInviteFriend).toHaveBeenCalledWith(
      {
        friendCode: 'ABCD1234',
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'friend.request.send',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('does not replay legacy tasting session item adds', async () => {
    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/tasting-session.item.add',
        body: JSON.stringify({
          sessionId: 'session-1',
          input: {
            name: 'Espresso',
            description: 'Bright',
          },
        }),
        headers: {
          'X-Mobile-Write-Operation': 'tasting-session.item.add',
        },
      }),
    );

    expect(handled).toBe(false);
  });

  it('does not replay legacy tasting session rating submissions', async () => {
    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/tasting-session.rating.submit',
        body: JSON.stringify({
          sessionId: 'session-1',
          itemId: 'item-1',
          input: {
            rating: 4,
            note: 'Balanced',
          },
        }),
        headers: {
          'X-Mobile-Write-Operation': 'tasting-session.rating.submit',
        },
      }),
    );

    expect(handled).toBe(false);
  });

  it('lets the replay adapter registry ignore operations it does not own', async () => {
    const handled = await replayRegisteredFeatureOutboxOperation(
      'tasting-session.create',
      {},
      {
        headers: {
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );

    expect(handled).toBe(false);
  });

  it('replays bill creation through the bill writes adapter', async () => {
    mockedCreateBill.mockResolvedValue({
      id: 'bill_1',
      title: 'Dinner',
      restaurantName: 'Noodle House',
      createdByUserId: 'user_1',
      totalAmount: 42,
      items: [],
      participants: [],
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'equal',
      status: 'open',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:00:00.000Z',
    });

    const payload = {
      title: 'Dinner',
      restaurantName: 'Noodle House',
      items: [],
      participants: [],
      totalAmount: 42,
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'even',
    };

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/bill.create',
        body: JSON.stringify(payload),
        headers: {
          'X-Mobile-Write-Operation': 'bill.create',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedCreateBill).toHaveBeenCalledWith(payload, {
      headers: {
        'X-Mobile-Write-Operation': 'bill.create',
        'Idempotency-Key': 'idem_123',
        'X-Idempotency-Key': 'idem_123',
      },
    });
  });

  it('replays bill updates through the bill writes adapter', async () => {
    mockedUpdateBill.mockResolvedValue({
      id: 'bill_1',
      title: 'Updated Dinner',
      restaurantName: 'Noodle House',
      createdByUserId: 'user_1',
      totalAmount: 48,
      items: [],
      participants: [],
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'equal',
      status: 'open',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:05:00.000Z',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/bill.update',
        body: JSON.stringify({
          billId: 'bill_1',
          updates: {
            title: 'Updated Dinner',
            totalAmount: 48,
          },
        }),
        headers: {
          'X-Mobile-Write-Operation': 'bill.update',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateBill).toHaveBeenCalledWith(
      'bill_1',
      {
        title: 'Updated Dinner',
        totalAmount: 48,
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'bill.update',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays bill deletion through the bill writes adapter', async () => {
    mockedDeleteBill.mockResolvedValue();

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/bill.delete',
        body: JSON.stringify({
          billId: 'bill_1',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'bill.delete',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedDeleteBill).toHaveBeenCalledWith('bill_1', {
      headers: {
        'X-Mobile-Write-Operation': 'bill.delete',
        'Idempotency-Key': 'idem_123',
        'X-Idempotency-Key': 'idem_123',
      },
    });
  });

  it('replays bill status changes through the bill writes adapter', async () => {
    mockedUpdateBill.mockResolvedValue({
      id: 'bill_1',
      title: 'Dinner',
      restaurantName: 'Noodle House',
      createdByUserId: 'user_1',
      totalAmount: 42,
      items: [],
      participants: [],
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'equal',
      status: 'settled',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:05:00.000Z',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/bill.status.toggle',
        body: JSON.stringify({
          billId: 'bill_1',
          status: 'settled',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'bill.status.toggle',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateBill).toHaveBeenCalledWith(
      'bill_1',
      {
        status: 'settled',
      },
      {
        headers: {
          'X-Mobile-Write-Operation': 'bill.status.toggle',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays bill participant paid-status changes through the bill writes adapter', async () => {
    mockedMarkBillParticipantPaid.mockResolvedValue({
      id: 'bill_1',
      title: 'Dinner',
      restaurantName: 'Noodle House',
      createdByUserId: 'user_1',
      totalAmount: 42,
      items: [],
      participants: [],
      tax: 0,
      tip: 0,
      fees: 0,
      extrasSplitMode: 'equal',
      status: 'open',
      createdAt: '2026-04-23T18:00:00.000Z',
      updatedAt: '2026-04-23T18:05:00.000Z',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/bill.participant.toggle-paid',
        body: JSON.stringify({
          billId: 'bill_1',
          participantId: 'participant_1',
          paidStatus: 'paid',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'bill.participant.toggle-paid',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedMarkBillParticipantPaid).toHaveBeenCalledWith(
      'bill_1',
      'participant_1',
      'paid',
      {
        headers: {
          'X-Mobile-Write-Operation': 'bill.participant.toggle-paid',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
  });

  it('replays settings preferences through the adapter registry', async () => {
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'user_1',
      defaultVisitVisibility: 'friends',
      defaultRestaurantVisibility: 'private',
      defaultListVisibility: 'friends',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/settings.visibility.save',
        body: JSON.stringify({
          userId: 'user_1',
          defaultVisitVisibility: 'friends',
          defaultRestaurantVisibility: 'private',
          defaultListVisibility: 'friends',
          homeFeedMode: 'all',
          homeFeedTypeFilter: 'all',
          homeFeedSort: 'newest',
          bill_owed_enabled: true,
          monthly_friends_activity_enabled: false,
          tasting_invites_enabled: true,
        }),
        headers: {
          'X-Mobile-Write-Operation': 'settings.visibility.save',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'users',
      'user_1',
      expect.objectContaining({
        defaultListVisibility: 'friends',
        defaultRestaurantVisibility: 'private',
        defaultVisitVisibility: 'friends',
      }),
      {
        headers: {
          'X-Mobile-Write-Operation': 'settings.visibility.save',
          'Idempotency-Key': 'idem_123',
          'X-Idempotency-Key': 'idem_123',
        },
      },
    );
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'notification_preferences',
      'notification-preferences-1',
      {
        bill_owed_enabled: true,
        monthly_friends_activity_enabled: false,
        tasting_invites_enabled: true,
      },
    );
    expect(mockedSaveAuthRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_1',
      }),
    );
  });

  it('replays main onboarding completion while preserving existing onboarding state', async () => {
    mockedGetCollectionRecord.mockResolvedValue({
      id: 'user_1',
      mobileOnboardingState: {
        moreCards: {
          lists: {
            dismissedAt: '2026-04-28T12:00:00.000Z',
          },
        },
      },
    });
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'user_1',
      mobileOnboardingState: {
        main: {
          completedVersion: 1,
          completedAt: '2026-04-28T12:05:00.000Z',
        },
        moreCards: {
          lists: {
            dismissedAt: '2026-04-28T12:00:00.000Z',
          },
        },
      },
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/onboarding.main.complete',
        body: JSON.stringify({
          userId: 'user_1',
          version: 1,
          completedAt: '2026-04-28T12:05:00.000Z',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'onboarding.main.complete',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'users',
      'user_1',
      {
        mobileOnboardingState: {
          main: {
            completedVersion: 1,
            completedAt: '2026-04-28T12:05:00.000Z',
          },
          moreCards: {
            lists: {
              dismissedAt: '2026-04-28T12:00:00.000Z',
            },
          },
        },
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Mobile-Write-Operation': 'onboarding.main.complete',
        }),
      }),
    );
    expect(mockedSaveAuthRecord).toHaveBeenCalled();
  });

  it('replays one More onboarding card dismissal without clearing the other card', async () => {
    mockedGetCollectionRecord.mockResolvedValue({
      id: 'user_1',
      mobileOnboardingState: {
        main: {
          completedVersion: 1,
          completedAt: '2026-04-28T12:05:00.000Z',
        },
        moreCards: {
          splitBill: {
            dismissedAt: '2026-04-28T12:10:00.000Z',
          },
        },
      },
    });
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'user_1',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/onboarding.more-card.dismiss',
        body: JSON.stringify({
          userId: 'user_1',
          cardId: 'lists',
          dismissedAt: '2026-04-28T12:15:00.000Z',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'onboarding.more-card.dismiss',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'users',
      'user_1',
      {
        mobileOnboardingState: {
          main: {
            completedVersion: 1,
            completedAt: '2026-04-28T12:05:00.000Z',
          },
          moreCards: {
            lists: {
              dismissedAt: '2026-04-28T12:15:00.000Z',
            },
            splitBill: {
              dismissedAt: '2026-04-28T12:10:00.000Z',
            },
          },
        },
      },
      expect.any(Object),
    );
  });

  it('replays Tip Calculator onboarding dismissal without clearing existing More cards', async () => {
    mockedGetCollectionRecord.mockResolvedValue({
      id: 'user_1',
      mobileOnboardingState: {
        moreCards: {
          lists: {
            dismissedAt: '2026-04-28T12:15:00.000Z',
          },
          splitBill: {
            dismissedAt: '2026-04-28T12:10:00.000Z',
          },
        },
      },
    });
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'user_1',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/onboarding.more-card.dismiss',
        body: JSON.stringify({
          userId: 'user_1',
          cardId: 'tipCalculator',
          dismissedAt: '2026-04-28T12:20:00.000Z',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'onboarding.more-card.dismiss',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'users',
      'user_1',
      {
        mobileOnboardingState: {
          moreCards: {
            lists: {
              dismissedAt: '2026-04-28T12:15:00.000Z',
            },
            splitBill: {
              dismissedAt: '2026-04-28T12:10:00.000Z',
            },
            tipCalculator: {
              dismissedAt: '2026-04-28T12:20:00.000Z',
            },
          },
        },
      },
      expect.any(Object),
    );
  });

  it('replays one Add onboarding card dismissal without clearing existing onboarding state', async () => {
    mockedGetCollectionRecord.mockResolvedValue({
      id: 'user_1',
      mobileOnboardingState: {
        main: {
          completedVersion: 1,
          completedAt: '2026-04-28T12:05:00.000Z',
        },
        moreCards: {
          lists: {
            dismissedAt: '2026-04-28T12:15:00.000Z',
          },
        },
        addCards: {
          trackFoodProduct: {
            dismissedAt: '2026-04-28T12:25:00.000Z',
          },
        },
      },
    });
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'user_1',
    });

    const handled = await replayFeatureOutboxMutation(
      createQueuedMutation({
        url: 'local://feature/onboarding.add-card.dismiss',
        body: JSON.stringify({
          userId: 'user_1',
          cardId: 'trackRestaurantVisit',
          dismissedAt: '2026-04-28T12:30:00.000Z',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'onboarding.add-card.dismiss',
        },
      }),
    );

    expect(handled).toBe(true);
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'users',
      'user_1',
      {
        mobileOnboardingState: {
          main: {
            completedVersion: 1,
            completedAt: '2026-04-28T12:05:00.000Z',
          },
          moreCards: {
            lists: {
              dismissedAt: '2026-04-28T12:15:00.000Z',
            },
          },
          addCards: {
            trackRestaurantVisit: {
              dismissedAt: '2026-04-28T12:30:00.000Z',
            },
            trackFoodProduct: {
              dismissedAt: '2026-04-28T12:25:00.000Z',
            },
          },
        },
      },
      expect.any(Object),
    );
  });
});
