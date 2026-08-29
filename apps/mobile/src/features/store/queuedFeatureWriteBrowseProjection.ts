import { useEffect } from 'react';
import { useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query';

import type {
  BillListSummary,
  CreateBillInput,
} from './billTypes';
import type {
  CreateFoodProductInput,
  CreateNoteInput,
  CreateRestaurantListInput,
  CreateVisitInput,
} from './featureStore';
import type { PaginatedResult } from './sharedTypes';
import { billsQueryKeys, isPaginatedBillsQueryKey } from './billsQuery';
import {
  homeFeedQueryKeys,
  isPaginatedHomeFeedQueryKey,
  type HomeFeedInfiniteData,
} from './homeFeedQuery';
import type { HomeFeedPageEntry } from './homeFeedPagination';
import { isPaginatedNotesQueryKey, notesQueryKeys } from './notesQuery';
import {
  isPaginatedRestaurantListQueryKey,
  restaurantListQueryKeys,
} from './restaurantListQuery';
import type { QueuedFeatureWrite } from './queuedFeatureWrites';
import type { FoodProductRecord, NoteRecord, RestaurantListRecord, VisitRecord } from '../models';

type IdentifiedRecord = { id: string };
type PaginatedData<TItem extends IdentifiedRecord> = InfiniteData<
  PaginatedResult<TItem>,
  unknown
>;
type QueuedHomeFeedEntry =
  | {
      id: string;
      source: 'visit';
      eventAt: string;
      visit: VisitRecord;
    }
  | {
      id: string;
      source: 'food-product';
      eventAt: string;
      foodProduct: FoodProductRecord;
    };

const QUEUED_RECORD_PREFIX = 'queued:';

export type QueuedFeatureWriteBrowseProjectionTarget =
  | 'bills'
  | 'home-feed'
  | 'notes'
  | 'restaurant-lists';

function createQueuedId(write: QueuedFeatureWrite): string {
  return `${QUEUED_RECORD_PREFIX}${write.operationName}:${write.idempotencyKey}`;
}

function isQueuedRecordId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(QUEUED_RECORD_PREFIX);
}

function getQueuedIdSet(queuedWrites: readonly QueuedFeatureWrite[]): Set<string> {
  return new Set(queuedWrites.map((write) => createQueuedId(write)));
}

function hasInfinitePages<TPage, TPageParam>(
  value: InfiniteData<TPage, TPageParam> | undefined,
): value is InfiniteData<TPage, TPageParam> {
  return Array.isArray(value?.pages);
}

function isPageWithItems<TItem>(page: unknown): page is { items: TItem[] } {
  return page !== null && typeof page === 'object' && 'items' in page && Array.isArray(page.items);
}

function patchPaginatedData<TItem extends IdentifiedRecord>(
  currentData: PaginatedData<TItem> | undefined,
  queuedIds: Set<string>,
  pendingItems: readonly TItem[],
  shouldIncludeItem: (queryKey: QueryKey, item: TItem) => boolean,
  queryKey: QueryKey,
): PaginatedData<TItem> | undefined {
  if (!hasInfinitePages(currentData)) {
    return currentData;
  }

  if (currentData.pages.length === 0) {
    const initialItems = pendingItems.filter((item) => shouldIncludeItem(queryKey, item));
    if (initialItems.length === 0) {
      return currentData;
    }

    return {
      pageParams: [1],
      pages: [
        {
          items: initialItems,
          page: 1,
          pageSize: 20,
          totalItems: initialItems.length,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
    };
  }

  return {
    ...currentData,
    pages: currentData.pages.map((page, pageIndex) => {
      if (!isPageWithItems<TItem>(page)) {
        return page;
      }

      const nonStaleItems = page.items.filter(
        (item) => !isQueuedRecordId(item.id) || queuedIds.has(item.id),
      );
      const existingIds = new Set(nonStaleItems.map((item) => item.id));
      const newPendingItems =
        pageIndex === 0
          ? pendingItems.filter(
              (item) => shouldIncludeItem(queryKey, item) && !existingIds.has(item.id),
            )
          : [];
      const nextItems = [...newPendingItems, ...nonStaleItems];
      const totalDelta = nextItems.length - page.items.length;
      const nextTotalItems = Math.max(page.totalItems + totalDelta, 0);

      return {
        ...page,
        items: nextItems,
        totalItems: nextTotalItems,
        totalPages:
          page.pageSize > 0 && nextTotalItems > 0
            ? Math.max(1, Math.ceil(nextTotalItems / page.pageSize))
            : page.totalPages,
      };
    }),
  };
}

function patchPaginatedQueries<TItem extends IdentifiedRecord>(
  queryClient: QueryClient,
  queryFilter: readonly unknown[],
  queuedIds: Set<string>,
  pendingItems: readonly TItem[],
  shouldIncludeItem: (queryKey: QueryKey, item: TItem) => boolean,
  shouldPatchQueryKey: (queryKey: QueryKey) => boolean,
): void {
  const queries = queryClient.getQueriesData<PaginatedData<TItem>>({
    queryKey: queryFilter,
  });

  for (const [queryKey, currentData] of queries) {
    if (!shouldPatchQueryKey(queryKey)) {
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      patchPaginatedData(currentData, queuedIds, pendingItems, shouldIncludeItem, queryKey),
    );
  }
}

function getSearchQueryFromTrailingQueryKeySegment(queryKey: QueryKey): string {
  if (!Array.isArray(queryKey)) {
    return '';
  }

  const trailingSegment = queryKey[queryKey.length - 1];
  return typeof trailingSegment === 'string' ? trailingSegment.trim().toLowerCase() : '';
}

function getNotesSearchQueryFromQueryKey(queryKey: QueryKey): string {
  if (!Array.isArray(queryKey) || queryKey.length !== 5) {
    return '';
  }

  return typeof queryKey[4] === 'string' ? queryKey[4].trim().toLowerCase() : '';
}

function matchesTextSearch(searchQuery: string, values: readonly (string | undefined)[]): boolean {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function createPendingNote(write: QueuedFeatureWrite<'note.create'>): NoteRecord {
  const payload = write.payload as CreateNoteInput;
  const now = new Date(write.createdAt).toISOString();
  return {
    id: createQueuedId(write),
    title: payload.title,
    content: payload.content,
    locationText: payload.locationText,
    rating: payload.rating,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

function createPendingRestaurantList(write: QueuedFeatureWrite<'list.create'>): RestaurantListRecord {
  const payload = write.payload as CreateRestaurantListInput;
  const now = new Date(write.createdAt).toISOString();
  return {
    id: createQueuedId(write),
    name: payload.name,
    description: payload.description,
    visibility: payload.visibility ?? 'private',
    userId: 'queued',
    restaurantCount: 0,
    menuItemCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createPendingBillSummary(write: QueuedFeatureWrite<'bill.create'>): BillListSummary {
  const payload = write.payload as CreateBillInput;
  const now = new Date(write.createdAt).toISOString();
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  return {
    id: createQueuedId(write),
    title: payload.title,
    status: 'open',
    participantCount: participants.length,
    pendingOtherParticipantCount: participants.length,
    youOwe: 0,
    youAreOwed: 0,
    isCreator: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createPendingVisit(write: QueuedFeatureWrite<'visit.create'>): VisitRecord {
  const payload = write.payload as CreateVisitInput;
  const now = new Date(write.createdAt).toISOString();
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    id: createQueuedId(write),
    restaurantId: payload.restaurantId,
    restaurantName: payload.restaurantName,
    visitedAt: payload.visitedAt ?? payload.visitedOn ?? now,
    items: items.map((item, index) => ({
      id: `${createQueuedId(write)}:item:${index}`,
      name: item.name,
      rating: item.rating,
      description: item.description,
      notes: item.notes,
    })),
    source: payload.source ?? 'visit',
    visibility: payload.visibility ?? 'private',
    createdAt: now,
    updatedAt: now,
  };
}

function createPendingFoodProduct(write: QueuedFeatureWrite<'food-product.create'>): FoodProductRecord {
  const payload = write.payload as CreateFoodProductInput;
  const now = new Date(write.createdAt).toISOString();
  return {
    id: createQueuedId(write),
    restaurantName: payload.locationText ?? '',
    itemCategory: payload.itemCategory,
    itemName: payload.itemName,
    locationText: payload.locationText,
    rating: payload.rating,
    notes: payload.notes,
    sourceNoteId: payload.sourceNoteId,
    visibility: payload.visibility ?? 'private',
    itemDate: payload.itemDate,
    createdAt: now,
    updatedAt: now,
  };
}

function projectQueuedNotes(
  queryClient: QueryClient,
  queuedWrites: readonly QueuedFeatureWrite[],
): void {
  const noteWrites = queuedWrites.filter(
    (write): write is QueuedFeatureWrite<'note.create'> => write.operationName === 'note.create',
  );
  const pendingNotes = noteWrites.map(createPendingNote);
  const queuedIds = getQueuedIdSet(noteWrites);

  patchPaginatedQueries(
    queryClient,
    notesQueryKeys.root,
    queuedIds,
    pendingNotes,
    (queryKey, item) => {
      if (!Array.isArray(queryKey) || queryKey[3] === 'used') {
        return false;
      }
      return matchesTextSearch(getNotesSearchQueryFromQueryKey(queryKey), [
        item.title,
        item.content,
        item.locationText,
      ]);
    },
    isPaginatedNotesQueryKey,
  );
}

function projectQueuedRestaurantLists(
  queryClient: QueryClient,
  queuedWrites: readonly QueuedFeatureWrite[],
): void {
  const listWrites = queuedWrites.filter(
    (write): write is QueuedFeatureWrite<'list.create'> => write.operationName === 'list.create',
  );
  const pendingLists = listWrites.map(createPendingRestaurantList);
  const queuedIds = getQueuedIdSet(listWrites);

  patchPaginatedQueries(
    queryClient,
    restaurantListQueryKeys.scope('my'),
    queuedIds,
    pendingLists,
    (queryKey, item) =>
      matchesTextSearch(getSearchQueryFromTrailingQueryKeySegment(queryKey), [
        item.name,
        item.description,
      ]),
    isPaginatedRestaurantListQueryKey,
  );
}

function projectQueuedBills(
  queryClient: QueryClient,
  queuedWrites: readonly QueuedFeatureWrite[],
): void {
  const billWrites = queuedWrites.filter(
    (write): write is QueuedFeatureWrite<'bill.create'> => write.operationName === 'bill.create',
  );
  const pendingBills = billWrites.map(createPendingBillSummary);
  const queuedIds = getQueuedIdSet(billWrites);

  patchPaginatedQueries(
    queryClient,
    billsQueryKeys.root,
    queuedIds,
    pendingBills,
    () => true,
    isPaginatedBillsQueryKey,
  );
}

function projectQueuedHomeFeed(
  queryClient: QueryClient,
  queuedWrites: readonly QueuedFeatureWrite[],
): void {
  const visitWrites = queuedWrites.filter(
    (write): write is QueuedFeatureWrite<'visit.create'> => write.operationName === 'visit.create',
  );
  const foodProductWrites = queuedWrites.filter(
    (write): write is QueuedFeatureWrite<'food-product.create'> =>
      write.operationName === 'food-product.create',
  );
  const pendingVisits = visitWrites.map(createPendingVisit);
  const pendingFoodProducts = foodProductWrites.map(createPendingFoodProduct);
  const pendingItems: QueuedHomeFeedEntry[] = [
    ...pendingVisits.map<QueuedHomeFeedEntry>((visit) => ({
      id: visit.id,
      source: 'visit',
      eventAt: visit.visitedAt,
      visit,
    })),
    ...pendingFoodProducts.map<QueuedHomeFeedEntry>((foodProduct) => ({
      id: foodProduct.id,
      source: 'food-product',
      eventAt: foodProduct.itemDate ?? foodProduct.createdAt,
      foodProduct,
    })),
  ];
  const queuedIds = getQueuedIdSet([...visitWrites, ...foodProductWrites]);

  const queries = queryClient.getQueriesData<HomeFeedInfiniteData>({
    queryKey: homeFeedQueryKeys.root,
  });

  for (const [queryKey] of queries) {
    if (!isPaginatedHomeFeedQueryKey(queryKey)) {
      continue;
    }

    const typeFilter = queryKey[6];
    const searchQuery = String(queryKey[8] ?? '');
    queryClient.setQueryData<HomeFeedInfiniteData | undefined>(queryKey, (current) => {
      if (!hasInfinitePages(current) || current.pages.length === 0) {
        return current;
      }

      return {
        ...current,
        pages: current.pages.map((page, pageIndex) => {
          if (!isPageWithItems<HomeFeedPageEntry>(page)) {
            return page;
          }

          const nonStaleItems = page.items.filter(
            (item) => {
              const itemId = getHomeFeedEntryId(item);
              return !isQueuedRecordId(itemId) || queuedIds.has(itemId);
            },
          );
          const existingIds = new Set(nonStaleItems.map(getHomeFeedEntryId));
          const nextPendingItems =
            pageIndex === 0
              ? pendingItems.filter((item) => {
                  if (existingIds.has(getHomeFeedEntryId(item))) {
                    return false;
                  }
                  if (typeFilter === 'visits' && item.source !== 'visit') {
                    return false;
                  }
                  if (typeFilter === 'food-products' && item.source !== 'food-product') {
                    return false;
                  }
                  if (item.source === 'visit') {
                    return matchesTextSearch(searchQuery, [
                      item.visit.restaurantName,
                      ...item.visit.items.map((visitItem) => visitItem.name),
                    ]);
                  }
                  return matchesTextSearch(searchQuery, [
                    item.foodProduct.itemName,
                    item.foodProduct.locationText,
                    item.foodProduct.itemCategory,
                  ]);
                })
              : [];

          return {
            ...page,
            items: [...nextPendingItems, ...nonStaleItems],
          };
        }),
      };
    });
  }
}

function getHomeFeedEntryId(item: HomeFeedPageEntry): string {
  return item.source === 'visit' ? item.visit.id : item.foodProduct.id;
}

export function applyQueuedFeatureWriteBrowseProjection(
  queryClient: QueryClient,
  queuedWrites: readonly QueuedFeatureWrite[],
  targets: readonly QueuedFeatureWriteBrowseProjectionTarget[],
): void {
  const targetSet = new Set(targets);

  if (targetSet.has('notes')) {
    projectQueuedNotes(queryClient, queuedWrites);
  }
  if (targetSet.has('restaurant-lists')) {
    projectQueuedRestaurantLists(queryClient, queuedWrites);
  }
  if (targetSet.has('bills')) {
    projectQueuedBills(queryClient, queuedWrites);
  }
  if (targetSet.has('home-feed')) {
    projectQueuedHomeFeed(queryClient, queuedWrites);
  }
}

export function useQueuedFeatureWriteBrowseProjection(
  queuedWrites: readonly QueuedFeatureWrite[],
  targets: readonly QueuedFeatureWriteBrowseProjectionTarget[],
  options: { enabled?: boolean } = {},
): void {
  const enabled = options.enabled ?? true;
  const queryClient = useQueryClient();
  const targetsKey = targets.join('|');

  useEffect(() => {
    if (!enabled || targets.length === 0) {
      return;
    }

    applyQueuedFeatureWriteBrowseProjection(queryClient, queuedWrites, targets);
  }, [enabled, queryClient, queuedWrites, targets, targetsKey]);
}
