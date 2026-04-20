import type {
  FeedModeValue,
  FeedTypeFilterValue,
  HomeFeedSortValue,
} from '../components/shared';

export interface HomeInitialViewParams {
  feedMode: FeedModeValue;
  typeFilter: FeedTypeFilterValue;
  sortFilter: HomeFeedSortValue;
  searchQuery: string;
  filtersExpanded: boolean;
}

export function buildFoodProductCreatedHomeParams(): {
  initialView: HomeInitialViewParams;
} {
  return {
    initialView: {
      feedMode: 'mine',
      typeFilter: 'food-products',
      sortFilter: 'created',
      searchQuery: '',
      filtersExpanded: true,
    },
  };
}
