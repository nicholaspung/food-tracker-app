export interface Coordinates {
  latitude: number;
  longitude: number;
}

const COORDINATE_PATTERN = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

export function parseCoordinateString(value: string): Coordinates | null {
  const match = value.trim().match(COORDINATE_PATTERN);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function formatCoordinateLabel(
  coordinates: Coordinates,
  fractionDigits = 4,
): string {
  return `${coordinates.latitude.toFixed(fractionDigits)}, ${coordinates.longitude.toFixed(fractionDigits)}`;
}

export function formatCoordinateText(
  value: string,
  fractionDigits = 4,
): string {
  const coordinates = parseCoordinateString(value);
  if (!coordinates) {
    return value.trim();
  }

  return formatCoordinateLabel(coordinates, fractionDigits);
}
