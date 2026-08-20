import type { QueryClient } from '@tanstack/react-query';

import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayloadMap,
} from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createFeatureOutboxDomainRegistration,
  getReplayIdentityString,
  pickFeatureOutboxReplayIdentity,
  type FeatureOutboxReplayAdapterMap,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import {
  createBill,
  deleteBill,
  markBillParticipantPaid,
  updateBill,
} from './billsStore';
import { billsQueryKeys } from './billsQuery';
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import { profileQueryKeys } from './profileQuery';

type BillWriteOutboxOperationName =
  | 'bill.create'
  | 'bill.update'
  | 'bill.delete'
  | 'bill.status.toggle'
  | 'bill.participant.toggle-paid';

const BILL_ITEM_SPLIT_FIELDS = [
  { key: 'participantId', type: 'string' as const },
  {
    key: 'type',
    type: 'string' as const,
    allowedValues: ['percentage', 'amount'],
  },
  { key: 'value', type: 'number' as const },
] as const;

const BILL_ITEM_FIELDS = [
  { key: 'id', type: 'string' as const },
  { key: 'itemName', type: 'string' as const },
  { key: 'price', type: 'number' as const },
  {
    key: 'assignedToParticipantIds',
    type: 'array' as const,
    items: { type: 'string' as const },
  },
  {
    key: 'splitMode',
    type: 'string' as const,
    allowedValues: ['simple', 'advanced'],
    optional: true,
  },
  {
    key: 'splitConfig',
    type: 'array' as const,
    optional: true,
    items: {
      type: 'record' as const,
      fields: BILL_ITEM_SPLIT_FIELDS,
      rejectUnknownFields: true,
    },
  },
] as const;

const BILL_PARTICIPANT_FIELDS = [
  { key: 'id', type: 'string' as const },
  { key: 'name', type: 'string' as const },
  { key: 'userId', type: 'string' as const, optional: true },
  { key: 'friendshipId', type: 'string' as const, optional: true },
  { key: 'amountOwed', type: 'number' as const },
  { key: 'customTipContribution', type: 'number' as const, optional: true },
  {
    key: 'paidStatus',
    type: 'string' as const,
    allowedValues: ['pending', 'paid'],
  },
  { key: 'paymentReminderAvailable', type: 'boolean' as const, optional: true },
  { key: 'paymentReminderAvailableAt', type: 'string' as const, optional: true },
] as const;

const BILL_UPDATE_FIELDS = [
  { key: 'title', type: 'string' as const, optional: true },
  { key: 'restaurantName', type: 'string' as const, optional: true },
  {
    key: 'items',
    type: 'array' as const,
    optional: true,
    items: {
      type: 'record' as const,
      fields: BILL_ITEM_FIELDS,
      rejectUnknownFields: true,
    },
  },
  {
    key: 'participants',
    type: 'array' as const,
    optional: true,
    items: {
      type: 'record' as const,
      fields: BILL_PARTICIPANT_FIELDS,
      rejectUnknownFields: true,
    },
  },
  { key: 'totalAmount', type: 'number' as const, optional: true },
  { key: 'tax', type: 'number' as const, optional: true },
  { key: 'tip', type: 'number' as const, optional: true },
  { key: 'fees', type: 'number' as const, optional: true },
  {
    key: 'extrasSplitMode',
    type: 'string' as const,
    allowedValues: ['equal', 'proportional'],
    optional: true,
  },
  {
    key: 'status',
    type: 'string' as const,
    allowedValues: ['open', 'settled'],
    optional: true,
  },
] as const;

const BILL_WRITE_OUTBOX_REPLAY_ADAPTERS = {
  'bill.create': replayBillCreate,
  'bill.update': replayBillUpdate,
  'bill.delete': replayBillDelete,
  'bill.status.toggle': replayBillStatusToggle,
  'bill.participant.toggle-paid': replayBillParticipantTogglePaid,
} satisfies Partial<FeatureOutboxReplayAdapterMap<FeatureOutboxOperationName>> &
  FeatureOutboxReplayAdapterMap<BillWriteOutboxOperationName>;

const BILL_LEGACY_PAYLOAD_DECODERS = {
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
};

export const BILL_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'bill.create',
    'bill.update',
    'bill.delete',
    'bill.status.toggle',
    'bill.participant.toggle-paid',
  ] as const,
  legacyPayloadPolicy: 'decode-as-current',
  legacyPayloadDecoders: BILL_LEGACY_PAYLOAD_DECODERS,
  payloadDecoders: {
    'bill.create': createFeatureOutboxPayloadDecoder('bill.create', [
      { key: 'title', type: 'string' },
      { key: 'restaurantName', type: 'string' },
      { key: 'createdByUserId', type: 'string' },
      {
        key: 'items',
        type: 'array',
        items: {
          type: 'record',
          fields: BILL_ITEM_FIELDS,
          rejectUnknownFields: true,
        },
      },
      {
        key: 'participants',
        type: 'array',
        items: {
          type: 'record',
          fields: BILL_PARTICIPANT_FIELDS,
          rejectUnknownFields: true,
        },
      },
      { key: 'totalAmount', type: 'number', optional: true },
      { key: 'tax', type: 'number' },
      { key: 'tip', type: 'number' },
      { key: 'fees', type: 'number' },
      {
        key: 'extrasSplitMode',
        type: 'string',
        allowedValues: ['equal', 'proportional'],
      },
    ]),
    'bill.update': createFeatureOutboxPayloadDecoder('bill.update', [
      { key: 'billId', type: 'string' },
      {
        key: 'updates',
        type: 'record',
        fields: BILL_UPDATE_FIELDS,
        rejectUnknownFields: true,
      },
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
  replayIdentityResolvers: {
    'bill.update': (payload) => pickFeatureOutboxReplayIdentity(payload, ['billId']),
    'bill.delete': (payload) => pickFeatureOutboxReplayIdentity(payload, ['billId']),
    'bill.status.toggle': (payload) => pickFeatureOutboxReplayIdentity(payload, ['billId']),
    'bill.participant.toggle-paid': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['billId']),
  },
  replayCacheEffects: {
    'bill.create': reconcileBillReplayCaches,
    'bill.update': reconcileBillReplayCaches,
    'bill.delete': reconcileBillReplayCaches,
    'bill.status.toggle': reconcileBillReplayCaches,
    'bill.participant.toggle-paid': reconcileBillReplayCaches,
  },
});

async function reconcileBillReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<BillWriteOutboxOperationName>,
): Promise<void> {
  const billId = getReplayIdentityString(outcome, 'billId');
  if (outcome.operationName === 'bill.delete' && billId) {
    queryClient.removeQueries({ queryKey: billsQueryKeys.detail(billId) });
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: billsQueryKeys.root,
      refetchType: outcome.operationName === 'bill.create' ? 'all' : 'active',
    }),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
    ...(billId && outcome.operationName !== 'bill.delete'
      ? [queryClient.invalidateQueries({ queryKey: billsQueryKeys.detail(billId) })]
      : []),
  ]);
}

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
