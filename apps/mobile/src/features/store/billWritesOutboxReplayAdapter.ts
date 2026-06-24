import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayloadMap,
} from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createFeatureOutboxDomainRegistration,
  type FeatureOutboxReplayAdapterMap,
} from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
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

const BILL_WRITE_OUTBOX_REPLAY_ADAPTERS = {
  'bill.create': replayBillCreate,
  'bill.update': replayBillUpdate,
  'bill.delete': replayBillDelete,
  'bill.status.toggle': replayBillStatusToggle,
  'bill.participant.toggle-paid': replayBillParticipantTogglePaid,
} satisfies Partial<FeatureOutboxReplayAdapterMap<FeatureOutboxOperationName>> &
  FeatureOutboxReplayAdapterMap<BillWriteOutboxOperationName>;

export const BILL_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'bill.create',
    'bill.update',
    'bill.delete',
    'bill.status.toggle',
    'bill.participant.toggle-paid',
  ] as const,
  payloadDecoders: {
    'bill.create': createFeatureOutboxPayloadDecoder('bill.create', [
      { key: 'title', type: 'string' },
      { key: 'restaurantName', type: 'string' },
      { key: 'items', type: 'array' },
      { key: 'participants', type: 'array' },
    ]),
    'bill.update': createFeatureOutboxPayloadDecoder('bill.update', [
      { key: 'billId', type: 'string' },
      { key: 'updates', type: 'record' },
    ]),
    'bill.delete': createFeatureOutboxPayloadDecoder('bill.delete', [
      { key: 'billId', type: 'string' },
    ]),
    'bill.status.toggle': createFeatureOutboxPayloadDecoder('bill.status.toggle', [
      { key: 'billId', type: 'string' },
      { key: 'status', type: 'string', allowedValues: ['open', 'settled'] },
    ]),
    'bill.participant.toggle-paid': createFeatureOutboxPayloadDecoder(
      'bill.participant.toggle-paid',
      [
        { key: 'billId', type: 'string' },
        { key: 'participantId', type: 'string' },
        { key: 'paidStatus', type: 'string', allowedValues: ['pending', 'paid'] },
      ],
    ),
  },
  replayAdapters: BILL_WRITE_OUTBOX_REPLAY_ADAPTERS,
});

async function replayBillCreate(
  payload: FeatureOutboxOperationPayloadMap['bill.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createBill(payload, requestOptions);
}

async function replayBillUpdate(
  billPayload: FeatureOutboxOperationPayloadMap['bill.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateBill(billPayload.billId, billPayload.updates, requestOptions);
}

async function replayBillDelete(
  billPayload: FeatureOutboxOperationPayloadMap['bill.delete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await deleteBill(billPayload.billId, requestOptions);
}

async function replayBillStatusToggle(
  billPayload: FeatureOutboxOperationPayloadMap['bill.status.toggle'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateBill(
    billPayload.billId,
    {
      status: billPayload.status,
    },
    requestOptions,
  );
}

async function replayBillParticipantTogglePaid(
  billPayload: FeatureOutboxOperationPayloadMap['bill.participant.toggle-paid'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await markBillParticipantPaid(
    billPayload.billId,
    billPayload.participantId,
    billPayload.paidStatus,
    requestOptions,
  );
}
