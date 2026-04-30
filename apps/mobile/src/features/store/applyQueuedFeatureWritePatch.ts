import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type {
  BillListSummary,
  CreateBillInput,
  CreateFoodProductInput,
  CreateNoteInput,
  CreateRestaurantListInput,
  CreateVisitInput,
  PaginatedResult,
} from './featureStore';
import { billsQueryKeys } from './billsQuery';
import { homeFeedQueryKeys, isPaginatedHomeFeedQueryKey } from './homeFeedQuery';
import { notesQueryKeys } from './notesQuery';
import { restaurantListQueryKeys } from './restaurantListQuery';
import type { QueuedFeatureWrite } from './queuedFeatureWrites';
import type { FoodProductRecord, NoteRecord, RestaurantListRecord, VisitRecord } from '../models';

type AnyRecord = { id: string } & Record<string, unknown>;
type AnyPaginatedData = InfiniteData<PaginatedResult<AnyRecord>, unknown>;

const QUEUED_RECORD_PREFIX = 'queued:';

function createQueuedId(write: QueuedFeatureWrite): string {
  return `${QUEUED_RECORD_PREFIX}${write.operationName}:${write.idempotencyKey}`;
}

function isQueuedRecordId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(QUEUED_RECORD_PREFIX);
}

function getQueuedIdSet(queuedWrites: readonly QueuedFeatureWrite[]): Set<string> {
  return new Set(queuedWrites.map((write) => createQueuedId(write)));
}

function patchPaginatedData(
  currentData: AnyPaginatedData | undefined,
  queuedIds: Set<string>,
  pendingItems: readonly AnyRecord[],
  shouldIncludeItem: (queryKey: QueryKey, item: AnyRecord) => boolean,
  queryKey: QueryKey,
): AnyPaginatedData | undefined {
  if (!currentData || currentData.pages.length === 0) {
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

function patchPaginatedQueries(
  queryClient: QueryClient,
  queryFilter: readonly unknown[],
  queuedIds: Set<string>,
  pendingItems: readonly AnyRecord[],
  shouldIncludeItem: (queryKey: QueryKey, item: AnyRecord) => boolean = () => true,
): void {
  const queries = queryClient.getQueriesData<AnyPaginatedData>({
    queryKey: queryFilter,
  });

  for (const [queryKey, currentData] of queries) {
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
  return {
    id: createQueuedId(write),
    title: payload.title,
    status: 'open',
    participantCount: payload.participants.length,
    pendingOtherParticipantCount: payload.participants.length,
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
  return {
    id: createQueuedId(write),
    restaurantId: payload.restaurantId,
    restaurantName: payload.restaurantName,
    visitedAt: payload.visitedAt ?? payload.visitedOn ?? now,
    items: payload.items.map((item, index) => ({
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

function patchBillsList(queryClient: QueryClient, queuedIds: Set<string>, queuedWrites: readonly QueuedFeatureWrite[]): void {
  const pendingBills = queuedWrites
    .filter((write): write is QueuedFeatureWrite<'bill.create'> => write.operationName === 'bill.create')
    .map(createPendingBillSummary);

  queryClient.setQueryData<BillListSummary[] | undefined>(billsQueryKeys.root, (currentData) => {
    const nonStaleBills = (currentData ?? []).filter(
      (bill) => !isQueuedRecordId(bill.id) || queuedIds.has(bill.id),
    );
    const existingIds = new Set(nonStaleBills.map((bill) => bill.id));
    const newPendingBills = pendingBills.filter((bill) => !existingIds.has(bill.id));
    if (newPendingBills.length === 0 && nonStaleBills.length === (currentData ?? []).length) {
      return currentData;
    }
    return [...newPendingBills, ...nonStaleBills];
  });
}

function patchHomeFeed(queryClient: QueryClient, queuedIds: Set<string>, queuedWrites: readonly QueuedFeatureWrite[]): void {
  const pendingVisits = queuedWrites
    .filter((write): write is QueuedFeatureWrite<'visit.create'> => write.operationName === 'visit.create')
    .map(createPendingVisit);
  const pendingFoodProducts = queuedWrites
    .filter((write): write is QueuedFeatureWrite<'food-product.create'> => write.operationName === 'food-product.create')
    .map(createPendingFoodProduct);
  const pendingItems = [
    ...pendingVisits.map((visit) => ({
      id: visit.id,
      source: 'visit',
      eventAt: visit.visitedAt,
      visit,
    })),
    ...pendingFoodProducts.map((foodProduct) => ({
      id: foodProduct.id,
      source: 'food-product',
      eventAt: foodProduct.itemDate ?? foodProduct.createdAt,
      foodProduct,
    })),
  ] as unknown as AnyRecord[];

  const queries = queryClient.getQueriesData<InfiniteData<{ items: AnyRecord[] }, unknown>>({
    queryKey: homeFeedQueryKeys.root,
  });

  for (const [queryKey] of queries) {
    if (!isPaginatedHomeFeedQueryKey(queryKey)) {
      continue;
    }

    const typeFilter = queryKey[6];
    const searchQuery = String(queryKey[8] ?? '');
    queryClient.setQueryData<InfiniteData<{ items: AnyRecord[] }, unknown> | undefined>(queryKey, (current) => {
      if (!current || current.pages.length === 0) {
        return current;
      }

      return {
        ...current,
        pages: current.pages.map((page, pageIndex) => {
          const nonStaleItems = page.items.filter(
            (item) => !isQueuedRecordId(item.id) || queuedIds.has(item.id),
          );
          const existingIds = new Set(nonStaleItems.map((item) => item.id));
          const nextPendingItems =
            pageIndex === 0
              ? pendingItems.filter((item) => {
                  if (existingIds.has(item.id)) {
                    return false;
                  }
                  if (typeFilter === 'visits' && item.source !== 'visit') {
                    return false;
                  }
                  if (typeFilter === 'food-products' && item.source !== 'food-product') {
                    return false;
                  }
                  if (item.source === 'visit') {
                    const visit = item.visit as VisitRecord;
                    return matchesTextSearch(searchQuery, [
                      visit.restaurantName,
                      ...visit.items.map((visitItem) => visitItem.name),
                    ]);
                  }
                  const foodProduct = item.foodProduct as FoodProductRecord;
                  return matchesTextSearch(searchQuery, [
                    foodProduct.itemName,
                    foodProduct.locationText,
                    foodProduct.itemCategory,
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

export function applyQueuedFeatureWritePatch(
  queryClient: QueryClient,
  queuedWrites: readonly QueuedFeatureWrite[],
): void {
  const queuedIds = getQueuedIdSet(queuedWrites);
  const pendingNotes = queuedWrites
    .filter((write): write is QueuedFeatureWrite<'note.create'> => write.operationName === 'note.create')
    .map(createPendingNote);
  const pendingLists = queuedWrites
    .filter((write): write is QueuedFeatureWrite<'list.create'> => write.operationName === 'list.create')
    .map(createPendingRestaurantList);

  patchPaginatedQueries(
    queryClient,
    notesQueryKeys.root,
    queuedIds,
    pendingNotes as unknown as AnyRecord[],
    (queryKey, item) => {
      if (!Array.isArray(queryKey) || queryKey[3] === 'used') {
        return false;
      }
      return matchesTextSearch(getNotesSearchQueryFromQueryKey(queryKey), [
        item.title as string,
        item.content as string,
        item.locationText as string | undefined,
      ]);
    },
  );
  patchPaginatedQueries(
    queryClient,
    restaurantListQueryKeys.scope('my'),
    queuedIds,
    pendingLists as unknown as AnyRecord[],
    (queryKey, item) =>
      matchesTextSearch(getSearchQueryFromTrailingQueryKeySegment(queryKey), [
        item.name as string,
        item.description as string | undefined,
      ]),
  );
  patchBillsList(queryClient, queuedIds, queuedWrites);
  patchHomeFeed(queryClient, queuedIds, queuedWrites);
}
