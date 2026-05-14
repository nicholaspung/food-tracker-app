import type { HomeFeedMapPoint } from '../features';
import { groupHomeFeedMapPointsByRestaurant } from '../screens/home/homeFeedMapGrouping';

function buildVisitPoint(overrides: Partial<Extract<HomeFeedMapPoint, { source: 'visit' }>> = {}): HomeFeedMapPoint {
  return {
    eventAt: '2026-05-01T00:00:00.000Z',
    id: 'visit_visit-1',
    latitude: 34.05,
    longitude: -118.24,
    ratingSummaryLabel: '4.0 avg',
    restaurantId: 'restaurant-1',
    restaurantLocation: 'Los Angeles',
    restaurantName: 'CCB Snack Bar',
    source: 'visit',
    visit: {
      createdAt: '2026-05-01T00:00:00.000Z',
      id: 'visit-1',
      items: [
        {
          id: 'item-1',
          name: 'Karaage',
          rating: 3,
        },
      ],
      restaurantId: 'restaurant-1',
      restaurantLocation: 'Los Angeles',
      restaurantName: 'CCB Snack Bar',
      source: 'visit',
      updatedAt: '2026-05-01T00:00:00.000Z',
      visitedAt: '2026-05-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function buildFoodProductPoint(
  overrides: Partial<Extract<HomeFeedMapPoint, { source: 'food-product' }>> = {},
): HomeFeedMapPoint {
  return {
    eventAt: '2026-05-02T00:00:00.000Z',
    foodProduct: {
      createdAt: '2026-05-02T00:00:00.000Z',
      id: 'food-1',
      itemName: 'Teriyaki Bowl',
      rating: 5,
      restaurantName: 'CCB Snack Bar',
      updatedAt: '2026-05-02T00:00:00.000Z',
    },
    id: 'food_product_food-1',
    latitude: 34.05,
    longitude: -118.24,
    ratingSummaryLabel: '5.0 rating',
    restaurantId: 'restaurant-1',
    restaurantLocation: 'Los Angeles',
    restaurantName: 'CCB Snack Bar',
    source: 'food-product',
    ...overrides,
  };
}

describe('groupHomeFeedMapPointsByRestaurant', () => {
  it('groups multiple map points with the same restaurant id into one restaurant marker group', () => {
    const groups = groupHomeFeedMapPointsByRestaurant([
      buildVisitPoint(),
      buildFoodProductPoint(),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      foodProductCount: 1,
      id: 'restaurant-1',
      restaurantName: 'CCB Snack Bar',
      visitCount: 1,
    });
    expect(groups[0].items.map((item) => item.name)).toEqual(['Teriyaki Bowl', 'Karaage']);
    expect(groups[0].ratingAverage).toBe(4);
  });

  it('falls back to name and coordinates when a restaurant id is missing', () => {
    const groups = groupHomeFeedMapPointsByRestaurant([
      buildFoodProductPoint({
        foodProduct: {
          createdAt: '2026-05-02T00:00:00.000Z',
          id: 'food-1',
          itemName: 'Teriyaki Bowl',
          rating: 5,
          restaurantName: 'CCB Snack Bar',
          updatedAt: '2026-05-02T00:00:00.000Z',
        },
        id: 'food_product_food-1',
        restaurantId: undefined,
      }),
      buildFoodProductPoint({
        foodProduct: {
          createdAt: '2026-05-03T00:00:00.000Z',
          id: 'food-2',
          itemName: 'Katsu',
          rating: 4,
          restaurantName: 'CCB Snack Bar',
          updatedAt: '2026-05-03T00:00:00.000Z',
        },
        id: 'food_product_food-2',
        restaurantId: undefined,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('ccb snack bar:34.05000:-118.24000');
    expect(groups[0].items.map((item) => item.name)).toEqual(['Teriyaki Bowl', 'Katsu']);
  });

  it('attaches photo previews and hides the current user name for own records', () => {
    const groups = groupHomeFeedMapPointsByRestaurant(
      [
        buildVisitPoint({
          visit: {
            createdAt: '2026-05-01T00:00:00.000Z',
            id: 'visit-1',
            items: [
              {
                id: 'item-1',
                name: 'Karaage',
                rating: 3,
              },
            ],
            restaurantId: 'restaurant-1',
            restaurantLocation: 'Los Angeles',
            restaurantName: 'CCB Snack Bar',
            source: 'visit',
            updatedAt: '2026-05-01T00:00:00.000Z',
            userId: 'user-1',
            userName: 'nicholas',
            visitedAt: '2026-05-01T00:00:00.000Z',
          },
        }),
      ],
      {
        currentUserId: 'user-1',
        photoPreviews: [
          {
            collectionName: 'visit_photos',
            created: '2026-05-01T00:00:00.000Z',
            food_item: 'item-1',
            id: 'photo-1',
            photo: 'karaage.jpg',
          },
        ],
      },
    );

    expect(groups[0].items[0].ownerName).toBeUndefined();
    expect(groups[0].items[0].photoPreviews[0]).toMatchObject({
      id: 'photo-1',
      photo: 'karaage.jpg',
    });
  });
});
