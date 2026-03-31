import type { RestaurantRecord } from '../features';
import { calculateDistance, formatDistance } from './googlePlaces';

export interface VisitRestaurantReferenceCoords {
  lat: number;
  lng: number;
}

export interface VisitRestaurantWithDistance {
  restaurant: RestaurantRecord;
  distance: number | null;
}

export function matchesVisitRestaurantSearch(restaurant: RestaurantRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    restaurant.name.toLowerCase().includes(normalizedQuery) ||
    (restaurant.location ?? '').toLowerCase().includes(normalizedQuery) ||
    (restaurant.city ?? '').toLowerCase().includes(normalizedQuery) ||
    (restaurant.cuisineType ?? '').toLowerCase().includes(normalizedQuery)
  );
}

export function dedupeVisitRestaurants(restaurants: RestaurantRecord[]): RestaurantRecord[] {
  const map = new Map<string, RestaurantRecord>();
  for (const restaurant of restaurants) {
    if (!map.has(restaurant.id)) {
      map.set(restaurant.id, restaurant);
    }
  }

  return Array.from(map.values());
}

export function withVisitRestaurantDistance(
  restaurants: RestaurantRecord[],
  referenceCoords: VisitRestaurantReferenceCoords | null,
): VisitRestaurantWithDistance[] {
  return restaurants
    .map((restaurant) => {
      if (
        !referenceCoords ||
        typeof restaurant.latitude !== 'number' ||
        typeof restaurant.longitude !== 'number'
      ) {
        return { restaurant, distance: null };
      }

      return {
        restaurant,
        distance: calculateDistance(
          referenceCoords.lat,
          referenceCoords.lng,
          restaurant.latitude,
          restaurant.longitude,
        ),
      };
    })
    .sort((left, right) => {
      if (left.distance === null && right.distance === null) {
        return left.restaurant.name.localeCompare(right.restaurant.name);
      }

      if (left.distance === null) {
        return 1;
      }

      if (right.distance === null) {
        return -1;
      }

      if (left.distance === right.distance) {
        return left.restaurant.name.localeCompare(right.restaurant.name);
      }

      return left.distance - right.distance;
    });
}

export function prioritizeSelectedVisitRestaurant(
  restaurants: VisitRestaurantWithDistance[],
  selectedRestaurantId: string | null,
): VisitRestaurantWithDistance[] {
  if (!selectedRestaurantId) {
    return restaurants;
  }

  const selected = restaurants.find(({ restaurant }) => restaurant.id === selectedRestaurantId);
  if (!selected) {
    return restaurants;
  }

  return [selected, ...restaurants.filter(({ restaurant }) => restaurant.id !== selectedRestaurantId)];
}

export function buildVisitRestaurantDescription(
  restaurant: RestaurantRecord,
  distance: number | null,
): string {
  const parts: string[] = [];

  const location = restaurant.location ?? restaurant.city;
  if (location) {
    parts.push(location);
  }

  if (restaurant.cuisineType) {
    parts.push(restaurant.cuisineType);
  }

  if (distance !== null) {
    parts.push(formatDistance(distance));
  }

  return parts.join(' • ') || 'Restaurant';
}
