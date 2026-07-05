import type { BillItemRecord, BillParticipantRecord, BillRecord } from '../models';
import type { PaginatedResult, PaginationInput } from './sharedTypes';

export interface BillListSummary {
  id: string;
  title: string;
  status: BillRecord['status'];
  participantCount: number;
  pendingOtherParticipantCount: number;
  youOwe: number;
  youAreOwed: number;
  isCreator: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillListPageSummary {
  billCount: number;
  totalAmount: number;
}

export interface BillListPage extends PaginatedResult<BillListSummary> {
  summary: BillListPageSummary;
}

export interface ListBillSummariesPageInput extends PaginationInput {
  filter?: 'you_owe' | 'you_are_owed' | 'settled';
}

export interface CreateBillInput {
  title: string;
  restaurantName: string;
  createdByUserId: string;
  items: BillItemRecord[];
  participants: BillParticipantRecord[];
  totalAmount?: number;
  tax: number;
  tip: number;
  fees: number;
  extrasSplitMode: BillRecord['extrasSplitMode'];
}

export interface UpdateBillInput {
  title?: string;
  restaurantName?: string;
  items?: BillItemRecord[];
  participants?: BillParticipantRecord[];
  totalAmount?: number;
  tax?: number;
  tip?: number;
  fees?: number;
  extrasSplitMode?: BillRecord['extrasSplitMode'];
  status?: BillRecord['status'];
}
