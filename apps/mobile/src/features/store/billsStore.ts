import { pb } from '../../lib/pocketbase';
import type { BillItemRecord, BillParticipantRecord, BillRecord } from '../models';
import type {
  BillListSummary,
  CreateBillInput,
  UpdateBillInput,
} from './featureStore';
import {
  type FeatureWriteRequestOptions,
  isNotFoundError,
  resolveFeatureWriteHeaders,
  trackFeatureMutation,
} from './featureStoreShared';
import { sendApiRequest } from './pocketbaseGateway';

export type {
  BillListSummary,
  CreateBillInput,
  UpdateBillInput,
} from './featureStore';

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface BillItemSplitApiResponse {
  participantId?: string;
  type?: 'percentage' | 'amount';
  value?: number;
}

interface BillItemApiResponse {
  id: string;
  itemName: string;
  price: number;
  assignedToParticipantIds?: string[];
  splitMode?: 'simple' | 'advanced';
  splitConfig?: BillItemSplitApiResponse[] | null;
}

interface BillParticipantApiResponse {
  id: string;
  name: string;
  userId?: string;
  friendshipId?: string;
  amountOwed: number;
  customTipContribution?: number | null;
  paidStatus?: BillParticipantRecord['paidStatus'];
  paymentReminderAvailable?: boolean;
  paymentReminderAvailableAt?: string | null;
}

interface BillApiResponse {
  id: string;
  title: string;
  restaurantName?: string;
  createdByUserId: string;
  totalAmount?: number;
  items: BillItemApiResponse[];
  participants: BillParticipantApiResponse[];
  tax?: number;
  tip?: number;
  fees?: number;
  splitMode?: BillRecord['splitMode'];
  extrasSplitMode?: BillRecord['extrasSplitMode'];
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface BillListSummaryApiResponseItem {
  id: string;
  title: string;
  status: string;
  participantCount?: number;
  pendingOtherParticipantCount?: number;
  youOwe?: number;
  youAreOwed?: number;
  isCreator?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function sanitizeCurrency(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function normalizeBillStatus(status: string | undefined): BillRecord['status'] {
  return status === 'settled' ? 'settled' : 'open';
}

function mapBillParticipantApiRecord(record: BillParticipantApiResponse): BillParticipantRecord {
  const customTipContribution =
    typeof record.customTipContribution === 'number'
      ? sanitizeCurrency(record.customTipContribution)
      : undefined;

  return {
    id: record.id,
    name: record.name.trim() || 'Unknown',
    userId: record.userId?.trim() || undefined,
    friendshipId: record.friendshipId?.trim() || undefined,
    amountOwed: sanitizeCurrency(record.amountOwed),
    customTipContribution,
    paidStatus: record.paidStatus === 'paid' ? 'paid' : 'pending',
    paymentReminderAvailable: record.paymentReminderAvailable,
    paymentReminderAvailableAt:
      typeof record.paymentReminderAvailableAt === 'string'
        ? record.paymentReminderAvailableAt.trim() || null
        : null,
  };
}

function mapBillItemApiRecord(record: BillItemApiResponse): BillItemRecord {
  const normalizedSplitConfig: BillItemRecord['splitConfig'] = Array.isArray(record.splitConfig)
    ? record.splitConfig
        .filter(
          (
            entry,
          ): entry is {
            participantId: string;
            type: 'percentage' | 'amount';
            value: number;
          } => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }

          if (typeof entry.participantId !== 'string' || !entry.participantId) {
            return false;
          }

          const isSupportedType = entry.type === 'percentage' || entry.type === 'amount';
          const isValidValue = typeof entry.value === 'number' && Number.isFinite(entry.value);
          return isSupportedType && isValidValue;
          },
        )
        .map((entry) => ({
          participantId: entry.participantId,
          type: entry.type,
          value: sanitizeCurrency(entry.value),
        }))
    : null;

  return {
    id: record.id,
    itemName: record.itemName.trim(),
    price: sanitizeCurrency(record.price),
    assignedToParticipantIds: Array.isArray(record.assignedToParticipantIds)
      ? record.assignedToParticipantIds
      : [],
    splitMode: record.splitMode === 'advanced' ? 'advanced' : 'simple',
    splitConfig: normalizedSplitConfig,
  };
}

function mapBillApiResponse(bill: BillApiResponse): BillRecord {
  return {
    id: bill.id,
    title: bill.title.trim(),
    restaurantName: bill.restaurantName?.trim() || bill.title.trim(),
    createdByUserId: bill.createdByUserId,
    totalAmount:
      typeof bill.totalAmount === 'number' ? sanitizeCurrency(bill.totalAmount) : undefined,
    items: Array.isArray(bill.items) ? bill.items.map(mapBillItemApiRecord) : [],
    participants: Array.isArray(bill.participants)
      ? bill.participants.map(mapBillParticipantApiRecord)
      : [],
    tax: sanitizeCurrency(bill.tax),
    tip: sanitizeCurrency(bill.tip),
    fees: sanitizeCurrency(bill.fees),
    splitMode:
      bill.splitMode === 'custom' || bill.splitMode === 'itemized' || bill.splitMode === 'even'
        ? bill.splitMode
        : undefined,
    extrasSplitMode: bill.extrasSplitMode === 'proportional' ? 'proportional' : 'equal',
    status: normalizeBillStatus(bill.status),
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

function mapBillListSummaryApiItem(item: BillListSummaryApiResponseItem): BillListSummary {
  return {
    id: item.id,
    title: item.title,
    status: normalizeBillStatus(item.status),
    participantCount: parseCount(item.participantCount),
    pendingOtherParticipantCount: parseCount(item.pendingOtherParticipantCount),
    youOwe: sanitizeCurrency(item.youOwe),
    youAreOwed: sanitizeCurrency(item.youAreOwed),
    isCreator: item.isCreator === true,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  };
}

export async function listBillSummaries(options?: ReadRequestOptions): Promise<BillListSummary[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const response = await sendApiRequest<BillListSummaryApiResponseItem[]>('/api/bills/summary', {
    method: 'GET',
    signal: options?.signal,
  });

  return response.map(mapBillListSummaryApiItem);
}

export async function getBillById(
  billId: string,
  options?: ReadRequestOptions,
): Promise<BillRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const response = await sendApiRequest<BillApiResponse>(`/api/bills/${encodeURIComponent(billId)}`, {
      method: 'GET',
      signal: options?.signal,
    });
    return mapBillApiResponse(response);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function createBill(
  input: CreateBillInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.create',
    async () => {
      const trimmedTitle = input.title.trim();

      if (!trimmedTitle) {
        throw new Error('Bill title is required.');
      }

      const response = await sendApiRequest<BillApiResponse>('/api/bills', {
        method: 'POST',
        headers: resolveFeatureWriteHeaders(requestOptions),
        body: {
          title: trimmedTitle,
          restaurantName: input.restaurantName.trim(),
          items: input.items.map((item) => ({
            id: item.id,
            itemName: item.itemName.trim(),
            price: sanitizeCurrency(item.price),
            assignedToParticipantIds: item.assignedToParticipantIds,
            splitMode: item.splitMode === 'advanced' ? 'advanced' : 'simple',
            splitConfig: item.splitConfig?.map((entry) => ({
              participantId: entry.participantId,
              type: entry.type,
              value: sanitizeCurrency(entry.value),
            })),
          })),
          participants: input.participants.map((participant) => ({
            id: participant.id,
            name: participant.name.trim(),
            userId: participant.userId?.trim() || undefined,
            amountOwed: sanitizeCurrency(participant.amountOwed),
            paidStatus: participant.paidStatus,
            customTipContribution:
              typeof participant.customTipContribution === 'number'
                ? sanitizeCurrency(participant.customTipContribution)
                : undefined,
          })),
          totalAmount:
            typeof input.totalAmount === 'number' && Number.isFinite(input.totalAmount)
              ? sanitizeCurrency(input.totalAmount)
              : undefined,
          tax: sanitizeCurrency(input.tax),
          tip: sanitizeCurrency(input.tip),
          fees: sanitizeCurrency(input.fees),
          extrasSplitMode: input.extrasSplitMode,
        },
      });

      return mapBillApiResponse(response);
    },
    {
      itemCount: input.items.length,
      participantCount: input.participants.length,
      extrasSplitMode: input.extrasSplitMode,
    },
  );
}

export async function updateBill(
  billId: string,
  updates: UpdateBillInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.update',
    async () => {
      const response = await sendApiRequest<BillApiResponse>(`/api/bills/${encodeURIComponent(billId)}`, {
        method: 'PUT',
        headers: resolveFeatureWriteHeaders(requestOptions),
        body: {
          title: updates.title?.trim(),
          items: updates.items?.map((item) => ({
            id: item.id,
            itemName: item.itemName.trim(),
            price: sanitizeCurrency(item.price),
            assignedToParticipantIds: item.assignedToParticipantIds,
            splitMode: item.splitMode === 'advanced' ? 'advanced' : 'simple',
            splitConfig: item.splitConfig?.map((entry) => ({
              participantId: entry.participantId,
              type: entry.type,
              value: sanitizeCurrency(entry.value),
            })),
          })),
          participants: updates.participants?.map((participant) => ({
            id: participant.id,
            name: participant.name.trim(),
            userId: participant.userId?.trim() || undefined,
            amountOwed: sanitizeCurrency(participant.amountOwed),
            paidStatus: participant.paidStatus,
            customTipContribution:
              typeof participant.customTipContribution === 'number'
                ? sanitizeCurrency(participant.customTipContribution)
                : undefined,
          })),
          totalAmount:
            typeof updates.totalAmount === 'number' && Number.isFinite(updates.totalAmount)
              ? sanitizeCurrency(updates.totalAmount)
              : undefined,
          tax: updates.tax !== undefined ? sanitizeCurrency(updates.tax) : undefined,
          tip: updates.tip !== undefined ? sanitizeCurrency(updates.tip) : undefined,
          fees: updates.fees !== undefined ? sanitizeCurrency(updates.fees) : undefined,
          extrasSplitMode: updates.extrasSplitMode,
          status: updates.status,
        },
      });

      return mapBillApiResponse(response);
    },
    {
      hasTitleUpdate: updates.title !== undefined,
      hasItemsUpdate: updates.items !== undefined,
      hasParticipantsUpdate: updates.participants !== undefined,
      hasTotalAmountUpdate: updates.totalAmount !== undefined,
      hasTaxUpdate: updates.tax !== undefined,
      hasTipUpdate: updates.tip !== undefined,
      hasFeesUpdate: updates.fees !== undefined,
      hasExtrasSplitModeUpdate: updates.extrasSplitMode !== undefined,
      hasStatusUpdate: updates.status !== undefined,
      itemCount: updates.items?.length,
      participantCount: updates.participants?.length,
    },
  );
}

export async function deleteBill(
  billId: string,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  return trackFeatureMutation('bill.delete', async () => {
    try {
      await sendApiRequest(`/api/bills/${encodeURIComponent(billId)}`, {
        method: 'DELETE',
        headers: resolveFeatureWriteHeaders(requestOptions),
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function markBillParticipantPaid(
  billId: string,
  participantId: string,
  paidStatus: BillParticipantRecord['paidStatus'],
  requestOptions?: FeatureWriteRequestOptions,
): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.participant.mark_paid',
    async () => {
      const response = await sendApiRequest<BillApiResponse>(
        `/api/bills/${encodeURIComponent(billId)}/participants/${encodeURIComponent(participantId)}/paid-status`,
        {
          method: 'PATCH',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            paidStatus,
          },
        },
      );

      return mapBillApiResponse(response);
    },
    {
      paidStatus,
    },
  );
}

export type BillPaymentReminderResult = {
  status:
    | 'sent'
    | 'skipped_preference_disabled'
    | 'skipped_no_active_device'
    | 'provider_failed'
    | string;
};

export async function sendBillPaymentReminder(
  billId: string,
  participantId: string,
): Promise<BillPaymentReminderResult> {
  return trackFeatureMutation(
    'bill.participant.payment_reminder',
    async () =>
      sendApiRequest<BillPaymentReminderResult>(
        `/api/bills/${encodeURIComponent(billId)}/participants/${encodeURIComponent(participantId)}/payment-reminder`,
        {
          method: 'POST',
        },
      ),
    {},
  );
}
