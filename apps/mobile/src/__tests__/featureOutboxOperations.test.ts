import {
  replayFeatureOutboxMutation,
} from '../features/store/featureOutboxOperations';
import {
  getCollectionRecord,
  saveAuthRecord,
  updateCollectionRecord,
} from '../features/store/pocketbaseGateway';
import {
  convertVisitItemToFoodProduct,
  createVisit,
} from '../features/store/featureStore';
import type { QueuedMutation } from '../offline/types';

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
  getAuthRecord: jest.fn(),
  getCollectionRecord: jest.fn(),
  saveAuthRecord: jest.fn(),
  updateCollectionRecord: jest.fn(),
}));

const mockedCreateVisit = createVisit as jest.MockedFunction<typeof createVisit>;
const mockedConvertVisitItemToFoodProduct = convertVisitItemToFoodProduct as jest.MockedFunction<
  typeof convertVisitItemToFoodProduct
>;
const mockedGetCollectionRecord = getCollectionRecord as jest.MockedFunction<typeof getCollectionRecord>;
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
    mockedCreateVisit.mockReset();
    mockedConvertVisitItemToFoodProduct.mockReset();
    mockedGetCollectionRecord.mockReset();
    mockedSaveAuthRecord.mockReset();
    mockedUpdateCollectionRecord.mockReset();
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
