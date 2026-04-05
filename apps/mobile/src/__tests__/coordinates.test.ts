import {
  formatCoordinateLabel,
  formatCoordinateText,
  parseCoordinateString,
} from '../lib/coordinates';

describe('coordinates helpers', () => {
  it('parses latitude and longitude pairs', () => {
    expect(parseCoordinateString('37.7749, -122.4194')).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
    });
  });

  it('returns null for non-coordinate values', () => {
    expect(parseCoordinateString('Golden Gate Park')).toBeNull();
  });

  it('formats coordinate pairs with the requested precision', () => {
    expect(
      formatCoordinateLabel(
        { latitude: 37.7749, longitude: -122.4194 },
        6,
      ),
    ).toBe('37.774900, -122.419400');
  });

  it('preserves non-coordinate text when formatting labels', () => {
    expect(formatCoordinateText('Golden Gate Park', 4)).toBe('Golden Gate Park');
  });
});
