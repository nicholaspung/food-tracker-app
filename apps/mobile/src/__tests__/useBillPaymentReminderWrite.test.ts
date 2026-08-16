import { QueryClient } from '@tanstack/react-query';

import type { BillRecord } from '../features';
import { billsQueryKeys } from '../features/store/billsQuery';
import type { BillPaymentReminderApiResponse } from '../features/store/billsStore';
import {
  BILL_PAYMENT_REMINDER_BLOCKED_MESSAGE,
  createBillPaymentReminderWrite,
} from '../features/store/useBillPaymentReminderWrite';

function buildBill(): BillRecord {
  return {
    createdAt: '2026-05-19T12:00:00.000Z',
    createdByUserId: 'user_1',
    extrasSplitMode: 'equal',
    fees: 0,
    id: 'bill_1',
    items: [],
    participants: [
      {
        amountOwed: 10,
        id: 'participant_1',
        name: 'Alex',
        paidStatus: 'pending',
        paymentReminderAvailable: true,
        paymentReminderAvailableAt: null,
        userId: 'user_2',
      },
    ],
    restaurantName: 'Dinner',
    status: 'open',
    tax: 0,
    tip: 0,
    title: 'Dinner',
    updatedAt: '2026-05-19T12:00:00.000Z',
  };
}

describe('Bill Payment Reminder write', () => {
  let queryClient: QueryClient;
  let sendReminder: jest.Mock<Promise<BillPaymentReminderApiResponse>, [string, string]>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    sendReminder = jest.fn();
  });

  it('returns a blocked result while offline without calling the transport', async () => {
    const sendPaymentReminder = createBillPaymentReminderWrite({
      isOnline: false,
      queryClient,
      sendReminder,
    });

    await expect(
      sendPaymentReminder({ billId: 'bill_1', participantId: 'participant_1' }),
    ).resolves.toEqual({
      message: BILL_PAYMENT_REMINDER_BLOCKED_MESSAGE,
      status: 'blocked',
    });
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it.each([
    ['sent', 'sent'],
    ['skipped_rate_limited', 'weekly_limited'],
  ] as const)(
    'normalizes %s and applies server-authoritative eligibility to the Bill detail cache',
    async (apiStatus, expectedStatus) => {
      const availableAt = '2026-05-26T12:00:00.000Z';
      const bill = buildBill();
      queryClient.setQueryData(billsQueryKeys.detail(bill.id), bill);
      sendReminder.mockResolvedValue({
        paymentReminderAvailable: false,
        paymentReminderAvailableAt: availableAt,
        status: apiStatus,
      });
      const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
      const sendPaymentReminder = createBillPaymentReminderWrite({
        isOnline: true,
        queryClient,
        sendReminder,
      });

      await expect(
        sendPaymentReminder({ billId: bill.id, participantId: 'participant_1' }),
      ).resolves.toEqual({
        eligibility: { available: false, availableAt },
        status: expectedStatus,
      });
      expect(
        queryClient
          .getQueryData<BillRecord>(billsQueryKeys.detail(bill.id))
          ?.participants.find((participant) => participant.id === 'participant_1'),
      ).toMatchObject({
        paymentReminderAvailable: false,
        paymentReminderAvailableAt: availableAt,
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: billsQueryKeys.detail(bill.id),
      });
    },
  );

  it.each([
    ['skipped_preference_disabled', 'preference_disabled'],
    ['skipped_no_active_device', 'no_active_device'],
    ['provider_failed', 'provider_failed'],
  ] as const)(
    'normalizes non-consuming %s without changing reminder eligibility',
    async (apiStatus, expectedStatus) => {
      const bill = buildBill();
      queryClient.setQueryData(billsQueryKeys.detail(bill.id), bill);
      sendReminder.mockResolvedValue({ status: apiStatus });
      const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
      const sendPaymentReminder = createBillPaymentReminderWrite({
        isOnline: true,
        queryClient,
        sendReminder,
      });

      await expect(
        sendPaymentReminder({ billId: bill.id, participantId: 'participant_1' }),
      ).resolves.toEqual({ status: expectedStatus });
      expect(queryClient.getQueryData(billsQueryKeys.detail(bill.id))).toEqual(bill);
      expect(invalidateQueries).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ status: 'future_status' }],
    [{ status: 'sent' }],
  ])('closes malformed or unknown transport responses as unexpected failures', async (response) => {
    sendReminder.mockResolvedValue(response);
    const sendPaymentReminder = createBillPaymentReminderWrite({
      isOnline: true,
      queryClient,
      sendReminder,
    });

    await expect(
      sendPaymentReminder({ billId: 'bill_1', participantId: 'participant_1' }),
    ).resolves.toEqual({ status: 'unexpected_failure' });
  });

  it('closes transport failures as unexpected failures', async () => {
    sendReminder.mockRejectedValue(new Error('transport failed'));
    const sendPaymentReminder = createBillPaymentReminderWrite({
      isOnline: true,
      queryClient,
      sendReminder,
    });

    await expect(
      sendPaymentReminder({ billId: 'bill_1', participantId: 'participant_1' }),
    ).resolves.toEqual({ status: 'unexpected_failure' });
  });
});
