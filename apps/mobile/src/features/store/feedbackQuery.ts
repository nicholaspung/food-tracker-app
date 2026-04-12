import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import type { FeedbackMessageRecord, FeedbackRecord } from '../models';

import type { PaginatedResult } from './featureStore';

const DEFAULT_FEEDBACK_PAGE_SIZE = 20;

export const feedbackQueryKeys = {
  root: ['feature', 'feedback'] as const,
  list: ['feature', 'feedback', 'all', 'paginated'] as const,
  summary: ['feature', 'feedback', 'summary'] as const,
  detail: (feedbackId: string) => ['feature', 'feedback', feedbackId] as const,
  thread: (feedbackId: string) => ['feature', 'feedback-thread', feedbackId] as const,
  messages: (feedbackId: string) => ['feature', 'feedback-messages', feedbackId] as const,
};

export type FeedbackListQueryData = InfiniteData<PaginatedResult<FeedbackRecord>, number>;
export type FeedbackMessageListQueryData = InfiniteData<PaginatedResult<FeedbackMessageRecord>, number>;

export function isFeedbackListQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === feedbackQueryKeys.list.length &&
    feedbackQueryKeys.list.every((segment, index) => queryKey[index] === segment)
  );
}

function buildFeedbackPage<T>(input: {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
}): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(input.totalItems / input.pageSize));

  return {
    items: input.items,
    page: input.page,
    pageSize: input.pageSize,
    totalItems: input.totalItems,
    totalPages,
    hasNextPage: input.page < totalPages,
  };
}

export function mergeFeedbackRecord(
  currentFeedback: FeedbackRecord | undefined,
  nextFeedback: FeedbackRecord,
): FeedbackRecord {
  if (!currentFeedback) {
    return nextFeedback;
  }

  return {
    ...currentFeedback,
    ...nextFeedback,
    userEmail: nextFeedback.userEmail ?? currentFeedback.userEmail,
    userName: nextFeedback.userName ?? currentFeedback.userName,
  };
}

function mergeFeedbackMessageRecord(
  currentMessage: FeedbackMessageRecord | undefined,
  nextMessage: FeedbackMessageRecord,
): FeedbackMessageRecord {
  if (!currentMessage) {
    return nextMessage;
  }

  return {
    ...currentMessage,
    ...nextMessage,
    userEmail: nextMessage.userEmail ?? currentMessage.userEmail,
    userName: nextMessage.userName ?? currentMessage.userName,
  };
}

function rebuildInfiniteQueryData<T>(
  currentData: InfiniteData<PaginatedResult<T>, number> | undefined,
  nextItems: T[],
  totalItems: number,
  defaultPageSize = DEFAULT_FEEDBACK_PAGE_SIZE,
): InfiniteData<PaginatedResult<T>, number> {
  const currentPages = currentData?.pages ?? [];
  if (currentPages.length === 0) {
    return {
      pages: [
        buildFeedbackPage({
          items: nextItems.slice(0, defaultPageSize),
          page: 1,
          pageSize: defaultPageSize,
          totalItems,
        }),
      ],
      pageParams: [1],
    };
  }

  const allPagesLoaded = !currentPages[currentPages.length - 1]?.hasNextPage;
  const nextPages: PaginatedResult<T>[] = [];
  let itemOffset = 0;

  for (const page of currentPages) {
    const capacity = allPagesLoaded ? page.pageSize : page.items.length;
    const pageItems = nextItems.slice(itemOffset, itemOffset + capacity);
    itemOffset += pageItems.length;
    nextPages.push(
      buildFeedbackPage({
        items: pageItems,
        page: page.page,
        pageSize: page.pageSize,
        totalItems,
      }),
    );
  }

  if (allPagesLoaded) {
    const lastPage = currentPages[currentPages.length - 1];
    let nextPageNumber = lastPage.page + 1;

    while (itemOffset < nextItems.length) {
      const pageItems = nextItems.slice(itemOffset, itemOffset + lastPage.pageSize);
      itemOffset += pageItems.length;
      nextPages.push(
        buildFeedbackPage({
          items: pageItems,
          page: nextPageNumber,
          pageSize: lastPage.pageSize,
          totalItems,
        }),
      );
      nextPageNumber += 1;
    }
  }

  return {
    pages: nextPages,
    pageParams: nextPages.map((page, index) => currentData?.pageParams[index] ?? page.page),
  };
}

export function upsertFeedbackListItem(
  currentData: FeedbackListQueryData | undefined,
  nextFeedback: FeedbackRecord,
  options?: {
    insertIfMissing?: boolean;
    moveToFront?: boolean;
  },
): FeedbackListQueryData | undefined {
  const currentItems = currentData?.pages.flatMap((page) => page.items) ?? [];
  const existingIndex = currentItems.findIndex((item) => item.id === nextFeedback.id);

  if (existingIndex === -1 && options?.insertIfMissing !== true) {
    return currentData;
  }

  const mergedFeedback =
    existingIndex === -1 ? nextFeedback : mergeFeedbackRecord(currentItems[existingIndex], nextFeedback);
  const filteredItems = currentItems.filter((item) => item.id !== nextFeedback.id);
  const nextItems =
    existingIndex === -1 || options?.moveToFront === true
      ? [mergedFeedback, ...filteredItems]
      : currentItems.map((item) => (item.id === nextFeedback.id ? mergedFeedback : item));
  const currentTotalItems = currentData?.pages[0]?.totalItems ?? currentItems.length;
  const nextTotalItems = existingIndex === -1 ? currentTotalItems + 1 : currentTotalItems;

  return rebuildInfiniteQueryData(currentData, nextItems, nextTotalItems);
}

export function prependFeedbackListItem(
  currentData: FeedbackListQueryData | undefined,
  createdFeedback: FeedbackRecord,
): FeedbackListQueryData {
  return (
    upsertFeedbackListItem(currentData, createdFeedback, {
      insertIfMissing: true,
      moveToFront: true,
    }) ??
    rebuildInfiniteQueryData(undefined, [createdFeedback], 1)
  );
}

export function prependFeedbackMessageListItem(
  currentData: FeedbackMessageListQueryData | undefined,
  nextMessage: FeedbackMessageRecord,
): FeedbackMessageListQueryData {
  const currentItems = currentData?.pages.flatMap((page) => page.items) ?? [];
  const existingIndex = currentItems.findIndex((item) => item.id === nextMessage.id);
  const mergedMessage =
    existingIndex === -1 ? nextMessage : mergeFeedbackMessageRecord(currentItems[existingIndex], nextMessage);
  const nextItems = [mergedMessage, ...currentItems.filter((item) => item.id !== nextMessage.id)];
  const currentTotalItems = currentData?.pages[0]?.totalItems ?? currentItems.length;
  const nextTotalItems = existingIndex === -1 ? currentTotalItems + 1 : currentTotalItems;

  return rebuildInfiniteQueryData(currentData, nextItems, nextTotalItems);
}

export function replaceFeedbackMessageFirstPage(
  currentData: FeedbackMessageListQueryData | undefined,
  nextFirstPage: PaginatedResult<FeedbackMessageRecord>,
): FeedbackMessageListQueryData {
  if (!currentData || currentData.pages.length === 0) {
    return {
      pages: [nextFirstPage],
      pageParams: [nextFirstPage.page],
    };
  }

  const nextPages = [...currentData.pages];
  nextPages[0] = nextFirstPage;

  const nextPageParams = [...currentData.pageParams];
  nextPageParams[0] = nextFirstPage.page;

  return {
    pages: nextPages,
    pageParams: nextPageParams,
  };
}
