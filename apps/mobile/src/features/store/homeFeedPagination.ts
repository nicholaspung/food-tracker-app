import type { QuickTrackRecord, VisitRecord } from '../models';
import { listQuickTracksPage, listVisitsPage } from './featureStore';

export type HomeFeedScope = 'all' | 'mine' | 'friends';
export type HomeFeedTypeFilter = 'all' | 'visits' | 'quick-track';

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

export type HomeFeedCursor = BufferedHomeFeedCursor<VisitRecord, QuickTrackRecord>;
export type HomeFeedPageEntry = BufferedHomeFeedEntry<VisitRecord, QuickTrackRecord>;

export interface HomeFeedPageResult {
  items: HomeFeedPageEntry[];
  cursor?: HomeFeedCursor;
  hasNextPage: boolean;
  totalQuickTracks: number;
  totalVisits: number;
}

export interface ListHomeFeedPageInput {
  cursor?: HomeFeedCursor;
  pageSize?: number;
  scope?: HomeFeedScope;
  search?: string;
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
const DEFAULT_HOME_FEED_SOURCE_BATCH_SIZE = 10;

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

function getVisitEventAt(visit: VisitRecord): string {
  return visit.visitedAt || visit.createdAt;
}

function getQuickTrackEventAt(quickTrack: QuickTrackRecord): string {
  return quickTrack.itemDate || quickTrack.createdAt;
}

export async function listHomeFeedPage(input?: ListHomeFeedPageInput): Promise<HomeFeedPageResult> {
  const pageSize = normalizePageSize(input?.pageSize);
  const scope = input?.scope ?? 'all';
  const trimmedSearch = input?.search?.trim() || undefined;
  const typeFilter = input?.typeFilter ?? 'all';
  const loadVisits = typeFilter !== 'quick-track';
  const loadQuickTracks = typeFilter !== 'visits';
  const dualSourceFeed = loadVisits && loadQuickTracks;

  return loadHomeFeedPageWithSources({
    cursor: input?.cursor,
    fetchQuickTracksPage: loadQuickTracks
      ? (page, sourcePageSize) =>
          listQuickTracksPage({
            page,
            pageSize: sourcePageSize,
            scope,
            search: trimmedSearch,
          })
      : undefined,
    fetchVisitsPage: loadVisits
      ? (page, sourcePageSize) =>
          listVisitsPage({
            page,
            pageSize: sourcePageSize,
            scope,
            search: trimmedSearch,
          })
      : undefined,
    getQuickTrackEventAt,
    getVisitEventAt,
    loadQuickTracks,
    loadVisits,
    pageSize,
    quickTrackBatchSize: loadQuickTracks
      ? dualSourceFeed
        ? Math.min(pageSize, DEFAULT_HOME_FEED_SOURCE_BATCH_SIZE)
        : pageSize
      : 0,
    visitBatchSize: loadVisits
      ? dualSourceFeed
        ? Math.min(pageSize, DEFAULT_HOME_FEED_SOURCE_BATCH_SIZE)
        : pageSize
      : 0,
  });
}
