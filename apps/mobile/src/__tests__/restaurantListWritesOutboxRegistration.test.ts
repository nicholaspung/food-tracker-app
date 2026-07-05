import {
  createDefaultRestaurantList,
  saveRestaurantFoodItemToList,
} from '../features/store/restaurantListsStore';
import { RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION } from '../features/store/restaurantListWritesOutboxRegistration';

jest.mock('../features/store/restaurantListsStore', () => ({
  addRestaurantVisitRatingsToList: jest.fn(),
  createDefaultRestaurantList: jest.fn(),
  createRestaurantList: jest.fn(),
  deleteRestaurantList: jest.fn(),
  moveRestaurantListRestaurant: jest.fn(),
  removeRestaurantFoodItemBookmarkFromList: jest.fn(),
  removeRestaurantListSourceRating: jest.fn(),
  removeRestaurantListUserRating: jest.fn(),
  saveRestaurantFoodItemToList: jest.fn(),
  saveRestaurantToDefaultList: jest.fn(),
  updateRestaurantList: jest.fn(),
}));

const mockedCreateDefaultRestaurantList = createDefaultRestaurantList as jest.MockedFunction<
  typeof createDefaultRestaurantList
>;
const mockedSaveRestaurantFoodItemToList = saveRestaurantFoodItemToList as jest.MockedFunction<
  typeof saveRestaurantFoodItemToList
>;

describe('RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateDefaultRestaurantList.mockResolvedValue({
      createdAt: '2026-04-01T00:00:00.000Z',
      id: 'default-list-1',
      isDefault: true,
      name: 'Want to Try',
      updatedAt: '2026-04-01T00:00:00.000Z',
      userId: 'user-1',
      visibility: 'private',
    });
  });

  it('replays default-list bookmark saves with source list attribution', async () => {
    await RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION.replayAdapters['list.default.bookmark.save']?.(
      {
        restaurantId: 'restaurant-1',
        foodItemId: 'food-1',
        note: 'Try the noodles',
        sourceListId: 'source-list-1',
        sourceListItemId: 'source-list-item-1',
        sourceUserId: 'friend-1',
      },
      {
        headers: {
          'X-Idempotency-Key': 'queued-write-1',
        },
      },
    );

    expect(mockedSaveRestaurantFoodItemToList).toHaveBeenCalledWith(
      {
        listId: 'default-list-1',
        restaurantId: 'restaurant-1',
        foodItemId: 'food-1',
        note: 'Try the noodles',
        sourceListId: 'source-list-1',
        sourceListItemId: 'source-list-item-1',
        sourceUserId: 'friend-1',
      },
      {
        headers: {
          'X-Idempotency-Key': 'queued-write-1',
        },
      },
    );
  });
});
