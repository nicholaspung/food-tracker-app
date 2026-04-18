import type { QuickTrackRecord, VisitRecord } from '../models';
import { getAuthenticatedUserIdOrNull, sendApiRequest } from './pocketbaseGateway';

export type HomeFeedScope = 'all' | 'mine' | 'friends';
export type HomeFeedTypeFilter = 'all' | 'visits' | 'quick-track';
export type HomeFeedSort = 'created' | 'tracked';

export const HOME_FEED_DEFAULT_SORTS: Record<HomeFeedScope, HomeFeedSort> = {
  all: 'tracked',
  mine: 'created',
  friends: 'tracked',
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

export interface BufferedHomeFeedCursor<TVisit, TQuickTrack> {
  visits: HomeFeedSourceCursorState<TVisit>;
  quickTracks: HomeFeedSourceCursorState<TQuickTrack>;
}

export type BufferedHomeFeedEntry<TVisit, TQuickTrack> =
  | {
      source: 'visit';
      eventAt: string;
      visit: TVisit;
    }
  | {
      source: 'quick-track';
      eventAt: string;
      quickTrack: TQuickTrack;
    };

export interface HomeFeedCursor {
  page: number;
}
export type HomeFeedPageEntry = BufferedHomeFeedEntry<VisitRecord, QuickTrackRecord>;

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
  totalQuickTracks?: number;
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

export interface LoadHomeFeedPageWithSourcesInput<TVisit, TQuickTrack> {
  cursor?: BufferedHomeFeedCursor<TVisit, TQuickTrack>;
  fetchQuickTracksPage?: (page: number, pageSize: number) => Promise<SourcePageResult<TQuickTrack>>;
  fetchVisitsPage?: (page: number, pageSize: number) => Promise<SourcePageResult<TVisit>>;
  getQuickTrackEventAt: (item: TQuickTrack) => string;
  getVisitEventAt: (item: TVisit) => string;
  loadQuickTracks: boolean;
  loadVisits: boolean;
  pageSize: number;
  quickTrackBatchSize: number;
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

export async function loadHomeFeedPageWithSources<TVisit, TQuickTrack>(
  input: LoadHomeFeedPageWithSourcesInput<TVisit, TQuickTrack>,
): Promise<{
  items: BufferedHomeFeedEntry<TVisit, TQuickTrack>[];
  cursor?: BufferedHomeFeedCursor<TVisit, TQuickTrack>;
  hasNextPage: boolean;
  totalQuickTracks: number;
  totalVisits: number;
}> {
  const pageSize = normalizePageSize(input.pageSize);
  let visitState = input.loadVisits
    ? createSourceState(input.cursor?.visits)
    : createSourceState<TVisit>({ exhausted: true, totalItems: 0 });
  let quickTrackState = input.loadQuickTracks
    ? createSourceState(input.cursor?.quickTracks)
    : createSourceState<TQuickTrack>({ exhausted: true, totalItems: 0 });
  const items: BufferedHomeFeedEntry<TVisit, TQuickTrack>[] = [];

  while (items.length < pageSize) {
    [visitState, quickTrackState] = await Promise.all([
      ensureBufferedItems(visitState, input.visitBatchSize, input.fetchVisitsPage),
      ensureBufferedItems(quickTrackState, input.quickTrackBatchSize, input.fetchQuickTracksPage),
    ]);

    const nextVisit = visitState.buffer[0];
    const nextQuickTrack = quickTrackState.buffer[0];

    if (!nextVisit && !nextQuickTrack) {
      break;
    }

    if (!nextQuickTrack) {
      visitState.buffer.shift();
      items.push({
        eventAt: input.getVisitEventAt(nextVisit as TVisit),
        source: 'visit',
        visit: nextVisit as TVisit,
      });
      continue;
    }

    if (!nextVisit) {
      quickTrackState.buffer.shift();
      items.push({
        eventAt: input.getQuickTrackEventAt(nextQuickTrack as TQuickTrack),
        quickTrack: nextQuickTrack as TQuickTrack,
        source: 'quick-track',
      });
      continue;
    }

    const visitEventAt = input.getVisitEventAt(nextVisit);
    const quickTrackEventAt = input.getQuickTrackEventAt(nextQuickTrack);

    if (visitEventAt.localeCompare(quickTrackEventAt) >= 0) {
      visitState.buffer.shift();
      items.push({
        eventAt: visitEventAt,
        source: 'visit',
        visit: nextVisit,
      });
      continue;
    }

    quickTrackState.buffer.shift();
    items.push({
      eventAt: quickTrackEventAt,
      quickTrack: nextQuickTrack,
      source: 'quick-track',
    });
  }

  const hasNextPage = hasRemainingItems(visitState) || hasRemainingItems(quickTrackState);

  return {
    items,
    cursor: hasNextPage
      ? {
          quickTracks: createSourceState(quickTrackState),
          visits: createSourceState(visitState),
        }
      : undefined,
    hasNextPage,
    totalQuickTracks: quickTrackState.totalItems ?? 0,
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
      totalQuickTracks: 0,
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
