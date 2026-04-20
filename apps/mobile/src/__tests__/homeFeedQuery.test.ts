import {
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
    expect(
      isPaginatedHomeFeedQueryKey(homeFeedQueryKeys.paginated('mine', 'food-products', 'created', 'ramen')),
    ).toBe(true);
    expect(isPaginatedHomeFeedQueryKey(homeFeedQueryKeys.paginated('friends', 'visits', 'tracked', 'soup'))).toBe(
      true,
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
