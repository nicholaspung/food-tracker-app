import { pb } from '../../lib/pocketbase';
import type { BillItemRecord, BillParticipantRecord, BillRecord } from '../models';
import type {
  BillListSummary,
  CreateBillInput,
  UpdateBillInput,
} from './featureStore';
import {
  isNotFoundError,
  nowIso,
  trackFeatureMutation,
} from './featureStoreShared';
import { listCollectionRecords, sendApiRequest } from './pocketbaseGateway';

export type {
  BillListSummary,
  CreateBillInput,
  UpdateBillInput,
} from './featureStore';

interface BillCollectionRecord {
  id: string;
  creator_user: string;
  bill_name: string;
  total_amount: number;
  tax?: number;
  tip?: number;
  fees?: number;
  split_mode: 'even' | 'itemized' | 'custom';
  extras_split_mode: BillRecord['extrasSplitMode'];
  status: 'active' | 'settled' | 'cancelled';
  created: string;
  updated: string;
}

interface BillParticipantCollectionRecord {
  id: string;
  bill: string;
  user?: string | null;
  participant_name?: string;
  amount_owed: number;
  paid_status: BillParticipantRecord['paidStatus'];
  paid_date?: string | null;
  payment_method?: string | null;
  custom_tip_contribution?: number | null;
  created: string;
  updated: string;
}

interface BillItemCollectionRecord {
  id: string;
  bill: string;
  item_name: string;
  price: number;
  assigned_to: string[];
  split_mode?: 'simple' | 'advanced';
  split_config?: {
    participant_id: string;
    type: 'percentage' | 'amount';
    value: number;
  }[] | null;
  created: string;
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

const BILL_ITEM_LIST_FIELDS = 'id,bill,item_name,price,assigned_to,split_mode,split_config,created';

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

async function listBillParticipantsForBillId(
  billId: string,
): Promise<BillParticipantCollectionRecord[]> {
  return listCollectionRecords<BillParticipantCollectionRecord>('bill_participants', {
    filter: `bill = "${billId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    sort: 'created',
  });
}

async function listBillItemsForBillId(
  billId: string,
): Promise<BillItemCollectionRecord[]> {
  return listCollectionRecords<BillItemCollectionRecord>('bill_items', {
    filter: `bill = "${billId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    sort: 'created',
    fields: BILL_ITEM_LIST_FIELDS,
  });
}

export async function listBillSummaries(): Promise<BillListSummary[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const response = await sendApiRequest<BillListSummaryApiResponseItem[]>('/api/bills/summary', {
    method: 'GET',
  });

  return response.map(mapBillListSummaryApiItem);
}

export async function getBillById(billId: string): Promise<BillRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const response = await sendApiRequest<BillApiResponse>(`/api/bills/${encodeURIComponent(billId)}`, {
      method: 'GET',
    });
    return mapBillApiResponse(response);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function createBill(input: CreateBillInput): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.create',
    async () => {
      const trimmedTitle = input.title.trim();

      if (!trimmedTitle) {
        throw new Error('Bill title is required.');
      }

      const response = await sendApiRequest<BillApiResponse>('/api/bills', {
        method: 'POST',
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

export async function updateBill(billId: string, updates: UpdateBillInput): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.update',
    async () => {
      const response = await sendApiRequest<BillApiResponse>(`/api/bills/${encodeURIComponent(billId)}`, {
        method: 'PUT',
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

export async function deleteBill(billId: string): Promise<void> {
  return trackFeatureMutation('bill.delete', async () => {
    const [participants, items] = await Promise.all([
      listBillParticipantsForBillId(billId),
      listBillItemsForBillId(billId),
    ]);

    await Promise.all(
      items.map(async (item) => {
        try {
          await pb.collection('bill_items').delete(item.id);
        } catch (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw error;
        }
      }),
    );

    await Promise.all(
      participants.map(async (participant) => {
        try {
          await pb.collection('bill_participants').delete(participant.id);
        } catch (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw error;
        }
      }),
    );

    try {
      await pb.collection('bills').delete(billId);
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
): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.participant.mark_paid',
    async () => {
      await pb.collection('bill_participants').update<BillParticipantCollectionRecord>(participantId, {
        paid_status: paidStatus,
        paid_date: paidStatus === 'paid' ? nowIso() : null,
      });

      const participants = await listBillParticipantsForBillId(billId);
      const nextStatus: BillCollectionRecord['status'] =
        participants.every((participant) => participant.paid_status === 'paid') ? 'settled' : 'active';

      await pb.collection('bills').update<BillCollectionRecord>(billId, {
        status: nextStatus,
      });

      const hydratedBill = await getBillById(billId);
      if (!hydratedBill) {
        throw new Error('Updated bill could not be loaded.');
      }

      return hydratedBill;
    },
    {
      paidStatus,
    },
  );
}
