import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import type { FriendsCountSummary } from './featureStore';
import type { FriendsPageResult, ListFriendsPageInput } from './friendsStore';

export type FriendsSection = NonNullable<ListFriendsPageInput['section']>;

export type FriendsPaginatedQueryKey =
  | readonly ['feature', 'friends', 'paginated', FriendsSection]
  | readonly ['feature', 'friends', 'paginated', FriendsSection, string];

const FRIENDS_SECTIONS = ['friends', 'requests', 'sent'] as const;

export const friendsQueryKeys = {
  root: ['feature', 'friends'] as const,
  summary: ['feature', 'friends', 'summary'] as const,
  paginated: (section: FriendsSection, search?: string): FriendsPaginatedQueryKey => {
    const normalizedSearch = search?.trim() ?? '';
    if (!normalizedSearch) {
      return ['feature', 'friends', 'paginated', section];
    }

    return ['feature', 'friends', 'paginated', section, normalizedSearch];
  },
};

export function isPaginatedFriendsQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    (queryKey.length === 4 || queryKey.length === 5) &&
    queryKey[0] === friendsQueryKeys.root[0] &&
    queryKey[1] === friendsQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    typeof queryKey[3] === 'string' &&
    FRIENDS_SECTIONS.includes(queryKey[3] as FriendsSection) &&
    (queryKey.length === 4 || typeof queryKey[4] === 'string')
  );
}

export function isFriendsSummaryQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === friendsQueryKeys.summary.length &&
    friendsQueryKeys.summary.every((segment, index) => queryKey[index] === segment)
  );
}

function isInfiniteFriendsPageData(
  data: InfiniteData<FriendsPageResult, unknown> | FriendsPageResult,
): data is InfiniteData<FriendsPageResult, unknown> {
  return 'pages' in data && Array.isArray(data.pages);
}

export function selectFriendsSummary(
  data: InfiniteData<FriendsPageResult, unknown> | FriendsPageResult | undefined,
): FriendsCountSummary | undefined {
  if (!data) {
    return undefined;
  }

  if (isInfiniteFriendsPageData(data)) {
    return data.pages.find((page) => page.summary)?.summary;
  }

  return data.summary;
}
