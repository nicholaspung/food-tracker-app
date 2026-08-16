import { useMemo } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { useConnectivity } from '../../providers/ConnectivityProvider';
import type { BillRecord } from '../models';
import { billsQueryKeys } from './billsQuery';
import {
  sendBillPaymentReminder,
  type BillPaymentReminderApiResponse,
} from './billsStore';

interface BillPaymentReminderWriteInput {
  billId: string;
  participantId: string;
}

interface BillPaymentReminderEligibility {
  available: boolean;
  availableAt: string | null;
}

export type BillPaymentReminderWriteResult =
  | {
      eligibility: BillPaymentReminderEligibility;
      status: 'sent' | 'weekly_limited';
    }
  | {
      status: 'preference_disabled' | 'no_active_device' | 'provider_failed' | 'unexpected_failure';
    }
  | {
      message: string;
      status: 'blocked';
    };

interface BillPaymentReminderWriteRuntime {
  isOnline: boolean;
  queryClient: QueryClient;
  sendReminder?: typeof sendBillPaymentReminder;
}

export const BILL_PAYMENT_REMINDER_BLOCKED_MESSAGE =
  'Connect to the internet to send payment reminders.';

function normalizeEligibility(
  response: BillPaymentReminderApiResponse,
): BillPaymentReminderEligibility | null {
  if (
    typeof response.paymentReminderAvailable !== 'boolean' ||
    !(
      typeof response.paymentReminderAvailableAt === 'string' ||
      response.paymentReminderAvailableAt === null
    )
  ) {
    return null;
  }

  return {
    available: response.paymentReminderAvailable,
    availableAt: response.paymentReminderAvailableAt,
  };
}

async function syncPaymentReminderEligibility(
  queryClient: QueryClient,
  input: BillPaymentReminderWriteInput,
  eligibility: BillPaymentReminderEligibility,
): Promise<void> {
  queryClient.setQueryData<BillRecord | null>(
    billsQueryKeys.detail(input.billId),
    (cachedBill) => {
      if (!cachedBill) {
        return cachedBill;
      }

      return {
        ...cachedBill,
        participants: cachedBill.participants.map((participant) =>
          participant.id === input.participantId
            ? {
                ...participant,
                paymentReminderAvailable: eligibility.available,
                paymentReminderAvailableAt: eligibility.availableAt,
              }
            : participant,
        ),
      };
    },
  );
  await queryClient.invalidateQueries({ queryKey: billsQueryKeys.detail(input.billId) });
}

export function createBillPaymentReminderWrite({
  isOnline,
  queryClient,
  sendReminder = sendBillPaymentReminder,
}: BillPaymentReminderWriteRuntime) {
  return async (
    input: BillPaymentReminderWriteInput,
  ): Promise<BillPaymentReminderWriteResult> => {
    if (!isOnline) {
      return {
        message: BILL_PAYMENT_REMINDER_BLOCKED_MESSAGE,
        status: 'blocked',
      };
    }

    try {
      const response = await sendReminder(input.billId, input.participantId);
      if (response.status === 'sent' || response.status === 'skipped_rate_limited') {
        const eligibility = normalizeEligibility(response);
        if (!eligibility) {
          return { status: 'unexpected_failure' };
        }

        await syncPaymentReminderEligibility(queryClient, input, eligibility);
        return {
          eligibility,
          status: response.status === 'sent' ? 'sent' : 'weekly_limited',
        };
      }

      if (response.status === 'skipped_preference_disabled') {
        return { status: 'preference_disabled' };
      }
      if (response.status === 'skipped_no_active_device') {
        return { status: 'no_active_device' };
      }
      if (response.status === 'provider_failed') {
        return { status: 'provider_failed' };
      }

      return { status: 'unexpected_failure' };
    } catch {
      return { status: 'unexpected_failure' };
    }
  };
}

export function useBillPaymentReminderWrite() {
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

  const sendPaymentReminder = useMemo(
    () => createBillPaymentReminderWrite({ isOnline, queryClient }),
    [isOnline, queryClient],
  );

  return { sendPaymentReminder };
}
