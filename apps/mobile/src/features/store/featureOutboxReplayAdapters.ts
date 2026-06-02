import type { RecordModel } from 'pocketbase';

import { BILL_WRITE_OUTBOX_REPLAY_ADAPTERS } from './billWritesOutboxReplayAdapter';
import type { FeatureOutboxOperationName, FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import { type FeatureWriteRequestOptions } from './featureStoreShared';
import {
  addRestaurantVisitRatingsToList,
  convertVisitItemToFoodProduct,
  createDefaultRestaurantList,
  createFeedback,
  createFoodProduct,
  createNote,
  createRestaurantList,
  createVisit,
  deleteRestaurantList,
  deleteFoodProduct,
  deleteNote,
  deleteVisit,
  inviteFriend,
  markFriendInviteAccepted,
  markNoteUsed,
  moveRestaurantListRestaurant,
  removeFriend,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  saveRestaurantToDefaultList,
  sendFeedbackMessage,
  updateRestaurantList,
  updateFoodProduct,
  updateNote,
  updateVisit,
} from './featureStore';
import {
  buildHomeFeedDefaultsUpdate,
  mapHomeFeedDefaultsFromRecord,
} from './homeFeedPreferences';
import {
  buildAddOnboardingCardDismissedState,
  buildMainOnboardingCompletedState,
  buildMoreOnboardingCardDismissedState,
  getMobileOnboardingState,
} from './onboardingStore';
import {
  getCollectionRecord,
  saveAuthRecord,
  updateCollectionRecord,
} from './pocketbaseGateway';
import { saveNotificationPreferences } from './notificationPreferencesStore';

type FeatureOutboxReplayAdapter = (
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
) => Promise<void>;

const FEATURE_OUTBOX_REPLAY_ADAPTERS: Partial<Record<FeatureOutboxOperationName, FeatureOutboxReplayAdapter>> = {
  'visit.create': replayVisitCreate,
  'visit.update': replayVisitUpdate,
  'visit.delete': replayVisitDelete,
  'visit.item.convert-to-food-product': replayVisitItemConvertToFoodProduct,
  'food-product.create': replayFoodProductCreate,
  'food-product.update': replayFoodProductUpdate,
  'food-product.delete': replayFoodProductDelete,
  'note.create': replayNoteCreate,
  'note.update': replayNoteUpdate,
  'note.delete': replayNoteDelete,
  'note.mark-used': replayNoteMarkUsed,
  'settings.visibility.save': replaySettingsPreferencesSave,
  'onboarding.main.complete': replayMainOnboardingComplete,
  'onboarding.more-card.dismiss': replayMoreOnboardingCardDismiss,
  'onboarding.add-card.dismiss': replayAddOnboardingCardDismiss,
  'list.create': replayRestaurantListCreate,
  'list.update': replayRestaurantListUpdate,
  'list.delete': replayRestaurantListDelete,
  'list.default.create': replayDefaultRestaurantListCreate,
  'list.default.bookmark.save': replayDefaultRestaurantListBookmarkSave,
  'list.default.restaurant.save': replayDefaultRestaurantListRestaurantSave,
  'list.restaurant.add': replayRestaurantListRestaurantAdd,
  'list.restaurant.reorder': replayRestaurantListRestaurantReorder,
  'list.restaurant.remove.source': replayRestaurantListRestaurantRemoveSource,
  'list.restaurant.remove.user': replayRestaurantListRestaurantRemoveUser,
  'list.bookmark.save': replayRestaurantListBookmarkSave,
  'feedback.create': replayFeedbackCreate,
  'feedback.message.send': replayFeedbackMessageSend,
  'friend.accept': replayFriendAccept,
  'friend.remove': replayFriendRemove,
  'friend.request.send': replayFriendRequestSend,
  'friend.request.reject': replayFriendRequestReject,
  'friend.request.cancel': replayFriendRequestCancel,
  ...BILL_WRITE_OUTBOX_REPLAY_ADAPTERS,
};

export async function replayRegisteredFeatureOutboxOperation(
  operationName: FeatureOutboxOperationName,
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<boolean> {
  const adapter = FEATURE_OUTBOX_REPLAY_ADAPTERS[operationName];
  if (!adapter) {
    return false;
  }

  await adapter(payload, requestOptions);
  return true;
}

async function replayVisitCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createVisit(payload as FeatureOutboxOperationPayloadMap['visit.create'], requestOptions);
}

async function replayVisitUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const visitUpdatePayload = payload as FeatureOutboxOperationPayloadMap['visit.update'];
  await updateVisit(visitUpdatePayload.visitId, visitUpdatePayload.updates, requestOptions);
}

async function replayVisitDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const visitDeletePayload = payload as FeatureOutboxOperationPayloadMap['visit.delete'];
  await deleteVisit(visitDeletePayload.visitId, requestOptions);
}

async function replayVisitItemConvertToFoodProduct(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await convertVisitItemToFoodProduct(
    payload as FeatureOutboxOperationPayloadMap['visit.item.convert-to-food-product'],
    requestOptions,
  );
}

async function replayFoodProductCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFoodProduct(payload as FeatureOutboxOperationPayloadMap['food-product.create'], requestOptions);
}

async function replayFoodProductUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const foodProductUpdatePayload = payload as FeatureOutboxOperationPayloadMap['food-product.update'];
  await updateFoodProduct(
    foodProductUpdatePayload.foodProductId,
    foodProductUpdatePayload.updates,
    requestOptions,
  );
}

async function replayFoodProductDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const foodProductDeletePayload = payload as FeatureOutboxOperationPayloadMap['food-product.delete'];
  await deleteFoodProduct(foodProductDeletePayload.foodProductId, requestOptions);
}

async function replayNoteCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createNote(payload as FeatureOutboxOperationPayloadMap['note.create'], requestOptions);
}

async function replayNoteUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const noteUpdatePayload = payload as FeatureOutboxOperationPayloadMap['note.update'];
  await updateNote(noteUpdatePayload.noteId, noteUpdatePayload.updates, requestOptions);
}

async function replayNoteDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const noteDeletePayload = payload as FeatureOutboxOperationPayloadMap['note.delete'];
  await deleteNote(noteDeletePayload.noteId, requestOptions);
}

async function replayNoteMarkUsed(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await markNoteUsed(payload as FeatureOutboxOperationPayloadMap['note.mark-used'], requestOptions);
}

async function replaySettingsPreferencesSave(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const settingsPayload = payload as FeatureOutboxOperationPayloadMap['settings.visibility.save'];
  const homeFeedDefaultsUpdate = buildHomeFeedDefaultsUpdate(
    mapHomeFeedDefaultsFromRecord(settingsPayload),
  );
  const updatedRecord = await updateCollectionRecord<RecordModel>(
    'users',
    settingsPayload.userId,
    {
      defaultListVisibility: settingsPayload.defaultListVisibility,
      defaultRestaurantVisibility: settingsPayload.defaultRestaurantVisibility,
      defaultVisitVisibility: settingsPayload.defaultVisitVisibility,
      ...homeFeedDefaultsUpdate,
    },
    {
      headers: requestOptions.headers,
    },
  );
  await replayNotificationPreferencesSave(settingsPayload, requestOptions);
  saveAuthRecord(updatedRecord);
}

async function replayNotificationPreferencesSave(
  settingsPayload: FeatureOutboxOperationPayloadMap['settings.visibility.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveNotificationPreferences(
    {
      notificationBillsEnabled: settingsPayload.bill_owed_enabled,
      notificationMonthlyFriendsActivityEnabled: settingsPayload.monthly_friends_activity_enabled,
      notificationTastingInvitesEnabled: settingsPayload.tasting_invites_enabled,
    },
    requestOptions,
  );
}

async function replayMainOnboardingComplete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const onboardingPayload = payload as FeatureOutboxOperationPayloadMap['onboarding.main.complete'];
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
}

async function replayMoreOnboardingCardDismiss(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const onboardingPayload = payload as FeatureOutboxOperationPayloadMap['onboarding.more-card.dismiss'];
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
}

async function replayAddOnboardingCardDismiss(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const onboardingPayload = payload as FeatureOutboxOperationPayloadMap['onboarding.add-card.dismiss'];
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
}

async function replayRestaurantListCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createRestaurantList(payload as FeatureOutboxOperationPayloadMap['list.create'], requestOptions);
}

async function replayRestaurantListUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const listUpdatePayload = payload as FeatureOutboxOperationPayloadMap['list.update'];
  await updateRestaurantList(
    listUpdatePayload.listId,
    listUpdatePayload.updates,
    undefined,
    requestOptions,
  );
}

async function replayRestaurantListDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const listDeletePayload = payload as FeatureOutboxOperationPayloadMap['list.delete'];
  await deleteRestaurantList(listDeletePayload.listId, requestOptions);
}

async function replayDefaultRestaurantListCreate(
  _payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createDefaultRestaurantList(requestOptions);
}

async function replayDefaultRestaurantListBookmarkSave(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const saveToDefaultPayload =
    payload as FeatureOutboxOperationPayloadMap['list.default.bookmark.save'];
  const defaultList = await createDefaultRestaurantList(requestOptions);
  await saveRestaurantFoodItemToList(
    {
      listId: defaultList.id,
      restaurantId: saveToDefaultPayload.restaurantId,
      foodItemId: saveToDefaultPayload.foodItemId,
      note: saveToDefaultPayload.note,
      sourceUserId: saveToDefaultPayload.sourceUserId,
    },
    requestOptions,
  );
}

async function replayDefaultRestaurantListRestaurantSave(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveRestaurantToDefaultList(
    payload as FeatureOutboxOperationPayloadMap['list.default.restaurant.save'],
    requestOptions,
  );
}

async function replayRestaurantListRestaurantAdd(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await addRestaurantVisitRatingsToList(
    payload as FeatureOutboxOperationPayloadMap['list.restaurant.add'],
    requestOptions,
  );
}

async function replayRestaurantListRestaurantReorder(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await moveRestaurantListRestaurant(
    payload as FeatureOutboxOperationPayloadMap['list.restaurant.reorder'],
    requestOptions,
  );
}

async function replayRestaurantListRestaurantRemoveSource(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeRestaurantListSourceRating(
    payload as FeatureOutboxOperationPayloadMap['list.restaurant.remove.source'],
    requestOptions,
  );
}

async function replayRestaurantListRestaurantRemoveUser(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const removeUserRatingPayload =
    payload as FeatureOutboxOperationPayloadMap['list.restaurant.remove.user'];
  await removeRestaurantListUserRating(
    removeUserRatingPayload.listId,
    removeUserRatingPayload.listItemId,
    requestOptions,
  );
}

async function replayRestaurantListBookmarkSave(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveRestaurantFoodItemToList(
    payload as FeatureOutboxOperationPayloadMap['list.bookmark.save'],
    requestOptions,
  );
}

async function replayFeedbackCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFeedback(payload as FeatureOutboxOperationPayloadMap['feedback.create'], requestOptions);
}

async function replayFeedbackMessageSend(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await sendFeedbackMessage(
    payload as FeatureOutboxOperationPayloadMap['feedback.message.send'],
    requestOptions,
  );
}

async function replayFriendAccept(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendAcceptPayload = payload as FeatureOutboxOperationPayloadMap['friend.accept'];
  await markFriendInviteAccepted(friendAcceptPayload.friendId, requestOptions);
}

async function replayFriendRemove(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendRemovePayload = payload as FeatureOutboxOperationPayloadMap['friend.remove'];
  await removeFriend(friendRemovePayload.friendId, requestOptions);
}

async function replayFriendRequestSend(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await inviteFriend(payload as FeatureOutboxOperationPayloadMap['friend.request.send'], requestOptions);
}

async function replayFriendRequestReject(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendRejectPayload = payload as FeatureOutboxOperationPayloadMap['friend.request.reject'];
  await removeFriend(friendRejectPayload.friendId, requestOptions);
}

async function replayFriendRequestCancel(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const friendCancelPayload = payload as FeatureOutboxOperationPayloadMap['friend.request.cancel'];
  await removeFriend(friendCancelPayload.friendId, requestOptions);
}
