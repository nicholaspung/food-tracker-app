import type { RecordModel } from 'pocketbase';

import { env } from '../../config/env';
import type { EnqueueMutationInput, QueuedMutation } from '../../offline/types';
import { saveAuthRecord, updateCollectionRecord } from './pocketbaseGateway';
import type { BillParticipantRecord, BillRecord } from '../models';
import {
  addRestaurantVisitRatingsToList,
  createBill,
  createDefaultRestaurantList,
  createFeedback,
  createNote,
  createFoodProduct,
  createRestaurantList,
  createVisit,
  deleteBill,
  deleteNote,
  deleteFoodProduct,
  deleteRestaurantList,
  deleteVisit,
  inviteFriend,
  markNoteUsed,
  markBillParticipantPaid,
  markFriendInviteAccepted,
  moveRestaurantListRestaurant,
  removeFriend,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  sendFeedbackMessage,
  updateFoodProduct,
  updateRestaurantList,
  updateVisit,
  updateBill,
  updateNote,
  type AddRestaurantVisitRatingsToListInput,
  type CreateBillInput,
  type CreateFeedbackInput,
  type CreateNoteInput,
  type CreateFoodProductInput,
  type CreateRestaurantListInput,
  type CreateVisitInput,
  type InviteFriendInput,
  type MarkNoteUsedInput,
  type MoveRestaurantListRestaurantInput,
  type RemoveRestaurantListSourceRatingInput,
  type SaveRestaurantFoodItemToListInput,
  type SendFeedbackMessageInput,
  type UpdateFoodProductInput,
  type UpdateRestaurantListInput,
  type UpdateVisitInput,
  type UpdateBillInput,
  type UpdateNoteInput,
} from './featureStore';

const FEATURE_OUTBOX_URL_PREFIX = 'local://feature/';

type EmptyOperationPayload = Record<string, never>;

interface VisitUpdateOperationPayload {
  visitId: string;
  updates: UpdateVisitInput;
}

interface VisitDeleteOperationPayload {
  visitId: string;
}

interface FoodProductUpdateOperationPayload {
  foodProductId: string;
  updates: UpdateFoodProductInput;
}

interface FoodProductDeleteOperationPayload {
  foodProductId: string;
}

interface NoteUpdateOperationPayload {
  noteId: string;
  updates: UpdateNoteInput;
}

interface NoteDeleteOperationPayload {
  noteId: string;
}

type NoteMarkUsedOperationPayload = MarkNoteUsedInput;

interface RestaurantListUpdateOperationPayload {
  listId: string;
  updates: UpdateRestaurantListInput;
}

interface RestaurantListDeleteOperationPayload {
  listId: string;
}

interface SaveBookmarkToDefaultListOperationPayload {
  restaurantId: string;
  foodItemId: string;
  note?: string;
  sourceUserId?: string;
}

interface RemoveRestaurantListUserRatingOperationPayload {
  listId: string;
  listItemId: string;
}

interface BillUpdateOperationPayload {
  billId: string;
  updates: UpdateBillInput;
}

interface BillDeleteOperationPayload {
  billId: string;
}

interface BillStatusToggleOperationPayload {
  billId: string;
  status: BillRecord['status'];
}

interface BillParticipantTogglePaidOperationPayload {
  billId: string;
  participantId: string;
  paidStatus: BillParticipantRecord['paidStatus'];
}

interface FriendAcceptOperationPayload {
  friendId: string;
}

interface FriendRemoveOperationPayload {
  friendId: string;
}

interface SettingsVisibilitySaveOperationPayload {
  userId: string;
  defaultVisitVisibility: 'friends' | 'private';
  defaultRestaurantVisibility: 'private' | 'friends';
  defaultListVisibility: 'private' | 'friends';
}

export interface FeatureOutboxOperationPayloadMap {
  'settings.visibility.save': SettingsVisibilitySaveOperationPayload;
  'visit.create': CreateVisitInput;
  'visit.update': VisitUpdateOperationPayload;
  'visit.delete': VisitDeleteOperationPayload;
  'food-product.create': CreateFoodProductInput;
  'food-product.update': FoodProductUpdateOperationPayload;
  'food-product.delete': FoodProductDeleteOperationPayload;
  'note.create': CreateNoteInput;
  'note.update': NoteUpdateOperationPayload;
  'note.delete': NoteDeleteOperationPayload;
  'note.mark-used': NoteMarkUsedOperationPayload;
  'list.create': CreateRestaurantListInput;
  'list.update': RestaurantListUpdateOperationPayload;
  'list.delete': RestaurantListDeleteOperationPayload;
  'list.default.create': EmptyOperationPayload;
  'list.default.bookmark.save': SaveBookmarkToDefaultListOperationPayload;
  'list.restaurant.add': AddRestaurantVisitRatingsToListInput;
  'list.restaurant.reorder': MoveRestaurantListRestaurantInput;
  'list.restaurant.remove.source': RemoveRestaurantListSourceRatingInput;
  'list.restaurant.remove.user': RemoveRestaurantListUserRatingOperationPayload;
  'list.bookmark.save': SaveRestaurantFoodItemToListInput;
  'bill.create': CreateBillInput;
  'bill.update': BillUpdateOperationPayload;
  'bill.delete': BillDeleteOperationPayload;
  'bill.status.toggle': BillStatusToggleOperationPayload;
  'bill.participant.toggle-paid': BillParticipantTogglePaidOperationPayload;
  'feedback.create': CreateFeedbackInput;
  'feedback.message.send': SendFeedbackMessageInput;
  'friend.accept': FriendAcceptOperationPayload;
  'friend.remove': FriendRemoveOperationPayload;
  'friend.request.send': InviteFriendInput;
  'friend.request.reject': FriendRemoveOperationPayload;
  'friend.request.cancel': FriendRemoveOperationPayload;
}

export type FeatureOutboxOperationName = keyof FeatureOutboxOperationPayloadMap;
export type FeatureOutboxOperationPayload<TName extends FeatureOutboxOperationName> =
  FeatureOutboxOperationPayloadMap[TName];

const FEATURE_OUTBOX_OPERATION_NAMES = new Set<FeatureOutboxOperationName>([
  'settings.visibility.save',
  'visit.create',
  'visit.update',
  'visit.delete',
  'food-product.create',
  'food-product.update',
  'food-product.delete',
  'note.create',
  'note.update',
  'note.delete',
  'note.mark-used',
  'list.create',
  'list.update',
  'list.delete',
  'list.default.create',
  'list.default.bookmark.save',
  'list.restaurant.add',
  'list.restaurant.reorder',
  'list.restaurant.remove.source',
  'list.restaurant.remove.user',
  'list.bookmark.save',
  'bill.create',
  'bill.update',
  'bill.delete',
  'bill.status.toggle',
  'bill.participant.toggle-paid',
  'feedback.create',
  'feedback.message.send',
  'friend.accept',
  'friend.remove',
  'friend.request.send',
  'friend.request.reject',
  'friend.request.cancel',
]);

function buildFeatureOutboxUrl(operationName: FeatureOutboxOperationName): string {
  return `${FEATURE_OUTBOX_URL_PREFIX}${operationName}`;
}

function parseFeatureOutboxOperationName(url: string): FeatureOutboxOperationName | null {
  if (!url.startsWith(FEATURE_OUTBOX_URL_PREFIX)) {
    return null;
  }

  const rawName = decodeURIComponent(url.slice(FEATURE_OUTBOX_URL_PREFIX.length));
  if (FEATURE_OUTBOX_OPERATION_NAMES.has(rawName as FeatureOutboxOperationName)) {
    return rawName as FeatureOutboxOperationName;
  }

  return null;
}

export function createFeatureOutboxMutationInput<TName extends FeatureOutboxOperationName>(
  operationName: TName,
  payload: FeatureOutboxOperationPayload<TName>,
): EnqueueMutationInput {
  return {
    method: 'POST',
    url: buildFeatureOutboxUrl(operationName),
    headers: {
      'X-Mobile-Write-Operation': operationName,
    },
    body: payload,
  };
}

export function createVisitApiMutationInput(payload: CreateVisitInput): EnqueueMutationInput {
  return {
    method: 'POST',
    url: `${env.pocketbaseUrl}/api/visits`,
    headers: {
      'X-Mobile-Write-Operation': 'visit.create',
    },
    body: {
      restaurantId: payload.restaurantId,
      restaurantName: payload.restaurantName,
      items: payload.items,
      visitedAt: payload.visitedAt,
      visitedOn: payload.visitedOn,
      visibility: payload.visibility,
      source: payload.source,
    },
  };
}

export function moveVisitItemApiMutationInput(
  itemId: string,
  destinationVisitId: string,
): EnqueueMutationInput {
  return {
    method: 'POST',
    url: `${env.pocketbaseUrl}/api/visit-items/${encodeURIComponent(itemId)}/move`,
    headers: {
      'X-Mobile-Write-Operation': 'visit.item.move',
    },
    body: {
      destinationVisitId,
    },
  };
}

export function createBillApiMutationInput(payload: CreateBillInput): EnqueueMutationInput {
  return {
    method: 'POST',
    url: `${env.pocketbaseUrl}/api/bills`,
    headers: {
      'X-Mobile-Write-Operation': 'bill.create',
    },
    body: payload,
  };
}

export function updateBillApiMutationInput(
  billId: string,
  updates: UpdateBillInput,
): EnqueueMutationInput {
  return {
    method: 'PUT',
    url: `${env.pocketbaseUrl}/api/bills/${encodeURIComponent(billId)}`,
    headers: {
      'X-Mobile-Write-Operation': 'bill.update',
    },
    body: updates,
  };
}

export function deleteBillApiMutationInput(billId: string): EnqueueMutationInput {
  return {
    method: 'DELETE',
    url: `${env.pocketbaseUrl}/api/bills/${encodeURIComponent(billId)}`,
    headers: {
      'X-Mobile-Write-Operation': 'bill.delete',
    },
  };
}

export function updateBillParticipantPaidStatusApiMutationInput(
  billId: string,
  participantId: string,
  paidStatus: BillParticipantRecord['paidStatus'],
): EnqueueMutationInput {
  return {
    method: 'PATCH',
    url: `${env.pocketbaseUrl}/api/bills/${encodeURIComponent(billId)}/participants/${encodeURIComponent(participantId)}/paid-status`,
    headers: {
      'X-Mobile-Write-Operation': 'bill.participant.toggle-paid',
    },
    body: {
      paidStatus,
    },
  };
}

export async function replayFeatureOutboxMutation(mutation: QueuedMutation): Promise<boolean> {
  const operationName = parseFeatureOutboxOperationName(mutation.url);
  if (!operationName) {
    return false;
  }

  const payload = parseMutationPayload(mutation.body);

  switch (operationName) {
    case 'settings.visibility.save': {
      const settingsPayload = payload as SettingsVisibilitySaveOperationPayload;
      const updatedRecord = await updateCollectionRecord<RecordModel>(
        'users',
        settingsPayload.userId,
        {
          defaultListVisibility: settingsPayload.defaultListVisibility,
          defaultRestaurantVisibility: settingsPayload.defaultRestaurantVisibility,
          defaultVisitVisibility: settingsPayload.defaultVisitVisibility,
        },
      );
      saveAuthRecord(updatedRecord);
      return true;
    }
    case 'visit.create':
      await createVisit(payload as CreateVisitInput);
      return true;
    case 'visit.update': {
      const visitUpdatePayload = payload as VisitUpdateOperationPayload;
      await updateVisit(visitUpdatePayload.visitId, visitUpdatePayload.updates);
      return true;
    }
    case 'visit.delete': {
      const visitDeletePayload = payload as VisitDeleteOperationPayload;
      await deleteVisit(visitDeletePayload.visitId);
      return true;
    }
    case 'food-product.create':
      await createFoodProduct(payload as CreateFoodProductInput);
      return true;
    case 'food-product.update': {
      const foodProductUpdatePayload = payload as FoodProductUpdateOperationPayload;
      await updateFoodProduct(foodProductUpdatePayload.foodProductId, foodProductUpdatePayload.updates);
      return true;
    }
    case 'food-product.delete': {
      const foodProductDeletePayload = payload as FoodProductDeleteOperationPayload;
      await deleteFoodProduct(foodProductDeletePayload.foodProductId);
      return true;
    }
    case 'note.create':
      await createNote(payload as CreateNoteInput);
      return true;
    case 'note.update': {
      const noteUpdatePayload = payload as NoteUpdateOperationPayload;
      await updateNote(noteUpdatePayload.noteId, noteUpdatePayload.updates);
      return true;
    }
    case 'note.delete': {
      const noteDeletePayload = payload as NoteDeleteOperationPayload;
      await deleteNote(noteDeletePayload.noteId);
      return true;
    }
    case 'note.mark-used':
      await markNoteUsed(payload as NoteMarkUsedOperationPayload);
      return true;
    case 'list.create':
      await createRestaurantList(payload as CreateRestaurantListInput);
      return true;
    case 'list.update': {
      const listUpdatePayload = payload as RestaurantListUpdateOperationPayload;
      await updateRestaurantList(listUpdatePayload.listId, listUpdatePayload.updates);
      return true;
    }
    case 'list.delete': {
      const listDeletePayload = payload as RestaurantListDeleteOperationPayload;
      await deleteRestaurantList(listDeletePayload.listId);
      return true;
    }
    case 'list.default.create':
      await createDefaultRestaurantList();
      return true;
    case 'list.default.bookmark.save': {
      const saveToDefaultPayload = payload as SaveBookmarkToDefaultListOperationPayload;
      const defaultList = await createDefaultRestaurantList();
      await saveRestaurantFoodItemToList({
        listId: defaultList.id,
        restaurantId: saveToDefaultPayload.restaurantId,
        foodItemId: saveToDefaultPayload.foodItemId,
        note: saveToDefaultPayload.note,
        sourceUserId: saveToDefaultPayload.sourceUserId,
      });
      return true;
    }
    case 'list.restaurant.add':
      await addRestaurantVisitRatingsToList(payload as AddRestaurantVisitRatingsToListInput);
      return true;
    case 'list.restaurant.reorder':
      await moveRestaurantListRestaurant(payload as MoveRestaurantListRestaurantInput);
      return true;
    case 'list.restaurant.remove.source':
      await removeRestaurantListSourceRating(payload as RemoveRestaurantListSourceRatingInput);
      return true;
    case 'list.restaurant.remove.user': {
      const removeUserRatingPayload = payload as RemoveRestaurantListUserRatingOperationPayload;
      await removeRestaurantListUserRating(removeUserRatingPayload.listId, removeUserRatingPayload.listItemId);
      return true;
    }
    case 'list.bookmark.save':
      await saveRestaurantFoodItemToList(payload as SaveRestaurantFoodItemToListInput);
      return true;
    case 'bill.create':
      await createBill(payload as CreateBillInput);
      return true;
    case 'bill.update': {
      const billUpdatePayload = payload as BillUpdateOperationPayload;
      await updateBill(billUpdatePayload.billId, billUpdatePayload.updates);
      return true;
    }
    case 'bill.delete': {
      const billDeletePayload = payload as BillDeleteOperationPayload;
      await deleteBill(billDeletePayload.billId);
      return true;
    }
    case 'bill.status.toggle': {
      const billStatusPayload = payload as BillStatusToggleOperationPayload;
      await updateBill(billStatusPayload.billId, {
        status: billStatusPayload.status,
      });
      return true;
    }
    case 'bill.participant.toggle-paid': {
      const billParticipantPayload = payload as BillParticipantTogglePaidOperationPayload;
      await markBillParticipantPaid(
        billParticipantPayload.billId,
        billParticipantPayload.participantId,
        billParticipantPayload.paidStatus,
      );
      return true;
    }
    case 'feedback.create':
      await createFeedback(payload as CreateFeedbackInput);
      return true;
    case 'feedback.message.send':
      await sendFeedbackMessage(payload as SendFeedbackMessageInput);
      return true;
    case 'friend.accept': {
      const friendAcceptPayload = payload as FriendAcceptOperationPayload;
      await markFriendInviteAccepted(friendAcceptPayload.friendId);
      return true;
    }
    case 'friend.remove': {
      const friendRemovePayload = payload as FriendRemoveOperationPayload;
      await removeFriend(friendRemovePayload.friendId);
      return true;
    }
    case 'friend.request.send':
      await inviteFriend(payload as InviteFriendInput);
      return true;
    case 'friend.request.reject': {
      const friendRejectPayload = payload as FriendRemoveOperationPayload;
      await removeFriend(friendRejectPayload.friendId);
      return true;
    }
    case 'friend.request.cancel': {
      const friendCancelPayload = payload as FriendRemoveOperationPayload;
      await removeFriend(friendCancelPayload.friendId);
      return true;
    }
    default:
      return false;
  }
}

function parseMutationPayload(value: string | null): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
