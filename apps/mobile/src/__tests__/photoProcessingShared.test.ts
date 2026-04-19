import { formatLocalDateLabel } from '../lib/dateFormatting';
import {
  collapseRestaurantOptionsToSelection,
  formatReviewEntryFooterLabel,
} from '../screens/photoProcessing/shared';

const reviewEntryDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

describe('formatReviewEntryFooterLabel', () => {
  it('returns a date-only label for valid timestamps', () => {
    const value = '2026-02-19T10:42:36.123Z';
    const expected = reviewEntryDateFormatter.format(new Date(value));

    const result = formatReviewEntryFooterLabel(value, '2026-02-19');

    expect(result).toBe(expected);
    expect(result).not.toContain('•');
  });

  it('falls back to the provided local date label when the timestamp is invalid', () => {
    const fallbackDate = '2026-02-19';

    expect(formatReviewEntryFooterLabel('invalid-date-value', fallbackDate)).toBe(
      formatLocalDateLabel(fallbackDate),
    );
  });
});

describe('collapseRestaurantOptionsToSelection', () => {
  it('returns the original arrays when no restaurant is selected', () => {
    const savedRestaurants = [
      {
        restaurant: {
          id: 'restaurant_1',
          name: 'Pasta Place',
        },
        distance: null,
      },
    ];
    const searchRestaurants = [
      {
        restaurant: {
          id: 'restaurant_2',
          name: 'Sushi Spot',
        },
        distance: 0.8,
      },
    ];

    const result = collapseRestaurantOptionsToSelection({
      savedRestaurants,
      searchRestaurants,
      selectedRestaurant: null,
    });

    expect(result.savedRestaurants).toBe(savedRestaurants);
    expect(result.searchRestaurants).toBe(searchRestaurants);
  });

  it('collapses both arrays to the selected restaurant entry', () => {
    const savedRestaurants = [
      {
        restaurant: {
          id: 'restaurant_1',
          name: 'Pasta Place',
        },
        distance: null,
      },
    ];
    const selectedSearchEntry = {
      restaurant: {
        id: 'restaurant_2',
        name: 'Sushi Spot',
      },
      distance: 0.8,
    };
    const searchRestaurants = [
      selectedSearchEntry,
      {
        restaurant: {
          id: 'restaurant_3',
          name: 'Burger Barn',
        },
        distance: 1.2,
      },
    ];

    const result = collapseRestaurantOptionsToSelection({
      savedRestaurants,
      searchRestaurants,
      selectedRestaurant: selectedSearchEntry.restaurant,
    });

    expect(result.savedRestaurants).toEqual([selectedSearchEntry]);
    expect(result.searchRestaurants).toEqual([selectedSearchEntry]);
    expect(result.savedRestaurants).toHaveLength(1);
    expect(result.searchRestaurants).toHaveLength(1);
  });

  it('renders a fallback selected restaurant when it is missing from current arrays', () => {
    const savedRestaurants = [
      {
        restaurant: {
          id: 'restaurant_1',
          name: 'Pasta Place',
        },
        distance: null,
      },
    ];
    const searchRestaurants = [
      {
        restaurant: {
          id: 'restaurant_2',
          name: 'Sushi Spot',
        },
        distance: 0.8,
      },
    ];
    const selectedRestaurant = {
      id: 'restaurant_missing',
      name: 'Hidden Cafe',
    };

    const result = collapseRestaurantOptionsToSelection({
      savedRestaurants,
      searchRestaurants,
      selectedRestaurant,
    });

    expect(result.savedRestaurants).toEqual([
      {
        restaurant: selectedRestaurant,
        distance: null,
      },
    ]);
    expect(result.searchRestaurants).toEqual([
      {
        restaurant: selectedRestaurant,
        distance: null,
      },
    ]);
  });
});
