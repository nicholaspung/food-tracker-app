import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import type { FeedbackRecord } from '../models';

import type { PaginatedResult } from './featureStore';

const DEFAULT_FEEDBACK_PAGE_SIZE = 20;

export const feedbackQueryKeys = {
  root: ['feature', 'feedback'] as const,
  list: ['feature', 'feedback', 'all', 'paginated'] as const,
  summary: ['feature', 'feedback', 'summary'] as const,
  detail: (feedbackId: string) => ['feature', 'feedback', feedbackId] as const,
};

export type FeedbackListQueryData = InfiniteData<PaginatedResult<FeedbackRecord>, number>;

export function isFeedbackListQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === feedbackQueryKeys.list.length &&
    feedbackQueryKeys.list.every((segment, index) => queryKey[index] === segment)
  );
}

function buildFeedbackPage(input: {
  items: FeedbackRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
}): PaginatedResult<FeedbackRecord> {
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

export function prependFeedbackListItem(
  currentData: FeedbackListQueryData | undefined,
  createdFeedback: FeedbackRecord,
): FeedbackListQueryData {
  const currentPages = currentData?.pages ?? [];
  if (currentPages.length === 0) {
    return {
      pages: [
        buildFeedbackPage({
          items: [createdFeedback],
          page: 1,
          pageSize: DEFAULT_FEEDBACK_PAGE_SIZE,
          totalItems: 1,
        }),
      ],
      pageParams: [1],
    };
  }

  const flattenedItems = currentPages.flatMap((page) => page.items);
  const alreadyExists = flattenedItems.some((item) => item.id === createdFeedback.id);
  const previousTotalItems = currentPages[0]?.totalItems ?? flattenedItems.length;
  const nextTotalItems = alreadyExists ? previousTotalItems : previousTotalItems + 1;
  const nextItems = [createdFeedback];
  const seenIds = new Set<string>([createdFeedback.id]);

  for (const item of flattenedItems) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    nextItems.push(item);
  }

  const allPagesLoaded = !currentPages[currentPages.length - 1]?.hasNextPage;
  const nextPages: PaginatedResult<FeedbackRecord>[] = [];
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
        totalItems: nextTotalItems,
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
          totalItems: nextTotalItems,
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
