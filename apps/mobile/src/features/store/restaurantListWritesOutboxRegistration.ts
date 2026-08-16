import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import {
  createEmptyFeatureOutboxPayloadDecoder,
  createFeatureOutboxPayloadDecoder,
} from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  moveRestaurantListRestaurant,
  organizeRestaurantListItem,
  removeRestaurantFoodItemBookmarkFromList,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  saveRestaurantToDefaultList,
  updateRestaurantList,
} from './restaurantListsStore';

export const RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'list.create',
    'list.update',
    'list.delete',
    'list.default.create',
    'list.default.bookmark.save',
    'list.default.restaurant.save',
    'list.item.organize',
    'list.restaurant.add',
    'list.restaurant.reorder',
    'list.restaurant.remove.source',
    'list.restaurant.remove.user',
    'list.bookmark.save',
    'list.bookmark.remove',
  ] as const,
  payloadDecoders: {
    'list.create': createFeatureOutboxPayloadDecoder('list.create', [
      { key: 'name', type: 'string' },
    ]),
    'list.update': createFeatureOutboxPayloadDecoder('list.update', [
      { key: 'listId', type: 'string' },
      { key: 'updates', type: 'record' },
    ]),
    'list.delete': createFeatureOutboxPayloadDecoder('list.delete', [
      { key: 'listId', type: 'string' },
    ]),
    'list.default.create': createEmptyFeatureOutboxPayloadDecoder('list.default.create'),
    'list.default.bookmark.save': createFeatureOutboxPayloadDecoder(
      'list.default.bookmark.save',
      [{ key: 'restaurantId', type: 'string' }],
    ),
    'list.default.restaurant.save': createFeatureOutboxPayloadDecoder(
      'list.default.restaurant.save',
      [{ key: 'restaurantId', type: 'string' }],
    ),
    'list.item.organize': createFeatureOutboxPayloadDecoder('list.item.organize', [
      { key: 'currentListId', type: 'string' },
      { key: 'destinationListIds', type: 'array' },
      { key: 'representations', type: 'array' },
      { key: 'restaurantId', type: 'string' },
    ]),
    'list.restaurant.add': createFeatureOutboxPayloadDecoder('list.restaurant.add', [
      { key: 'listId', type: 'string' },
      { key: 'restaurantId', type: 'string' },
    ]),
    'list.restaurant.reorder': createFeatureOutboxPayloadDecoder('list.restaurant.reorder', [
      { key: 'listId', type: 'string' },
      { key: 'restaurantId', type: 'string' },
      { key: 'direction', type: 'string', allowedValues: ['up', 'down'] },
    ]),
    'list.restaurant.remove.source': createFeatureOutboxPayloadDecoder(
      'list.restaurant.remove.source',
      [
        { key: 'listId', type: 'string' },
        { key: 'listItemId', type: 'string' },
        { key: 'foodItemId', type: 'string' },
      ],
    ),
    'list.restaurant.remove.user': createFeatureOutboxPayloadDecoder(
      'list.restaurant.remove.user',
      [
        { key: 'listId', type: 'string' },
        { key: 'listItemId', type: 'string' },
      ],
    ),
    'list.bookmark.save': createFeatureOutboxPayloadDecoder('list.bookmark.save', [
      { key: 'listId', type: 'string' },
      { key: 'restaurantId', type: 'string' },
    ]),
    'list.bookmark.remove': createFeatureOutboxPayloadDecoder('list.bookmark.remove', [
      { key: 'listId', type: 'string' },
      { key: 'restaurantId', type: 'string' },
    ]),
  },
  replayAdapters: {
    'list.create': replayRestaurantListCreate,
    'list.update': replayRestaurantListUpdate,
    'list.delete': replayRestaurantListDelete,
    'list.default.create': replayDefaultRestaurantListCreate,
    'list.default.bookmark.save': replayDefaultRestaurantListBookmarkSave,
    'list.default.restaurant.save': replayDefaultRestaurantListRestaurantSave,
    'list.item.organize': replayRestaurantListItemOrganization,
    'list.restaurant.add': replayRestaurantListRestaurantAdd,
    'list.restaurant.reorder': replayRestaurantListRestaurantReorder,
    'list.restaurant.remove.source': replayRestaurantListRestaurantRemoveSource,
    'list.restaurant.remove.user': replayRestaurantListRestaurantRemoveUser,
    'list.bookmark.save': replayRestaurantListBookmarkSave,
    'list.bookmark.remove': replayRestaurantListBookmarkRemove,
  },
});

async function replayRestaurantListCreate(
  payload: FeatureOutboxOperationPayloadMap['list.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createRestaurantList(payload, requestOptions);
}

async function replayRestaurantListUpdate(
  listUpdatePayload: FeatureOutboxOperationPayloadMap['list.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateRestaurantList(
    listUpdatePayload.listId,
    listUpdatePayload.updates,
    undefined,
    requestOptions,
  );
}

async function replayRestaurantListDelete(
  listDeletePayload: FeatureOutboxOperationPayloadMap['list.delete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await deleteRestaurantList(listDeletePayload.listId, requestOptions);
}

async function replayDefaultRestaurantListCreate(
  _payload: FeatureOutboxOperationPayloadMap['list.default.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createDefaultRestaurantList(requestOptions);
}

async function replayDefaultRestaurantListBookmarkSave(
  saveToDefaultPayload: FeatureOutboxOperationPayloadMap['list.default.bookmark.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const defaultList = await createDefaultRestaurantList(requestOptions);
  await saveRestaurantFoodItemToList(
    {
      listId: defaultList.id,
      restaurantId: saveToDefaultPayload.restaurantId,
      foodItemId: saveToDefaultPayload.foodItemId,
      menuItemId: saveToDefaultPayload.menuItemId,
      note: saveToDefaultPayload.note,
      sourceListId: saveToDefaultPayload.sourceListId,
      sourceListItemId: saveToDefaultPayload.sourceListItemId,
      sourceUserId: saveToDefaultPayload.sourceUserId,
    },
    requestOptions,
  );
}

async function replayDefaultRestaurantListRestaurantSave(
  payload: FeatureOutboxOperationPayloadMap['list.default.restaurant.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveRestaurantToDefaultList(payload, requestOptions);
}

async function replayRestaurantListItemOrganization(
  payload: FeatureOutboxOperationPayloadMap['list.item.organize'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await organizeRestaurantListItem(payload, requestOptions);
}

async function replayRestaurantListRestaurantAdd(
  payload: FeatureOutboxOperationPayloadMap['list.restaurant.add'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await addRestaurantVisitRatingsToList(payload, requestOptions);
}

async function replayRestaurantListRestaurantReorder(
  payload: FeatureOutboxOperationPayloadMap['list.restaurant.reorder'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await moveRestaurantListRestaurant(payload, requestOptions);
}

async function replayRestaurantListRestaurantRemoveSource(
  payload: FeatureOutboxOperationPayloadMap['list.restaurant.remove.source'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeRestaurantListSourceRating(payload, requestOptions);
}

async function replayRestaurantListRestaurantRemoveUser(
  removeUserRatingPayload: FeatureOutboxOperationPayloadMap['list.restaurant.remove.user'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeRestaurantListUserRating(
    removeUserRatingPayload.listId,
    removeUserRatingPayload.listItemId,
    requestOptions,
  );
}

async function replayRestaurantListBookmarkSave(
  payload: FeatureOutboxOperationPayloadMap['list.bookmark.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveRestaurantFoodItemToList(payload, requestOptions);
}

async function replayRestaurantListBookmarkRemove(
  payload: FeatureOutboxOperationPayloadMap['list.bookmark.remove'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await removeRestaurantFoodItemBookmarkFromList(payload, requestOptions);
}
