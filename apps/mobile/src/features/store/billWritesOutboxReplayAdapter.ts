import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayloadMap,
} from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import {
  createBill,
  deleteBill,
  markBillParticipantPaid,
  updateBill,
} from './billsStore';

type BillWriteOutboxOperationName =
  | 'bill.create'
  | 'bill.update'
  | 'bill.delete'
  | 'bill.status.toggle'
  | 'bill.participant.toggle-paid';

type BillWriteOutboxReplayAdapter = (
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
) => Promise<void>;

const BILL_WRITE_OUTBOX_REPLAY_ADAPTERS = {
  'bill.create': replayBillCreate,
  'bill.update': replayBillUpdate,
  'bill.delete': replayBillDelete,
  'bill.status.toggle': replayBillStatusToggle,
  'bill.participant.toggle-paid': replayBillParticipantTogglePaid,
} satisfies Partial<Record<FeatureOutboxOperationName, BillWriteOutboxReplayAdapter>> &
  Record<BillWriteOutboxOperationName, BillWriteOutboxReplayAdapter>;

export const BILL_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'bill.create',
    'bill.update',
    'bill.delete',
    'bill.status.toggle',
    'bill.participant.toggle-paid',
  ] as const,
  replayAdapters: BILL_WRITE_OUTBOX_REPLAY_ADAPTERS,
});

async function replayBillCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createBill(payload as FeatureOutboxOperationPayloadMap['bill.create'], requestOptions);
}

async function replayBillUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const billPayload = payload as FeatureOutboxOperationPayloadMap['bill.update'];
  await updateBill(billPayload.billId, billPayload.updates, requestOptions);
}

async function replayBillDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const billPayload = payload as FeatureOutboxOperationPayloadMap['bill.delete'];
  await deleteBill(billPayload.billId, requestOptions);
}

async function replayBillStatusToggle(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const billPayload = payload as FeatureOutboxOperationPayloadMap['bill.status.toggle'];
  await updateBill(
    billPayload.billId,
    {
      status: billPayload.status,
    },
    requestOptions,
  );
}

async function replayBillParticipantTogglePaid(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const billPayload = payload as FeatureOutboxOperationPayloadMap['bill.participant.toggle-paid'];
  await markBillParticipantPaid(
    billPayload.billId,
    billPayload.participantId,
    billPayload.paidStatus,
    requestOptions,
  );
}
