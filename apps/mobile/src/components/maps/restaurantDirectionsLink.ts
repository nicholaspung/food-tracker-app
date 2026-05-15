import { Platform } from 'react-native';

import type { RestaurantMapGroup } from './restaurantMapTypes';

function encodeMapComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildRestaurantDirectionsUrl(group: RestaurantMapGroup): string {
  const encodedLabel = encodeMapComponent(group.restaurantName);
  const destinationText = `${group.restaurantName} ${group.restaurantLocation ?? ''}`.trim();
  const encodedDestinationText = encodeMapComponent(destinationText);
  const coordinates = `${group.latitude},${group.longitude}`;

  if (Platform.OS === 'android') {
    if (group.restaurantLocation?.trim()) {
      return `geo:0,0?q=${encodedDestinationText}`;
    }

    return `geo:${coordinates}?q=${coordinates}(${encodedLabel})`;
  }

  if (group.restaurantLocation?.trim()) {
    return `https://maps.apple.com/?daddr=${encodedDestinationText}&q=${encodedLabel}&dirflg=d`;
  }

  return `https://maps.apple.com/?daddr=${coordinates}&q=${encodedLabel}&dirflg=d`;
}
