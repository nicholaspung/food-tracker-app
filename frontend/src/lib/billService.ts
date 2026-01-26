/**
 * Bill service for CRUD operations with PocketBase
 */

import { pb, Bill, BillParticipant, BillItem, BillReminder, BillItemSplitConfig } from './pocketbase';
import { repositories } from '@/repositories';
import type { RecordListOptions } from 'pocketbase';

export interface CreateBillData {
  bill_name: string;
  total_amount: number;
  tax: number;
  tip: number;
  fees: number;
  split_mode: 'even' | 'itemized' | 'custom';
  extras_split_mode: 'proportional' | 'equal';
  status: 'active' | 'settled' | 'cancelled';
  payer_id?: string; // User ID of who paid the bill (defaults to current user)
  participants: Array<{
    user_id?: string | null;
    participant_name?: string;
    amount_owed: number;
    custom_tip_contribution?: number | null; // Custom tip amount if set
  }>;
  items?: Array<{
    item_name: string;
    price: number;
    assigned_to_indices: number[]; // Indices of participants array
    split_mode?: 'simple' | 'advanced'; // How the item is split
    split_config?: Array<{
      participant_index: number; // Index into participants array
      type: 'percentage' | 'amount';
      value: number;
    }>;
  }>;
}

export interface UpdateBillData {
  bill_name?: string;
  total_amount?: number;
  tax?: number;
  tip?: number;
  fees?: number;
  status?: 'active' | 'settled' | 'cancelled';
}

export interface BillWithDetails extends Bill {
  participants: BillParticipant[];
  items?: BillItem[];
}

/**
 * Create a new bill with participants and items
 */
export async function createBill(data: CreateBillData): Promise<BillWithDetails> {
  const currentUser = pb.authStore.record;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }

  // Create the bill
  const bill = await repositories.bills.create({
    creator_user: currentUser.id,
    bill_name: data.bill_name,
    total_amount: data.total_amount,
    tax: data.tax,
    tip: data.tip,
    fees: data.fees,
    split_mode: data.split_mode,
    extras_split_mode: data.extras_split_mode,
    status: data.status,
  });

  // Create participants
  // Determine who paid the bill (defaults to current user if not specified)
  const payerId = data.payer_id || currentUser.id;

  const participants: BillParticipant[] = [];
  for (const participantData of data.participants) {
    const isPayer = participantData.user_id === payerId;
    const participant = await repositories.billParticipants.create({
      bill: bill.id,
      user: participantData.user_id || null,
      participant_name: participantData.participant_name || '',
      amount_owed: participantData.amount_owed,
      paid_status: isPayer ? 'paid' : 'pending',
      paid_date: isPayer ? new Date().toISOString() : null,
      custom_tip_contribution: participantData.custom_tip_contribution ?? null,
    }, {
      expand: 'user',
    });
    participants.push(participant);
  }

  // Create items if itemized split
  let items: BillItem[] | undefined;
  if (data.split_mode === 'itemized' && data.items) {
    items = [];
    for (const itemData of data.items) {
      // Map indices to participant IDs
      const assignedParticipantIds = itemData.assigned_to_indices.map(
        index => participants[index].id
      );

      // Build split_config with participant IDs instead of indices
      let splitConfig: BillItemSplitConfig[] | undefined;
      if (itemData.split_mode === 'advanced' && itemData.split_config) {
        splitConfig = itemData.split_config.map(config => ({
          participant_id: participants[config.participant_index].id,
          type: config.type,
          value: config.value,
        }));
      }

      const item = await repositories.billItems.create({
        bill: bill.id,
        item_name: itemData.item_name,
        price: itemData.price,
        assigned_to: assignedParticipantIds,
        split_mode: itemData.split_mode || 'simple',
        split_config: splitConfig || null,
      });
      items.push(item);
    }
  }

  return {
    ...bill,
    participants,
    items,
  };
}

/**
 * Get a bill by ID with participants and items
 */
export async function getBill(billId: string): Promise<BillWithDetails> {
  const bill = await repositories.bills.getOne(billId);

  const participants = await repositories.billParticipants.getByBill(billId, {
    sort: 'created',
    expand: 'user',
  });

  let items: BillItem[] | undefined;
  if (bill.split_mode === 'itemized') {
    items = await repositories.billItems.getByBill(billId, {
      sort: 'created',
    });
  }

  return {
    ...bill,
    participants,
    items,
  };
}

/**
 * List bills for the current user
 */
export async function listBills(
  filter?: 'all' | 'you_owe' | 'you_are_owed' | 'settled',
  options?: RecordListOptions
): Promise<BillWithDetails[]> {
  const currentUser = pb.authStore.record;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }

  // Build filter query
  let filterQuery = '';

  if (filter === 'settled') {
    // Settled bills where user is creator OR participant
    const participantRecords = await repositories.billParticipants.getFullList({
      filter: `user="${currentUser.id}"`,
    });

    const participantBillIds = participantRecords.map(p => p.bill);
    const creatorFilter = `creator_user="${currentUser.id}" && status="settled"`;
    const participantFilter =
      participantBillIds.length > 0
        ? `(${participantBillIds.map(id => `id="${id}"`).join(' || ')}) && status="settled"`
        : '';

    filterQuery =
      participantFilter !== ''
        ? `(${creatorFilter}) || (${participantFilter})`
        : creatorFilter;
  } else if (filter === 'you_owe') {
    // Bills where user is a participant and hasn't paid
    const participantRecords = await repositories.billParticipants.getFullList({
      filter: `user="${currentUser.id}" && paid_status="pending"`,
    });

    const billIds = participantRecords.map(p => p.bill);
    if (billIds.length === 0) {
      return [];
    }

    filterQuery = billIds.map(id => `id="${id}"`).join(' || ');
  } else if (filter === 'you_are_owed') {
    // Bills created by user where someone else hasn't paid
    filterQuery = `creator_user="${currentUser.id}" && status="active"`;
  } else {
    // All bills (created by user or where user is participant)
    const participantRecords = await repositories.billParticipants.getFullList({
      filter: `user="${currentUser.id}"`,
    });

    const participantBillIds = participantRecords.map(p => p.bill);
    const creatorFilter = `creator_user="${currentUser.id}"`;
    const participantFilter =
      participantBillIds.length > 0
        ? participantBillIds.map(id => `id="${id}"`).join(' || ')
        : '';

    filterQuery =
      participantFilter !== ''
        ? `(${creatorFilter}) || (${participantFilter})`
        : creatorFilter;
  }

  const bills = await repositories.bills.getFullList({
    filter: filterQuery,
    sort: '-created',
    ...options,
  });

  // Fetch participants and items for each bill
  const billsWithDetails: BillWithDetails[] = [];
  for (const bill of bills) {
    const participants = await repositories.billParticipants.getByBill(bill.id, {
      sort: 'created',
      expand: 'user',
    });

    let items: BillItem[] | undefined;
    if (bill.split_mode === 'itemized') {
      items = await repositories.billItems.getByBill(bill.id, {
        sort: 'created',
      });
    }

    billsWithDetails.push({
      ...bill,
      participants,
      items,
    });
  }

  return billsWithDetails;
}

/**
 * Update a bill
 */
export async function updateBill(
  billId: string,
  data: UpdateBillData
): Promise<Bill> {
  return await repositories.bills.update(billId, data);
}

/**
 * Delete a bill
 */
export async function deleteBill(billId: string): Promise<void> {
  await repositories.bills.delete(billId);
}

/**
 * Mark a participant's payment as received
 */
export async function markParticipantPaid(
  participantId: string,
  paymentMethod?: string
): Promise<BillParticipant> {
  return await repositories.billParticipants.update(participantId, {
    paid_status: 'paid',
    paid_date: new Date().toISOString(),
    payment_method: paymentMethod || null,
  });
}

/**
 * Mark a participant's payment as pending
 */
export async function markParticipantPending(
  participantId: string
): Promise<BillParticipant> {
  return await repositories.billParticipants.update(participantId, {
    paid_status: 'pending',
    paid_date: null,
    payment_method: null,
  });
}

/**
 * Update a participant's amount owed
 */
export async function updateParticipantAmount(
  participantId: string,
  amountOwed: number
): Promise<BillParticipant> {
  return await repositories.billParticipants.update(participantId, {
    amount_owed: Math.round(amountOwed * 100) / 100,
  });
}

/**
 * Update a participant's custom tip contribution
 */
export async function updateParticipantCustomTip(
  participantId: string,
  customTipContribution: number | null
): Promise<BillParticipant> {
  return await repositories.billParticipants.update(participantId, {
    custom_tip_contribution: customTipContribution,
  });
}

/**
 * Update a participant's amount and custom tip
 */
export async function updateParticipantFull(
  participantId: string,
  amountOwed: number,
  customTipContribution: number | null
): Promise<BillParticipant> {
  return await repositories.billParticipants.update(participantId, {
    amount_owed: Math.round(amountOwed * 100) / 100,
    custom_tip_contribution: customTipContribution,
  });
}

/**
 * Update a bill item's split configuration
 */
export async function updateBillItem(
  itemId: string,
  data: {
    item_name?: string;
    price?: number;
    assigned_to?: string[];
    split_mode?: 'simple' | 'advanced';
    split_config?: BillItemSplitConfig[] | null;
  }
): Promise<BillItem> {
  return await repositories.billItems.update(itemId, data);
}

/**
 * Delete a bill item
 */
export async function deleteBillItem(itemId: string): Promise<void> {
  await repositories.billItems.delete(itemId);
}

/**
 * Create a new bill item
 */
export async function createBillItem(
  billId: string,
  data: {
    item_name: string;
    price: number;
    assigned_to: string[];
    split_mode?: 'simple' | 'advanced';
    split_config?: BillItemSplitConfig[] | null;
  }
): Promise<BillItem> {
  return await repositories.billItems.create({
    bill: billId,
    item_name: data.item_name,
    price: data.price,
    assigned_to: data.assigned_to,
    split_mode: data.split_mode || 'simple',
    split_config: data.split_config || null,
  });
}

/**
 * Send a payment reminder to a participant
 */
export async function sendPaymentReminder(
  billId: string,
  participantId: string
): Promise<BillReminder> {
  const currentUser = pb.authStore.record;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }

  return await repositories.billReminders.create({
    bill: billId,
    participant: participantId,
    sent_by: currentUser.id,
  });
}

/**
 * Get reminders for a bill
 */
export async function getBillReminders(billId: string): Promise<BillReminder[]> {
  return await repositories.billReminders.getByBill(billId);
}

/**
 * Get last reminder sent to a participant
 */
export async function getLastReminderForParticipant(
  billId: string,
  participantId: string
): Promise<BillReminder | null> {
  return await repositories.billReminders.getLastForParticipant(billId, participantId);
}

/**
 * Mark a bill as settled
 */
export async function settleBill(billId: string): Promise<Bill> {
  return await updateBill(billId, { status: 'settled' });
}

/**
 * Reopen a settled bill
 */
export async function reopenBill(billId: string): Promise<Bill> {
  return await updateBill(billId, { status: 'active' });
}
