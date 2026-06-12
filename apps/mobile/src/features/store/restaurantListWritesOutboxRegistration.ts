import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  removeRestaurantFoodItemBookmarkFromList,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  saveRestaurantToDefaultList,
  updateRestaurantList,
} from './featureStore';

export const RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'list.create',
    'list.update',
    'list.delete',
    'list.default.create',
    'list.default.bookmark.save',
    'list.default.restaurant.save',
    'list.restaurant.add',
    'list.restaurant.reorder',
    'list.restaurant.remove.source',
    'list.restaurant.remove.user',
    'list.bookmark.save',
    'list.bookmark.remove',
  ] as const,
  replayAdapters: {
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
    'list.bookmark.remove': replayRestaurantListBookmarkRemove,
  },
});

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
      menuItemId: saveToDefaultPayload.menuItemId,
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

async function replayRestaurantListBookmarkRemove(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeRestaurantFoodItemBookmarkFromList(
    payload as FeatureOutboxOperationPayloadMap['list.bookmark.remove'],
    requestOptions,
  );
}
