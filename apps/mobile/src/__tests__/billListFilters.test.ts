import {
  filterBillSummaries,
  type BillListFilter,
} from '../features/bills/billListFilters';
import type { BillListSummary } from '../features/store/billTypes';

function buildBillSummary(
  id: string,
  overrides: Partial<BillListSummary> = {},
): BillListSummary {
  return {
    id,
    title: id,
    status: 'open',
    participantCount: 2,
    pendingOtherParticipantCount: 0,
    youOwe: 0,
    youAreOwed: 0,
    isCreator: false,
    createdAt: '2026-06-19T12:00:00.000Z',
    updatedAt: '2026-06-19T12:00:00.000Z',
    ...overrides,
  };
}

describe('bill list filters', () => {
  it.each<[BillListFilter, string[]]>([
    ['you_owe', ['owed-bill']],
    ['you_are_owed', ['receivable-bill']],
    ['settled', ['settled-bill']],
  ])('filters %s bills by balance semantics', (filter, expectedIds) => {
    const bills = [
      buildBillSummary('paid-participant-bill', { pendingOtherParticipantCount: 1 }),
      buildBillSummary('owed-bill', { youOwe: 12 }),
      buildBillSummary('receivable-bill', { isCreator: true, youAreOwed: 18 }),
      buildBillSummary('settled-bill', { status: 'settled' }),
    ];

    expect(filterBillSummaries(bills, filter).map((bill) => bill.id)).toEqual(expectedIds);
  });
});
