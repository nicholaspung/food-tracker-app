import {
  getHomeFeedScopeFromQueryKey,
  homeFeedQueryKeys,
  isPaginatedHomeFeedQueryKey,
} from '../features/store/homeFeedQuery';
import { HOME_FEED_DEFAULT_SORTS } from '../features/store/homeFeedPagination';

describe('home feed query helpers', () => {
  it('defaults every home feed scope to created sorting', () => {
    expect(HOME_FEED_DEFAULT_SORTS).toEqual({
      all: 'created',
      friends: 'created',
      mine: 'created',
    });
  });

  it('recognizes the current paginated home feed query keys', () => {
    const mineKey = homeFeedQueryKeys.paginated('user-1', 'mine', 'food-products', 'created', 'ramen');
    const friendsKey = homeFeedQueryKeys.paginated('user-1', 'friends', 'visits', 'tracked', 'soup');

    expect(mineKey).toEqual([
      'feature',
      'homeFeed',
      'user',
      'user-1',
      'paginated',
      'mine',
      'food-products',
      'created',
      'ramen',
    ]);
    expect(
      isPaginatedHomeFeedQueryKey(mineKey),
    ).toBe(true);
    expect(isPaginatedHomeFeedQueryKey(friendsKey)).toBe(true);
    expect(getHomeFeedScopeFromQueryKey(friendsKey)).toBe('friends');
    expect(homeFeedQueryKeys.paginated('user-1', 'friends', 'visits', 'tracked', 'soup')).not.toEqual(
      homeFeedQueryKeys.paginated('user-2', 'friends', 'visits', 'tracked', 'soup'),
    );
    expect(
      isPaginatedHomeFeedQueryKey(['feature', 'homeFeed', 'paginated', 'mine', 'visits', 'invalid-sort', 'ramen']),
    ).toBe(false);
    expect(isPaginatedHomeFeedQueryKey(['feature', 'homeFeed', 'paginated', 'mine', 'visits', 'ramen'])).toBe(false);
    expect(
      isPaginatedHomeFeedQueryKey(['feature', 'homeFeed', 'paginated', 'mine', 'quick-track', 'created', 'ramen']),
    ).toBe(false);
  });
});
