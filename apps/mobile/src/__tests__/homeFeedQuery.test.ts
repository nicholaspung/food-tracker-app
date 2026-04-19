import { QueryClient } from '@tanstack/react-query';

import {
  getLegacyHomeFeedPlaceholderData,
  homeFeedQueryKeys,
  isPaginatedHomeFeedQueryKey,
  type HomeFeedInfiniteData,
} from '../features/store/homeFeedQuery';
import { HOME_FEED_DEFAULT_SORTS } from '../features/store/homeFeedPagination';

function createVisitEntry(id: string, eventAt: string, visitItemId: string) {
  return {
    eventAt,
    source: 'visit' as const,
    visit: {
      createdAt: eventAt,
      id,
      items: [
        {
          id: visitItemId,
          name: `Dish ${visitItemId}`,
          rating: 4,
        },
      ],
      restaurantName: `Restaurant ${id}`,
      source: 'visit' as const,
      updatedAt: eventAt,
      visitedAt: eventAt,
    },
  };
}

function createQuickTrackEntry(id: string, eventAt: string) {
  return {
    eventAt,
    quickTrack: {
      createdAt: eventAt,
      id,
      itemName: `Quick ${id}`,
      rating: 3,
      restaurantName: 'Quick Track',
      updatedAt: eventAt,
    },
    source: 'quick-track' as const,
  };
}

describe('home feed query helpers', () => {
  it('defaults every home feed scope to created sorting', () => {
    expect(HOME_FEED_DEFAULT_SORTS).toEqual({
      all: 'created',
      friends: 'created',
      mine: 'created',
    });
  });

  it('recognizes both new and legacy paginated home feed query keys', () => {
    expect(isPaginatedHomeFeedQueryKey(homeFeedQueryKeys.paginated('mine', 'visits', 'created', 'ramen'))).toBe(true);
    expect(isPaginatedHomeFeedQueryKey(['feature', 'homeFeed', 'paginated', 'mine', 'visits', 'ramen'])).toBe(true);
    expect(
      isPaginatedHomeFeedQueryKey(['feature', 'homeFeed', 'paginated', 'mine', 'visits', 'invalid-sort', 'ramen']),
    ).toBe(false);
  });

  it('reuses exact legacy no-sort cache entries for the same scope, filter, and search', () => {
    const queryClient = new QueryClient();
    const legacyData: HomeFeedInfiniteData = {
      pageParams: [undefined],
      pages: [
        {
          cursor: undefined,
          hasNextPage: false,
          items: [createVisitEntry('visit_1', '2026-04-12T10:00:00.000Z', 'item_1')],
          photoPreviews: [],
          totalQuickTracks: 0,
          totalVisits: 1,
        },
      ],
    };

    queryClient.setQueryData(['feature', 'homeFeed', 'paginated', 'mine', 'visits', 'pizza'], legacyData);

    expect(getLegacyHomeFeedPlaceholderData(queryClient, 'mine', 'visits', 'tracked', 'pizza')).toEqual(legacyData);
  });

  it('derives a safe visits-only placeholder from legacy all-cache for the default visits view', () => {
    const queryClient = new QueryClient();
    const legacyAllData: HomeFeedInfiniteData = {
      pageParams: [undefined, { page: 2 }],
      pages: [
        {
          cursor: { page: 2 },
          hasNextPage: true,
          items: [
            createVisitEntry('visit_1', '2026-04-12T10:00:00.000Z', 'item_1'),
            createQuickTrackEntry('quick_1', '2026-04-11T10:00:00.000Z'),
          ],
          photoPreviews: [
            { created: '2026-04-12T10:00:00.000Z', food_item: 'item_1', id: 'photo_1', photo: 'visit-1.jpg' },
            { created: '2026-04-11T10:00:00.000Z', food_item: 'quick_1', id: 'photo_2', photo: 'quick-1.jpg' },
          ],
          totalQuickTracks: 1,
          totalVisits: 2,
        },
        {
          cursor: undefined,
          hasNextPage: false,
          items: [createVisitEntry('visit_2', '2026-04-10T10:00:00.000Z', 'item_2')],
          photoPreviews: [
            { created: '2026-04-10T10:00:00.000Z', food_item: 'item_2', id: 'photo_3', photo: 'visit-2.jpg' },
          ],
        },
      ],
    };

    queryClient.setQueryData(['feature', 'homeFeed', 'paginated', 'mine', 'all', ''], legacyAllData);

    expect(getLegacyHomeFeedPlaceholderData(queryClient, 'mine', 'visits', 'created', '')).toEqual({
      pageParams: [undefined],
      pages: [
        {
          cursor: undefined,
          hasNextPage: false,
          items: [
            createVisitEntry('visit_1', '2026-04-12T10:00:00.000Z', 'item_1'),
            createVisitEntry('visit_2', '2026-04-10T10:00:00.000Z', 'item_2'),
          ],
          photoPreviews: [
            { created: '2026-04-12T10:00:00.000Z', food_item: 'item_1', id: 'photo_1', photo: 'visit-1.jpg' },
            { created: '2026-04-10T10:00:00.000Z', food_item: 'item_2', id: 'photo_3', photo: 'visit-2.jpg' },
          ],
          totalQuickTracks: 0,
          totalVisits: 2,
        },
      ],
    });
  });

  it('does not derive a visits-only placeholder when the requested sort differs from the legacy default', () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(['feature', 'homeFeed', 'paginated', 'friends', 'all', ''], {
      pageParams: [undefined],
      pages: [
        {
          cursor: undefined,
          hasNextPage: false,
          items: [createQuickTrackEntry('quick_1', '2026-04-11T10:00:00.000Z')],
          photoPreviews: [],
          totalQuickTracks: 1,
          totalVisits: 0,
        },
      ],
    } satisfies HomeFeedInfiniteData);

    expect(getLegacyHomeFeedPlaceholderData(queryClient, 'friends', 'visits', 'created', '')).toBeUndefined();
  });
});
