import type { FoodProductRecord, VisitRecord } from '../models';
import { getAuthenticatedUserIdOrNull, sendApiRequest } from './pocketbaseGateway';

export type HomeFeedScope = 'all' | 'mine' | 'friends';
export type HomeFeedTypeFilter = 'all' | 'visits' | 'food-products';
export type HomeFeedSort = 'created' | 'tracked';

export const HOME_FEED_DEFAULT_SORTS: Record<HomeFeedScope, HomeFeedSort> = {
  all: 'created',
  mine: 'created',
  friends: 'created',
};

interface SourcePageResult<T> {
  items: T[];
  totalItems: number;
  hasNextPage: boolean;
}

export interface HomeFeedSourceCursorState<T> {
  buffer: T[];
  exhausted: boolean;
  nextOffset: number;
  totalItems: number | null;
}

export interface BufferedHomeFeedCursor<TVisit, TFoodProduct> {
  visits: HomeFeedSourceCursorState<TVisit>;
  foodProducts: HomeFeedSourceCursorState<TFoodProduct>;
}

export type BufferedHomeFeedEntry<TVisit, TFoodProduct> =
  | {
      source: 'visit';
      eventAt: string;
      visit: TVisit;
    }
  | {
      source: 'food-product';
      eventAt: string;
      foodProduct: TFoodProduct;
    };

export interface HomeFeedCursor {
  page: number;
}
export type HomeFeedPageEntry = BufferedHomeFeedEntry<VisitRecord, FoodProductRecord>;

export interface HomeFeedPhotoPreviewRecord {
  id: string;
  food_item?: string;
  photo: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
}

export interface HomeFeedPageResult {
  items: HomeFeedPageEntry[];
  photoPreviews?: HomeFeedPhotoPreviewRecord[];
  cursor?: HomeFeedCursor;
  hasNextPage: boolean;
  totalFoodProducts?: number;
  totalVisits?: number;
}

export interface ListHomeFeedPageInput {
  cursor?: HomeFeedCursor;
  pageSize?: number;
  scope?: HomeFeedScope;
  search?: string;
  signal?: AbortSignal;
  sort?: HomeFeedSort;
  typeFilter?: HomeFeedTypeFilter;
}

export interface LoadHomeFeedPageWithSourcesInput<TVisit, TFoodProduct> {
  cursor?: BufferedHomeFeedCursor<TVisit, TFoodProduct>;
  fetchFoodProductsPage?: (page: number, pageSize: number) => Promise<SourcePageResult<TFoodProduct>>;
  fetchVisitsPage?: (page: number, pageSize: number) => Promise<SourcePageResult<TVisit>>;
  getFoodProductEventAt: (item: TFoodProduct) => string;
  getVisitEventAt: (item: TVisit) => string;
  loadFoodProducts: boolean;
  loadVisits: boolean;
  pageSize: number;
  foodProductBatchSize: number;
  visitBatchSize: number;
}

const DEFAULT_HOME_FEED_PAGE_SIZE = 20;

function createSourceState<T>(overrides?: Partial<HomeFeedSourceCursorState<T>>): HomeFeedSourceCursorState<T> {
  return {
    buffer: overrides?.buffer ? [...overrides.buffer] : [],
    exhausted: overrides?.exhausted ?? false,
    nextOffset: overrides?.nextOffset ?? 0,
    totalItems: overrides?.totalItems ?? null,
  };
}

function hasRemainingItems<T>(state: HomeFeedSourceCursorState<T>): boolean {
  return state.buffer.length > 0 || !state.exhausted;
}

async function ensureBufferedItems<T>(
  state: HomeFeedSourceCursorState<T>,
  batchSize: number,
  fetchPage?: (page: number, pageSize: number) => Promise<SourcePageResult<T>>,
): Promise<HomeFeedSourceCursorState<T>> {
  if (!fetchPage || batchSize < 1 || state.exhausted || state.buffer.length > 0) {
    return state;
  }

  const page = Math.floor(state.nextOffset / batchSize) + 1;
  const pageResult = await fetchPage(page, batchSize);
  const fetchedCount = pageResult.items.length;
  const nextOffset = state.nextOffset + fetchedCount;

  return {
    buffer: [...state.buffer, ...pageResult.items],
    exhausted: fetchedCount === 0 || nextOffset >= pageResult.totalItems || !pageResult.hasNextPage,
    nextOffset,
    totalItems: pageResult.totalItems,
  };
}

function normalizePageSize(pageSize: number | undefined): number {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) {
    return DEFAULT_HOME_FEED_PAGE_SIZE;
  }

  return Math.max(1, Math.floor(pageSize));
}

export async function loadHomeFeedPageWithSources<TVisit, TFoodProduct>(
  input: LoadHomeFeedPageWithSourcesInput<TVisit, TFoodProduct>,
): Promise<{
  items: BufferedHomeFeedEntry<TVisit, TFoodProduct>[];
  cursor?: BufferedHomeFeedCursor<TVisit, TFoodProduct>;
  hasNextPage: boolean;
  totalFoodProducts: number;
  totalVisits: number;
}> {
  const pageSize = normalizePageSize(input.pageSize);
  let visitState = input.loadVisits
    ? createSourceState(input.cursor?.visits)
    : createSourceState<TVisit>({ exhausted: true, totalItems: 0 });
  let foodProductState = input.loadFoodProducts
    ? createSourceState(input.cursor?.foodProducts)
    : createSourceState<TFoodProduct>({ exhausted: true, totalItems: 0 });
  const items: BufferedHomeFeedEntry<TVisit, TFoodProduct>[] = [];

  while (items.length < pageSize) {
    [visitState, foodProductState] = await Promise.all([
      ensureBufferedItems(visitState, input.visitBatchSize, input.fetchVisitsPage),
      ensureBufferedItems(foodProductState, input.foodProductBatchSize, input.fetchFoodProductsPage),
    ]);

    const nextVisit = visitState.buffer[0];
    const nextFoodProduct = foodProductState.buffer[0];

    if (!nextVisit && !nextFoodProduct) {
      break;
    }

    if (!nextFoodProduct) {
      visitState.buffer.shift();
      items.push({
        eventAt: input.getVisitEventAt(nextVisit as TVisit),
        source: 'visit',
        visit: nextVisit as TVisit,
      });
      continue;
    }

    if (!nextVisit) {
      foodProductState.buffer.shift();
      items.push({
        eventAt: input.getFoodProductEventAt(nextFoodProduct as TFoodProduct),
        foodProduct: nextFoodProduct as TFoodProduct,
        source: 'food-product',
      });
      continue;
    }

    const visitEventAt = input.getVisitEventAt(nextVisit);
    const foodProductEventAt = input.getFoodProductEventAt(nextFoodProduct);

    if (visitEventAt.localeCompare(foodProductEventAt) >= 0) {
      visitState.buffer.shift();
      items.push({
        eventAt: visitEventAt,
        source: 'visit',
        visit: nextVisit,
      });
      continue;
    }

    foodProductState.buffer.shift();
    items.push({
      eventAt: foodProductEventAt,
      foodProduct: nextFoodProduct,
      source: 'food-product',
    });
  }

  const hasNextPage = hasRemainingItems(visitState) || hasRemainingItems(foodProductState);

  return {
    items,
    cursor: hasNextPage
      ? {
          foodProducts: createSourceState(foodProductState),
          visits: createSourceState(visitState),
        }
      : undefined,
    hasNextPage,
    totalFoodProducts: foodProductState.totalItems ?? 0,
    totalVisits: visitState.totalItems ?? 0,
  };
}

export async function listHomeFeedPage(input?: ListHomeFeedPageInput): Promise<HomeFeedPageResult> {
  if (!getAuthenticatedUserIdOrNull()) {
    return {
      items: [],
      photoPreviews: [],
      cursor: undefined,
      hasNextPage: false,
      totalFoodProducts: 0,
      totalVisits: 0,
    };
  }

  const pageSize = normalizePageSize(input?.pageSize);
  const scope = input?.scope ?? 'all';
  const trimmedSearch = input?.search?.trim() || undefined;
  const sort = input?.sort ?? HOME_FEED_DEFAULT_SORTS[scope];
  const typeFilter = input?.typeFilter ?? 'all';
  const page = input?.cursor?.page ?? 1;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    scope,
    typeFilter,
    sort,
  });

  if (trimmedSearch) {
    query.set('search', trimmedSearch);
  }

  const response = await sendApiRequest<HomeFeedPageResult>(`/api/home-feed?${query.toString()}`, {
    method: 'GET',
    signal: input?.signal,
  });

  return {
    ...response,
    photoPreviews: response.photoPreviews ?? [],
  };
}
