import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

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
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import {
  type OfflineAwareFeatureWriteResult,
} from './useOfflineAwareFeatureWrite';
import { useFeatureWriteSubmit } from './useFeatureWriteSubmit';

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
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: billsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
  ]);
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
  const { submitFeatureWrite } = useFeatureWriteSubmit();

  const runUpdateBillWrite = useCallback(
    async (
      { billId, updates }: UpdateBillWriteInput,
      options: { queuedAlert?: Parameters<typeof submitFeatureWrite>[0]['queuedToast'] } = {},
    ): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      return submitFeatureWrite({
        operationName: 'bill.update',
        offline: {
          strategy: 'api',
          input: updateBillApiMutationInput(billId, updates),
        },
        execute: () => updateBill(billId, updates),
        fallbackErrorMessage: 'Could not update bill.',
        onQueued: () => syncSavedBillCaches(queryClient, billId),
        onSuccess: (bill) => syncSavedBillCaches(queryClient, billId, bill),
        queuedToast: options.queuedAlert,
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const createBillWrite = useCallback(
    async (input: CreateBillInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      return submitFeatureWrite({
        operationName: 'bill.create',
        offline: {
          strategy: 'api',
          input: createBillApiMutationInput(input),
        },
        execute: () => createBill(input),
        fallbackErrorMessage: 'Could not create bill.',
        onQueued: () => invalidateBillList(queryClient),
        onSuccess: (bill) => syncSavedBillCaches(queryClient, bill.id, bill),
        queuedToast: {
          analyticsSource: 'useBillWrites',
          subject: 'Bill',
        },
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const updateBillWrite = useCallback(
    async (input: UpdateBillWriteInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> =>
      runUpdateBillWrite(input, { queuedAlert: 'Bill update' }),
    [runUpdateBillWrite],
  );

  const deleteBillWrite = useCallback(
    async ({ billId }: DeleteBillWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      return submitFeatureWrite({
        operationName: 'bill.delete',
        offline: {
          strategy: 'api',
          input: deleteBillApiMutationInput(billId),
        },
        execute: () => deleteBill(billId),
        fallbackErrorMessage: 'Could not delete bill.',
        onQueued: () => syncDeletedBillCaches(queryClient, billId),
        onSuccess: () => syncDeletedBillCaches(queryClient, billId),
        queuedToast: 'Bill delete',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const updateBillStatus = useCallback(
    async ({
      billId,
      status,
    }: UpdateBillStatusWriteInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      return submitFeatureWrite({
        operationName: 'bill.status.toggle',
        offline: {
          strategy: 'api',
          input: updateBillApiMutationInput(billId, { status }),
        },
        execute: () => updateBill(billId, { status }),
        fallbackErrorMessage: 'Could not update bill status.',
        onQueued: () => syncSavedBillCaches(queryClient, billId),
        onSuccess: (bill) => syncSavedBillCaches(queryClient, billId, bill),
        queuedToast: 'Bill status update',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const updateParticipantPaidStatus = useCallback(
    async ({
      billId,
      participantId,
      paidStatus,
    }: UpdateBillParticipantPaidStatusWriteInput): Promise<OfflineAwareFeatureWriteResult<BillRecord>> => {
      return submitFeatureWrite({
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
        fallbackErrorMessage: 'Could not update payment status.',
        onQueued: () => syncSavedBillCaches(queryClient, billId),
        onSuccess: (bill) => syncSavedBillCaches(queryClient, billId, bill),
        queuedToast: 'Payment status update',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  return {
    createBill: createBillWrite,
    deleteBill: deleteBillWrite,
    updateBill: updateBillWrite,
    updateBillStatus,
    updateParticipantPaidStatus,
  };
}
