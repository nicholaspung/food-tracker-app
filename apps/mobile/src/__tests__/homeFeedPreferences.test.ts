import {
  buildHomeFeedDefaultsUpdate,
  mapHomeFeedDefaultsFromRecord,
  normalizeHomeFeedMode,
  normalizeHomeFeedSort,
  normalizeHomeFeedTypeFilter,
} from '../features/store/homeFeedPreferences';

describe('home feed preferences', () => {
  it('preserves valid preference values', () => {
    expect(normalizeHomeFeedMode('friends')).toBe('friends');
    expect(normalizeHomeFeedTypeFilter('all')).toBe('all');
    expect(normalizeHomeFeedTypeFilter('food-products')).toBe('food-products');
    expect(normalizeHomeFeedSort('tracked')).toBe('tracked');
  });

  it('falls back to current product defaults for missing or invalid values', () => {
    expect(normalizeHomeFeedMode('all')).toBe('mine');
    expect(normalizeHomeFeedTypeFilter('unknown')).toBe('visits');
    expect(normalizeHomeFeedSort('updated')).toBe('created');
    expect(mapHomeFeedDefaultsFromRecord(null)).toEqual({
      homeFeedMode: 'mine',
      homeFeedTypeFilter: 'visits',
      homeFeedSort: 'created',
    });
  });

  it('maps partial records and builds user-record updates', () => {
    const defaults = mapHomeFeedDefaultsFromRecord({
      defaultHomeFeedMode: 'friends',
      defaultHomeFeedTypeFilter: 'invalid',
      defaultHomeFeedSort: 'tracked',
    });

    expect(defaults).toEqual({
      homeFeedMode: 'friends',
      homeFeedTypeFilter: 'visits',
      homeFeedSort: 'tracked',
    });
    expect(buildHomeFeedDefaultsUpdate(defaults)).toEqual({
      defaultHomeFeedMode: 'friends',
      defaultHomeFeedTypeFilter: 'visits',
      defaultHomeFeedSort: 'tracked',
    });
  });
});
