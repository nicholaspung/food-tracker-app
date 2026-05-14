import type { FoodProductRecord, VisitRecord } from '../models';
import type {
  HomeFeedPhotoPreviewRecord,
  HomeFeedScope,
  HomeFeedSort,
  HomeFeedTypeFilter,
} from './homeFeedPagination';
import { sendApiRequest } from './pocketbaseGateway';

export type HomeFeedMapPoint =
  | {
      id: string;
      source: 'visit';
      eventAt: string;
      latitude: number;
      longitude: number;
      restaurantId: string;
      restaurantName: string;
      restaurantLocation?: string;
      ratingSummaryLabel: string;
      visit: VisitRecord;
    }
  | {
      id: string;
      source: 'food-product';
      eventAt: string;
      latitude: number;
      longitude: number;
      restaurantId?: string;
      restaurantName: string;
      restaurantLocation?: string;
      locationText?: string;
      ratingSummaryLabel: string;
      foodProduct: FoodProductRecord;
    };

export interface HomeFeedMapPointsResult {
  points: HomeFeedMapPoint[];
  photoPreviews: HomeFeedPhotoPreviewRecord[];
  omittedWithoutCoordinates: number;
  totalEntries: number;
}

export const homeFeedMapQueryKeys = {
  root: ['feature', 'homeFeedMap'] as const,
  points: (
    userId: string | null | undefined,
    scope: HomeFeedScope,
    typeFilter: HomeFeedTypeFilter,
    sort: HomeFeedSort,
    searchQuery: string,
  ) =>
    [
      'feature',
      'homeFeedMap',
      'user',
      userId ?? 'anonymous',
      'points',
      scope,
      typeFilter,
      sort,
      searchQuery.trim(),
    ] as const,
};

export interface ListHomeFeedMapPointsInput {
  scope: HomeFeedScope;
  typeFilter: HomeFeedTypeFilter;
  sort: HomeFeedSort;
  search?: string;
  signal?: AbortSignal;
}

function hasUsableCoordinates(point: HomeFeedMapPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180 &&
    !(point.latitude === 0 && point.longitude === 0)
  );
}

export async function listHomeFeedMapPoints(
  input: ListHomeFeedMapPointsInput,
): Promise<HomeFeedMapPointsResult> {
  const query = new URLSearchParams({
    scope: input.scope,
    typeFilter: input.typeFilter,
    sort: input.sort,
  });
  const trimmedSearch = input.search?.trim();
  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  const response = await sendApiRequest<HomeFeedMapPointsResult>(
    `/api/home-feed/map-points?${query.toString()}`,
    {
      method: 'GET',
      signal: input.signal,
    },
  );

  return {
    omittedWithoutCoordinates: response.omittedWithoutCoordinates ?? 0,
    photoPreviews: response.photoPreviews ?? [],
    points: (response.points ?? []).filter(hasUsableCoordinates),
    totalEntries: response.totalEntries ?? 0,
  };
}
