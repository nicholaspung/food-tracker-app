import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { BillRecord } from '../models';
import type { BillListPage, BillListSummary, ListBillSummariesPageInput } from './billTypes';

type BillListFilter = NonNullable<ListBillSummariesPageInput['filter']>;

export const billsQueryKeys = {
  root: ['feature', 'bills'] as const,
  paginated: (filter: BillListFilter) => ['feature', 'bills', 'paginated', filter] as const,
  detail: (billId: string) => ['feature', 'bill', billId.trim()] as const,
};

export function isBillsListQueryKey(queryKey: QueryKey): boolean {
  return isPaginatedBillsQueryKey(queryKey);
}

export function isPaginatedBillsQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 4 &&
    queryKey[0] === billsQueryKeys.root[0] &&
    queryKey[1] === billsQueryKeys.root[1] &&
    queryKey[2] === 'paginated' &&
    (queryKey[3] === 'you_owe' || queryKey[3] === 'you_are_owed' || queryKey[3] === 'settled')
  );
}

export function isBillDetailQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 3 &&
    queryKey[0] === 'feature' &&
    queryKey[1] === 'bill' &&
    typeof queryKey[2] === 'string' &&
    queryKey[2].trim().length > 0
  );
}

export function getCachedBillListSummary(
  queryClient: QueryClient,
  billId: string,
): BillListSummary | null {
  const trimmedBillId = billId.trim();
  if (!trimmedBillId) {
    return null;
  }

  return (
    queryClient
      .getQueriesData<InfiniteData<BillListPage, unknown>>({ queryKey: billsQueryKeys.root })
      .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
      .find((summary) => summary.id === trimmedBillId) ?? null
  );
}

export function getCachedBillDetail(queryClient: QueryClient, billId: string): BillRecord | undefined {
  return queryClient.getQueryData<BillRecord | null>(billsQueryKeys.detail(billId)) ?? undefined;
}
