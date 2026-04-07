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

interface BillParticipantCollectionUserExpand {
  id: string;
  name?: string;
  email?: string;
}

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
  expand?: {
    user?: BillParticipantCollectionUserExpand;
  };
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

function normalizeBillRecordStatus(status: BillCollectionRecord['status']): BillRecord['status'] {
  return status === 'settled' ? 'settled' : 'open';
}

function resolveBillParticipantName(record: BillParticipantCollectionRecord): string {
  const explicitName = record.participant_name?.trim();
  if (explicitName) {
    return explicitName;
  }

  const expandedName = record.expand?.user?.name?.trim();
  if (expandedName) {
    return expandedName;
  }

  const expandedEmail = record.expand?.user?.email?.trim();
  if (expandedEmail) {
    return expandedEmail.split('@')[0];
  }

  return 'Unknown';
}

function mapBillParticipantRecord(record: BillParticipantCollectionRecord): BillParticipantRecord {
  const customTipContribution =
    typeof record.custom_tip_contribution === 'number'
      ? sanitizeCurrency(record.custom_tip_contribution)
      : undefined;

  return {
    id: record.id,
    name: resolveBillParticipantName(record),
    userId: record.user ?? undefined,
    amountOwed: sanitizeCurrency(record.amount_owed),
    customTipContribution,
    paidStatus: record.paid_status === 'paid' ? 'paid' : 'pending',
  };
}

function mapBillItemRecord(record: BillItemCollectionRecord): BillItemRecord {
  const normalizedSplitConfig = Array.isArray(record.split_config)
    ? record.split_config
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }

          if (typeof entry.participant_id !== 'string' || !entry.participant_id) {
            return false;
          }

          const isSupportedType = entry.type === 'percentage' || entry.type === 'amount';
          const isValidValue = typeof entry.value === 'number' && Number.isFinite(entry.value);
          return isSupportedType && isValidValue;
        })
        .map((entry) => ({
          participantId: entry.participant_id,
          type: entry.type,
          value: sanitizeCurrency(entry.value),
        }))
    : null;

  return {
    id: record.id,
    itemName: record.item_name,
    price: sanitizeCurrency(record.price),
    assignedToParticipantIds: Array.isArray(record.assigned_to) ? record.assigned_to : [],
    splitMode: record.split_mode === 'advanced' ? 'advanced' : 'simple',
    splitConfig: normalizedSplitConfig,
  };
}

function mapBillRecord(
  bill: BillCollectionRecord,
  participants: BillParticipantCollectionRecord[],
  items: BillItemCollectionRecord[],
): BillRecord {
  const billTax = sanitizeCurrency(bill.tax);
  const billTip = sanitizeCurrency(bill.tip);
  const billFees = sanitizeCurrency(bill.fees);

  return {
    id: bill.id,
    title: bill.bill_name,
    restaurantName: bill.bill_name,
    createdByUserId: bill.creator_user,
    totalAmount: sanitizeCurrency(bill.total_amount),
    items: items.map(mapBillItemRecord),
    participants: participants.map(mapBillParticipantRecord),
    tax: billTax,
    tip: billTip,
    fees: billFees,
    splitMode: bill.split_mode,
    extrasSplitMode: bill.extras_split_mode,
    status: normalizeBillRecordStatus(bill.status),
    createdAt: bill.created,
    updatedAt: bill.updated,
  };
}

function mapBillListSummaryApiItem(item: BillListSummaryApiResponseItem): BillListSummary {
  return {
    id: item.id,
    title: item.title,
    status: item.status === 'settled' ? 'settled' : 'open',
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
    expand: 'user',
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

async function mapBillWithRelations(bill: BillCollectionRecord): Promise<BillRecord> {
  const [participants, items] = await Promise.all([
    listBillParticipantsForBillId(bill.id),
    listBillItemsForBillId(bill.id),
  ]);

  return mapBillRecord(bill, participants, items);
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
    const bill = await pb.collection('bills').getOne<BillCollectionRecord>(billId);
    return mapBillWithRelations(bill);
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

      return sendApiRequest<BillRecord>('/api/bills', {
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
      return sendApiRequest<BillRecord>(`/api/bills/${encodeURIComponent(billId)}`, {
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
