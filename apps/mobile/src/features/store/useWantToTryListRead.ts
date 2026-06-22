import { useQuery } from '@tanstack/react-query';

import { restaurantListQueryKeys } from './restaurantListQuery';
import type { RestaurantListDetailRecord } from './featureStore';
import {
  getDefaultRestaurantList,
  getRestaurantListDetail,
} from './restaurantListsStore';

const PENDING_DEFAULT_LIST_ID = '__default_list_pending__';
const WANT_TO_TRY_DETAIL_PAGE_SIZE = 50;

interface UseWantToTryListReadOptions {
  includeDetail?: boolean;
}

function mergeRestaurantListDetailPages(
  current: RestaurantListDetailRecord,
  nextPage: RestaurantListDetailRecord,
): RestaurantListDetailRecord {
  return {
    ...nextPage,
    list: current.list ?? nextPage.list,
    items: [...current.items, ...nextPage.items],
    bookmarkState: {
      savedListIdsByBookmarkLookupId: {
        ...current.bookmarkState.savedListIdsByBookmarkLookupId,
        ...nextPage.bookmarkState.savedListIdsByBookmarkLookupId,
      },
    },
    photoPreviews: [...current.photoPreviews, ...nextPage.photoPreviews],
    viewerLists: nextPage.viewerLists.length > 0 ? nextPage.viewerLists : current.viewerLists,
  };
}

async function getCompleteRestaurantListDetail(
  listId: string,
  signal: AbortSignal,
): Promise<RestaurantListDetailRecord | null> {
  let page = 1;
  let detail: RestaurantListDetailRecord | null = null;

  while (true) {
    const nextPage = await getRestaurantListDetail(listId, {
      page,
      pageSize: WANT_TO_TRY_DETAIL_PAGE_SIZE,
      signal,
    });
    detail = detail ? mergeRestaurantListDetailPages(detail, nextPage) : nextPage;

    if (!nextPage.hasNextPage) {
      return detail;
    }

    page = (nextPage.page ?? page) + 1;
  }
}

export function useWantToTryListRead(options: UseWantToTryListReadOptions = {}) {
  const includeDetail = options.includeDetail ?? true;
  const defaultListQuery = useQuery({
    queryKey: restaurantListQueryKeys.defaultList,
    queryFn: ({ signal }) => getDefaultRestaurantList({ signal }),
  });
  const defaultListId = defaultListQuery.data?.id;
  const defaultListDetailQuery = useQuery({
    enabled: includeDetail && Boolean(defaultListId),
    queryKey: defaultListId
      ? restaurantListQueryKeys.detail(defaultListId)
      : restaurantListQueryKeys.detail(PENDING_DEFAULT_LIST_ID),
    queryFn: ({ signal }) =>
      defaultListId ? getCompleteRestaurantListDetail(defaultListId, signal) : null,
  });

  return {
    defaultList: defaultListQuery.data ?? null,
    defaultListDetail: defaultListDetailQuery.data ?? null,
    defaultListDetailQuery,
    defaultListId,
    defaultListQuery,
  };
}
