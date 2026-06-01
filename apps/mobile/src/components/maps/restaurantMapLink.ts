import { Platform } from 'react-native';

import type { RestaurantMapGroup } from './restaurantMapTypes';

function encodeMapComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildRestaurantMapUrl(group: RestaurantMapGroup): string {
  const encodedLabel = encodeMapComponent(group.restaurantName);
  const queryText = `${group.restaurantName} ${group.restaurantLocation ?? ''}`.trim();
  const encodedQueryText = encodeMapComponent(queryText);
  const coordinates = `${group.latitude},${group.longitude}`;
  const encodedCoordinates = encodeMapComponent(coordinates);

  if (Platform.OS === 'android') {
    if (group.restaurantLocation?.trim()) {
      return `geo:${coordinates}?q=${encodedQueryText}`;
    }

    return `geo:0,0?q=${encodedCoordinates}(${encodedLabel})`;
  }

  return `https://maps.apple.com/?q=${encodedQueryText}&ll=${encodedCoordinates}`;
}
