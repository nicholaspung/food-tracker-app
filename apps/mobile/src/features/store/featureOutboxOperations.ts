import type { RecordModel } from 'pocketbase';

import { env } from '../../config/env';
import type { EnqueueMutationInput, QueuedMutation } from '../../offline/types';
import { getCollectionRecord, saveAuthRecord, updateCollectionRecord } from './pocketbaseGateway';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  buildMainOnboardingCompletedState,
  buildAddOnboardingCardDismissedState,
  buildMoreOnboardingCardDismissedState,
  getMobileOnboardingState,
  type CompleteMainOnboardingInput,
  type DismissAddOnboardingCardInput,
  type DismissMoreOnboardingCardInput,
} from './onboardingStore';
import type { BillParticipantRecord, BillRecord } from '../models';
import {
  addRestaurantVisitRatingsToList,
  createBill,
  createDefaultRestaurantList,
  createFeedback,
  createNote,
  createFoodProduct,
  convertVisitItemToFoodProduct,
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
  type ConvertVisitItemToFoodProductInput,
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

type ConvertVisitItemToFoodProductOperationPayload = ConvertVisitItemToFoodProductInput;

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

interface MainOnboardingCompleteOperationPayload extends CompleteMainOnboardingInput {
  userId: string;
}

interface MoreOnboardingCardDismissOperationPayload extends DismissMoreOnboardingCardInput {
  userId: string;
}

interface AddOnboardingCardDismissOperationPayload extends DismissAddOnboardingCardInput {
  userId: string;
}

export interface FeatureOutboxOperationPayloadMap {
  'settings.visibility.save': SettingsVisibilitySaveOperationPayload;
  'onboarding.main.complete': MainOnboardingCompleteOperationPayload;
  'onboarding.more-card.dismiss': MoreOnboardingCardDismissOperationPayload;
  'onboarding.add-card.dismiss': AddOnboardingCardDismissOperationPayload;
  'visit.create': CreateVisitInput;
  'visit.update': VisitUpdateOperationPayload;
  'visit.delete': VisitDeleteOperationPayload;
  'visit.item.convert-to-food-product': ConvertVisitItemToFoodProductOperationPayload;
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
  'onboarding.main.complete',
  'onboarding.more-card.dismiss',
  'onboarding.add-card.dismiss',
  'visit.create',
  'visit.update',
  'visit.delete',
  'visit.item.convert-to-food-product',
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
  const requestOptions = createReplayFeatureWriteRequestOptions(mutation);

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
        {
          headers: requestOptions.headers,
        },
      );
      saveAuthRecord(updatedRecord);
      return true;
    }
    case 'onboarding.main.complete': {
      const onboardingPayload = payload as MainOnboardingCompleteOperationPayload;
      const currentRecord = await getCollectionRecord<RecordModel & { mobileOnboardingState?: unknown }>(
        'users',
        onboardingPayload.userId,
      );
      const updatedRecord = await updateCollectionRecord<RecordModel>(
        'users',
        onboardingPayload.userId,
        {
          mobileOnboardingState: buildMainOnboardingCompletedState(
            getMobileOnboardingState(currentRecord),
            {
              completedAt: onboardingPayload.completedAt,
              version: onboardingPayload.version,
            },
          ),
        },
        {
          headers: requestOptions.headers,
        },
      );
      saveAuthRecord(updatedRecord);
      return true;
    }
    case 'onboarding.more-card.dismiss': {
      const onboardingPayload = payload as MoreOnboardingCardDismissOperationPayload;
      const currentRecord = await getCollectionRecord<RecordModel & { mobileOnboardingState?: unknown }>(
        'users',
        onboardingPayload.userId,
      );
      const updatedRecord = await updateCollectionRecord<RecordModel>(
        'users',
        onboardingPayload.userId,
        {
          mobileOnboardingState: buildMoreOnboardingCardDismissedState(
            getMobileOnboardingState(currentRecord),
            {
              cardId: onboardingPayload.cardId,
              dismissedAt: onboardingPayload.dismissedAt,
            },
          ),
        },
        {
          headers: requestOptions.headers,
        },
      );
      saveAuthRecord(updatedRecord);
      return true;
    }
    case 'onboarding.add-card.dismiss': {
      const onboardingPayload = payload as AddOnboardingCardDismissOperationPayload;
      const currentRecord = await getCollectionRecord<RecordModel & { mobileOnboardingState?: unknown }>(
        'users',
        onboardingPayload.userId,
      );
      const updatedRecord = await updateCollectionRecord<RecordModel>(
        'users',
        onboardingPayload.userId,
        {
          mobileOnboardingState: buildAddOnboardingCardDismissedState(
            getMobileOnboardingState(currentRecord),
            {
              cardId: onboardingPayload.cardId,
              dismissedAt: onboardingPayload.dismissedAt,
            },
          ),
        },
        {
          headers: requestOptions.headers,
        },
      );
      saveAuthRecord(updatedRecord);
      return true;
    }
    case 'visit.create':
      await createVisit(payload as CreateVisitInput, requestOptions);
      return true;
    case 'visit.update': {
      const visitUpdatePayload = payload as VisitUpdateOperationPayload;
      await updateVisit(visitUpdatePayload.visitId, visitUpdatePayload.updates, requestOptions);
      return true;
    }
    case 'visit.delete': {
      const visitDeletePayload = payload as VisitDeleteOperationPayload;
      await deleteVisit(visitDeletePayload.visitId, requestOptions);
      return true;
    }
    case 'visit.item.convert-to-food-product':
      await convertVisitItemToFoodProduct(
        payload as ConvertVisitItemToFoodProductOperationPayload,
        requestOptions,
      );
      return true;
    case 'food-product.create':
      await createFoodProduct(payload as CreateFoodProductInput, requestOptions);
      return true;
    case 'food-product.update': {
      const foodProductUpdatePayload = payload as FoodProductUpdateOperationPayload;
      await updateFoodProduct(
        foodProductUpdatePayload.foodProductId,
        foodProductUpdatePayload.updates,
        requestOptions,
      );
      return true;
    }
    case 'food-product.delete': {
      const foodProductDeletePayload = payload as FoodProductDeleteOperationPayload;
      await deleteFoodProduct(foodProductDeletePayload.foodProductId, requestOptions);
      return true;
    }
    case 'note.create':
      await createNote(payload as CreateNoteInput, requestOptions);
      return true;
    case 'note.update': {
      const noteUpdatePayload = payload as NoteUpdateOperationPayload;
      await updateNote(noteUpdatePayload.noteId, noteUpdatePayload.updates, requestOptions);
      return true;
    }
    case 'note.delete': {
      const noteDeletePayload = payload as NoteDeleteOperationPayload;
      await deleteNote(noteDeletePayload.noteId, requestOptions);
      return true;
    }
    case 'note.mark-used':
      await markNoteUsed(payload as NoteMarkUsedOperationPayload, requestOptions);
      return true;
    case 'list.create':
      await createRestaurantList(payload as CreateRestaurantListInput, requestOptions);
      return true;
    case 'list.update': {
      const listUpdatePayload = payload as RestaurantListUpdateOperationPayload;
      await updateRestaurantList(
        listUpdatePayload.listId,
        listUpdatePayload.updates,
        undefined,
        requestOptions,
      );
      return true;
    }
    case 'list.delete': {
      const listDeletePayload = payload as RestaurantListDeleteOperationPayload;
      await deleteRestaurantList(listDeletePayload.listId, requestOptions);
      return true;
    }
    case 'list.default.create':
      await createDefaultRestaurantList(requestOptions);
      return true;
    case 'list.default.bookmark.save': {
      const saveToDefaultPayload = payload as SaveBookmarkToDefaultListOperationPayload;
      const defaultList = await createDefaultRestaurantList(requestOptions);
      await saveRestaurantFoodItemToList({
        listId: defaultList.id,
        restaurantId: saveToDefaultPayload.restaurantId,
        foodItemId: saveToDefaultPayload.foodItemId,
        note: saveToDefaultPayload.note,
        sourceUserId: saveToDefaultPayload.sourceUserId,
      }, requestOptions);
      return true;
    }
    case 'list.restaurant.add':
      await addRestaurantVisitRatingsToList(
        payload as AddRestaurantVisitRatingsToListInput,
        requestOptions,
      );
      return true;
    case 'list.restaurant.reorder':
      await moveRestaurantListRestaurant(payload as MoveRestaurantListRestaurantInput, requestOptions);
      return true;
    case 'list.restaurant.remove.source':
      await removeRestaurantListSourceRating(
        payload as RemoveRestaurantListSourceRatingInput,
        requestOptions,
      );
      return true;
    case 'list.restaurant.remove.user': {
      const removeUserRatingPayload = payload as RemoveRestaurantListUserRatingOperationPayload;
      await removeRestaurantListUserRating(
        removeUserRatingPayload.listId,
        removeUserRatingPayload.listItemId,
        requestOptions,
      );
      return true;
    }
    case 'list.bookmark.save':
      await saveRestaurantFoodItemToList(payload as SaveRestaurantFoodItemToListInput, requestOptions);
      return true;
    case 'bill.create':
      await createBill(payload as CreateBillInput, requestOptions);
      return true;
    case 'bill.update': {
      const billUpdatePayload = payload as BillUpdateOperationPayload;
      await updateBill(billUpdatePayload.billId, billUpdatePayload.updates, requestOptions);
      return true;
    }
    case 'bill.delete': {
      const billDeletePayload = payload as BillDeleteOperationPayload;
      await deleteBill(billDeletePayload.billId, requestOptions);
      return true;
    }
    case 'bill.status.toggle': {
      const billStatusPayload = payload as BillStatusToggleOperationPayload;
      await updateBill(billStatusPayload.billId, {
        status: billStatusPayload.status,
      }, requestOptions);
      return true;
    }
    case 'bill.participant.toggle-paid': {
      const billParticipantPayload = payload as BillParticipantTogglePaidOperationPayload;
      await markBillParticipantPaid(
        billParticipantPayload.billId,
        billParticipantPayload.participantId,
        billParticipantPayload.paidStatus,
        requestOptions,
      );
      return true;
    }
    case 'feedback.create':
      await createFeedback(payload as CreateFeedbackInput, requestOptions);
      return true;
    case 'feedback.message.send':
      await sendFeedbackMessage(payload as SendFeedbackMessageInput, requestOptions);
      return true;
    case 'friend.accept': {
      const friendAcceptPayload = payload as FriendAcceptOperationPayload;
      await markFriendInviteAccepted(friendAcceptPayload.friendId, requestOptions);
      return true;
    }
    case 'friend.remove': {
      const friendRemovePayload = payload as FriendRemoveOperationPayload;
      await removeFriend(friendRemovePayload.friendId, requestOptions);
      return true;
    }
    case 'friend.request.send':
      await inviteFriend(payload as InviteFriendInput, requestOptions);
      return true;
    case 'friend.request.reject': {
      const friendRejectPayload = payload as FriendRemoveOperationPayload;
      await removeFriend(friendRejectPayload.friendId, requestOptions);
      return true;
    }
    case 'friend.request.cancel': {
      const friendCancelPayload = payload as FriendRemoveOperationPayload;
      await removeFriend(friendCancelPayload.friendId, requestOptions);
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

function createReplayFeatureWriteRequestOptions(
  mutation: QueuedMutation,
): FeatureWriteRequestOptions {
  return {
    headers: {
      ...mutation.headers,
      'Idempotency-Key': mutation.idempotencyKey,
      'X-Idempotency-Key': mutation.idempotencyKey,
    },
  };
}
