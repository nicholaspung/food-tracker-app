import type { FoodProductRecord, VisitRecord } from '../models';
import type {
  HomeFeedPhotoPreviewRecord,
  HomeFeedScope,
  HomeFeedSort,
  HomeFeedTypeFilter,
} from './homeFeedPagination';
import type { HomeFeedMapViewport } from './homeFeedMapViewport';
import { sendApiRequest } from './pocketbaseGateway';

export interface HomeFeedMapMarker {
  id: string;
  recordId: string;
  source: 'visit' | 'food-product';
  eventAt: string;
  latitude: number;
  longitude: number;
  restaurantId?: string;
  restaurantName: string;
  restaurantLocation?: string;
  locationText?: string;
}

export type HomeFeedMapPointDetail =
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

export type HomeFeedMapPoint = HomeFeedMapPointDetail;

export interface HomeFeedMapPointsResult {
  points: HomeFeedMapMarker[];
  omittedWithoutCoordinates: number;
  totalEntries: number;
}

export interface HomeFeedMapPointDetailsResult {
  points: HomeFeedMapPointDetail[];
  photoPreviews: HomeFeedPhotoPreviewRecord[];
}

export const homeFeedMapQueryKeys = {
  root: ['feature', 'homeFeedMap'] as const,
  points: (
    userId: string | null | undefined,
    scope: HomeFeedScope,
    typeFilter: HomeFeedTypeFilter,
    sort: HomeFeedSort,
    searchQuery: string,
    viewportIdentity: string,
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
      viewportIdentity,
    ] as const,
  detail: (
    userId: string | null | undefined,
    pointIds: string[],
    scope: HomeFeedScope,
    typeFilter: HomeFeedTypeFilter,
    sort: HomeFeedSort,
    searchQuery: string,
    viewportIdentity: string,
  ) =>
    [
      'feature',
      'homeFeedMap',
      'user',
      userId ?? 'anonymous',
      'detail',
      Array.from(new Set(pointIds.map((pointId) => pointId.trim()).filter(Boolean))).sort().join('|'),
      scope,
      typeFilter,
      sort,
      searchQuery.trim(),
      viewportIdentity,
    ] as const,
};

export interface ListHomeFeedMapPointsInput {
  scope: HomeFeedScope;
  typeFilter: HomeFeedTypeFilter;
  sort: HomeFeedSort;
  search?: string;
  signal?: AbortSignal;
  viewport: HomeFeedMapViewport;
}

export interface ListHomeFeedMapPointDetailsInput {
  points: { recordId: string; source: 'visit' | 'food-product' }[];
  scope: HomeFeedScope;
  search?: string;
  signal?: AbortSignal;
  sort: HomeFeedSort;
  typeFilter: HomeFeedTypeFilter;
  viewport: HomeFeedMapViewport;
}

function hasUsableCoordinates(point: HomeFeedMapMarker): boolean {
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
  query.set('north', String(input.viewport.north));
  query.set('south', String(input.viewport.south));
  query.set('west', String(input.viewport.west));
  query.set('east', String(input.viewport.east));

  const response = await sendApiRequest<HomeFeedMapPointsResult>(
    `/api/home-feed/map-points?${query.toString()}`,
    {
      method: 'GET',
      signal: input.signal,
    },
  );

  return {
    omittedWithoutCoordinates: response.omittedWithoutCoordinates ?? 0,
    points: (response.points ?? []).filter(hasUsableCoordinates),
    totalEntries: response.totalEntries ?? 0,
  };
}

export async function listHomeFeedMapPointDetails(
  input: ListHomeFeedMapPointDetailsInput,
): Promise<HomeFeedMapPointDetailsResult> {
  if (input.points.length === 0) {
    return { photoPreviews: [], points: [] };
  }

  const pointChunks: typeof input.points[] = [];
  for (let index = 0; index < input.points.length; index += 100) {
    pointChunks.push(input.points.slice(index, index + 100));
  }
  const responses = await Promise.all(pointChunks.map((points) =>
    sendApiRequest<HomeFeedMapPointDetailsResult>('/api/home-feed/map-point-details', {
      body: {
        east: input.viewport.east,
        north: input.viewport.north,
        points,
        scope: input.scope,
        search: input.search?.trim() || '',
        sort: input.sort,
        south: input.viewport.south,
        typeFilter: input.typeFilter,
        west: input.viewport.west,
      },
      method: 'POST',
      signal: input.signal,
    })));
  const pointIds = new Set<string>();
  const photoIds = new Set<string>();

  return responses.reduce<HomeFeedMapPointDetailsResult>((result, response) => {
    for (const point of response.points ?? []) {
      if (!pointIds.has(point.id)) {
        pointIds.add(point.id);
        result.points.push(point);
      }
    }
    for (const photo of response.photoPreviews ?? []) {
      if (!photoIds.has(photo.id)) {
        photoIds.add(photo.id);
        result.photoPreviews.push(photo);
      }
    }
    return result;
  }, { photoPreviews: [], points: [] });
}
