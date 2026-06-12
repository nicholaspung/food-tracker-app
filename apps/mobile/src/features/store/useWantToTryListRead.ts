import { useQuery } from '@tanstack/react-query';

import { restaurantListQueryKeys } from './restaurantListQuery';
import {
  getDefaultRestaurantList,
  getRestaurantListDetail,
} from './restaurantListsStore';

const PENDING_DEFAULT_LIST_ID = '__default_list_pending__';

export function useWantToTryListRead() {
  const defaultListQuery = useQuery({
    queryKey: restaurantListQueryKeys.defaultList,
    queryFn: ({ signal }) => getDefaultRestaurantList({ signal }),
  });
  const defaultListId = defaultListQuery.data?.id;
  const defaultListDetailQuery = useQuery({
    enabled: Boolean(defaultListId),
    queryKey: defaultListId
      ? restaurantListQueryKeys.detail(defaultListId)
      : restaurantListQueryKeys.detail(PENDING_DEFAULT_LIST_ID),
    queryFn: ({ signal }) => defaultListId ? getRestaurantListDetail(defaultListId, { signal }) : null,
  });

  return {
    defaultList: defaultListQuery.data ?? null,
    defaultListDetail: defaultListDetailQuery.data ?? null,
    defaultListDetailQuery,
    defaultListId,
    defaultListQuery,
  };
}
