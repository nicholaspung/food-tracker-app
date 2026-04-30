import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { BillRecord } from '../models';
import type { BillListSummary } from './featureStore';

export const billsQueryKeys = {
  root: ['feature', 'bills'] as const,
  detail: (billId: string) => ['feature', 'bill', billId.trim()] as const,
};

export function isBillsListQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === billsQueryKeys.root.length &&
    billsQueryKeys.root.every((segment, index) => queryKey[index] === segment)
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
      .getQueryData<BillListSummary[]>(billsQueryKeys.root)
      ?.find((summary) => summary.id === trimmedBillId) ?? null
  );
}

export function getCachedBillDetail(queryClient: QueryClient, billId: string): BillRecord | undefined {
  return queryClient.getQueryData<BillRecord | null>(billsQueryKeys.detail(billId)) ?? undefined;
}
