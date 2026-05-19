import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { BillParticipantRecord, BillRecord } from '../models';
import type { CreateBillInput, UpdateBillInput } from './featureStore';
import {
  createBill,
  deleteBill,
  markBillParticipantPaid,
  updateBill,
} from './billsStore';
import { billsQueryKeys } from './billsQuery';
import {
  createBillApiMutationInput,
  deleteBillApiMutationInput,
  updateBillApiMutationInput,
  updateBillParticipantPaidStatusApiMutationInput,
} from './featureOutboxOperations';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface UpdateBillWriteInput {
  billId: string;
  updates: UpdateBillInput;
}

interface DeleteBillWriteInput {
  billId: string;
}

interface UpdateBillStatusWriteInput {
  billId: string;
  status: BillRecord['status'];
}

interface UpdateBillParticipantPaidStatusWriteInput {
  billId: string;
  participantId: string;
  paidStatus: BillParticipantRecord['paidStatus'];
}

async function invalidateBillList(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: billsQueryKeys.root });
}

async function syncSavedBillCaches(
  queryClient: QueryClient,
  billId: string,
  bill?: BillRecord,
): Promise<void> {
  if (bill) {
    queryClient.setQueryData(billsQueryKeys.detail(bill.id), bill);
  }

  await Promise.all([
    invalidateBillList(queryClient),
    queryClient.invalidateQueries({ queryKey: billsQueryKeys.detail(bill?.id ?? billId) }),
  ]);
}

async function syncDeletedBillCaches(
  queryClient: QueryClient,
  billId: string,
): Promise<void> {
  await invalidateBillList(queryClient);
  queryClient.removeQueries({ queryKey: billsQueryKeys.detail(billId) });
}

export function useBillWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const runUpdateBillWrite = useCallback(
    async (
      { billId, updates }: UpdateBillWriteInput,
      options: { queuedAlert?: Parameters<typeof showQueuedOfflineAlert>[0] } = {},
    ): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      const result = await writeFeature({
        operationName: 'bill.update',
        offline: {
          strategy: 'api',
          input: updateBillApiMutationInput(billId, updates),
        },
        execute: () => updateBill(billId, updates),
      });

      if (result.status === 'queued') {
        await syncSavedBillCaches(queryClient, billId);
        if (options.queuedAlert) {
          showQueuedOfflineAlert(options.queuedAlert);
        }
        return result;
      }

      await syncSavedBillCaches(queryClient, billId, result.result);
      return result;
    },
    [queryClient, writeFeature],
  );

  const createBillWrite = useCallback(
    async (input: CreateBillInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      const result = await writeFeature({
        operationName: 'bill.create',
        offline: {
          strategy: 'api',
          input: createBillApiMutationInput(input),
        },
        execute: () => createBill(input),
      });

      if (result.status === 'queued') {
        await invalidateBillList(queryClient);
        showQueuedOfflineAlert({
          analyticsSource: 'useBillWrites',
          subject: 'Bill',
        });
        return result;
      }

      await syncSavedBillCaches(queryClient, result.result.id, result.result);
      return result;
    },
    [queryClient, writeFeature],
  );

  const updateBillWrite = useCallback(
    async (input: UpdateBillWriteInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> =>
      runUpdateBillWrite(input, { queuedAlert: 'Bill update' }),
    [runUpdateBillWrite],
  );

  const deleteBillWrite = useCallback(
    async ({ billId }: DeleteBillWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const result = await writeFeature({
        operationName: 'bill.delete',
        offline: {
          strategy: 'api',
          input: deleteBillApiMutationInput(billId),
        },
        execute: () => deleteBill(billId),
      });

      await syncDeletedBillCaches(queryClient, billId);

      if (result.status === 'queued') {
        showQueuedOfflineAlert('Bill delete');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const updateBillStatus = useCallback(
    async ({
      billId,
      status,
    }: UpdateBillStatusWriteInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      const result = await writeFeature({
        operationName: 'bill.status.toggle',
        offline: {
          strategy: 'api',
          input: updateBillApiMutationInput(billId, { status }),
        },
        execute: () => updateBill(billId, { status }),
      });

      if (result.status === 'queued') {
        await syncSavedBillCaches(queryClient, billId);
        showQueuedOfflineAlert('Bill status update');
        return result;
      }

      await syncSavedBillCaches(queryClient, billId, result.result);
      return result;
    },
    [queryClient, writeFeature],
  );

  const updateParticipantPaidStatus = useCallback(
    async ({
      billId,
      participantId,
      paidStatus,
    }: UpdateBillParticipantPaidStatusWriteInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      const result = await writeFeature({
        operationName: 'bill.participant.toggle-paid',
        offline: {
          strategy: 'api',
          input: updateBillParticipantPaidStatusApiMutationInput(
            billId,
            participantId,
            paidStatus,
          ),
        },
        execute: () => markBillParticipantPaid(billId, participantId, paidStatus),
      });

      if (result.status === 'queued') {
        await syncSavedBillCaches(queryClient, billId);
        showQueuedOfflineAlert('Payment status update');
        return result;
      }

      await syncSavedBillCaches(queryClient, billId, result.result);
      return result;
    },
    [queryClient, writeFeature],
  );

  return {
    createBill: createBillWrite,
    deleteBill: deleteBillWrite,
    updateBill: updateBillWrite,
    updateBillStatus,
    updateParticipantPaidStatus,
  };
}
