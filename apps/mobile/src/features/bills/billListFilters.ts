import type { BillListSummary } from '../store/featureStore';

export type BillListFilter = 'active' | 'you_owe' | 'you_are_owed' | 'settled';

export function filterBillSummaries(
  bills: BillListSummary[],
  activeFilter: BillListFilter,
): BillListSummary[] {
  if (activeFilter === 'active') {
    return bills.filter((bill) => bill.status !== 'settled');
  }

  if (activeFilter === 'settled') {
    return bills.filter((bill) => bill.status === 'settled');
  }

  if (activeFilter === 'you_owe') {
    return bills.filter((bill) => {
      return bill.status !== 'settled' && bill.youOwe > 0;
    });
  }

  if (activeFilter === 'you_are_owed') {
    return bills.filter((bill) => {
      return bill.status !== 'settled' && bill.youAreOwed > 0;
    });
  }

  return bills;
}
