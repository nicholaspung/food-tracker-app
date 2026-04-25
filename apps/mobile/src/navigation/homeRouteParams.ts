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
  focusVisitId?: string;
  focusReason?: 'visit-created';
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

export function buildVisitCreatedHomeParams(visitId: string): {
  initialView: HomeInitialViewParams;
} {
  return {
    initialView: {
      feedMode: 'mine',
      typeFilter: 'visits',
      sortFilter: 'created',
      searchQuery: '',
      filtersExpanded: true,
      focusVisitId: visitId,
      focusReason: 'visit-created',
    },
  };
}
