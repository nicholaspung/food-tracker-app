import type { QueryClient } from '@tanstack/react-query';

import {
  createFeatureOutboxDomainRegistration,
  getReplayIdentityString,
  getReplayIdentityStrings,
  pickFeatureOutboxReplayIdentity,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
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
  saveSharedRestaurantListRecommendation,
  updateRestaurantList,
} from './restaurantListsStore';
import { profileQueryKeys } from './profileQuery';
import {
  invalidateRestaurantListCollectionQueries,
  invalidateRestaurantListContentQueries,
  invalidateRestaurantListMetadataQueries,
  invalidateRestaurantListSaveTargetQueries,
  invalidateSharedRestaurantListQueries,
  removeRestaurantListQueries,
  restaurantListQueryKeys,
} from './restaurantListQuery';

const WANT_TO_TRY_MEMBERSHIP_QUERY_ROOT = ['feature', 'wantToTryMembership'] as const;

const RESTAURANT_LIST_UPDATE_FIELDS = [
  { key: 'name', type: 'string' as const, optional: true },
  { key: 'description', type: 'string' as const, allowEmpty: true, optional: true },
  {
    key: 'visibility',
    type: 'string' as const,
    allowedValues: ['private', 'friends'],
    optional: true,
  },
] as const;

export const RESTAURANT_LIST_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'list.create',
    'list.update',
    'list.delete',
    'list.default.create',
    'list.default.bookmark.save',
    'list.default.restaurant.save',
    'list.shared-recommendation.save',
    'list.item.organize',
    'list.restaurant.add',
    'list.restaurant.reorder',
    'list.restaurant.remove.source',
    'list.restaurant.remove.user',
    'list.bookmark.save',
    'list.bookmark.remove',
  ] as const,
  legacyPayloadPolicy: 'decode-as-current',
  payloadDecoders: {
    'list.create': createFeatureOutboxPayloadDecoder('list.create', [
      { key: 'name', type: 'string' },
    ]),
    'list.update': createFeatureOutboxPayloadDecoder('list.update', [
      { key: 'listId', type: 'string' },
      {
        key: 'updates',
        type: 'record',
        fields: RESTAURANT_LIST_UPDATE_FIELDS,
        rejectUnknownFields: true,
      },
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
    'list.shared-recommendation.save': createFeatureOutboxPayloadDecoder(
      'list.shared-recommendation.save',
      [
        { key: 'shareToken', type: 'string' },
        { key: 'restaurantId', type: 'string' },
        { key: 'foodItemId', type: 'string' },
        { key: 'sourceListItemId', type: 'string' },
        { key: 'targetListIds', type: 'array' },
      ],
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
      { key: 'anchorRestaurantId', type: 'string' },
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
    'list.shared-recommendation.save': replaySharedRestaurantListRecommendationSave,
    'list.item.organize': replayRestaurantListItemOrganization,
    'list.restaurant.add': replayRestaurantListRestaurantAdd,
    'list.restaurant.reorder': replayRestaurantListRestaurantReorder,
    'list.restaurant.remove.source': replayRestaurantListRestaurantRemoveSource,
    'list.restaurant.remove.user': replayRestaurantListRestaurantRemoveUser,
    'list.bookmark.save': replayRestaurantListBookmarkSave,
    'list.bookmark.remove': replayRestaurantListBookmarkRemove,
  },
  replayIdentityResolvers: {
    'list.update': (payload) => pickFeatureOutboxReplayIdentity(payload, ['listId']),
    'list.delete': (payload) => pickFeatureOutboxReplayIdentity(payload, ['listId']),
    'list.default.bookmark.save': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['sourceListId']),
    'list.default.restaurant.save': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['sourceListId']),
    'list.shared-recommendation.save': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['shareToken', 'targetListIds']),
    'list.item.organize': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['currentListId', 'destinationListIds']),
    'list.restaurant.add': (payload) => pickFeatureOutboxReplayIdentity(payload, ['listId']),
    'list.restaurant.reorder': (payload) => pickFeatureOutboxReplayIdentity(payload, ['listId']),
    'list.restaurant.remove.source': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['listId']),
    'list.restaurant.remove.user': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['listId']),
    'list.bookmark.save': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['listId', 'sourceListId']),
    'list.bookmark.remove': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['listId', 'sourceListId']),
  },
  replayCacheEffects: {
    'list.create': reconcileRestaurantListReplayCaches,
    'list.update': reconcileRestaurantListReplayCaches,
    'list.delete': reconcileRestaurantListReplayCaches,
    'list.default.create': reconcileRestaurantListReplayCaches,
    'list.default.bookmark.save': reconcileRestaurantListReplayCaches,
    'list.default.restaurant.save': reconcileRestaurantListReplayCaches,
    'list.shared-recommendation.save': reconcileRestaurantListReplayCaches,
    'list.item.organize': reconcileRestaurantListReplayCaches,
    'list.restaurant.add': reconcileRestaurantListReplayCaches,
    'list.restaurant.reorder': reconcileRestaurantListReplayCaches,
    'list.restaurant.remove.source': reconcileRestaurantListReplayCaches,
    'list.restaurant.remove.user': reconcileRestaurantListReplayCaches,
    'list.bookmark.save': reconcileRestaurantListReplayCaches,
    'list.bookmark.remove': reconcileRestaurantListReplayCaches,
  },
});

type RestaurantListReplayOperationName =
  | 'list.create'
  | 'list.update'
  | 'list.delete'
  | 'list.default.create'
  | 'list.default.bookmark.save'
  | 'list.default.restaurant.save'
  | 'list.shared-recommendation.save'
  | 'list.item.organize'
  | 'list.restaurant.add'
  | 'list.restaurant.reorder'
  | 'list.restaurant.remove.source'
  | 'list.restaurant.remove.user'
  | 'list.bookmark.save'
  | 'list.bookmark.remove';

async function reconcileRestaurantListReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<RestaurantListReplayOperationName>,
): Promise<void> {
  const listId = getReplayIdentityString(outcome, 'listId');
  const sourceListId = getReplayIdentityString(outcome, 'sourceListId');
  const shareToken = getReplayIdentityString(outcome, 'shareToken');
  const invalidations: Promise<unknown>[] = [
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
  ];

  if (outcome.operationName === 'list.create') {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: restaurantListQueryKeys.scope('my'),
        refetchType: 'all',
      }),
    );
  } else if (outcome.operationName === 'list.update' && listId) {
    invalidations.push(invalidateRestaurantListMetadataQueries(queryClient, listId));
  } else if (outcome.operationName === 'list.delete' && listId) {
    removeRestaurantListQueries(queryClient, listId);
    invalidations.push(invalidateRestaurantListCollectionQueries(queryClient));
  } else if (outcome.operationName === 'list.shared-recommendation.save') {
    const targetListIds = getReplayIdentityStrings(outcome, 'targetListIds');
    if (shareToken) {
      invalidations.push(invalidateSharedRestaurantListQueries(queryClient, shareToken));
    }
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.defaultListRoot }),
      queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.scope('my') }),
      ...targetListIds.map((targetListId) =>
        invalidateRestaurantListContentQueries(queryClient, targetListId),
      ),
    );
  } else if (outcome.operationName === 'list.item.organize') {
    const affectedListIds = new Set([
      ...getReplayIdentityStrings(outcome, 'currentListId'),
      ...getReplayIdentityStrings(outcome, 'destinationListIds'),
    ]);
    invalidations.push(
      ...Array.from(affectedListIds).map((affectedListId) =>
        invalidateRestaurantListContentQueries(queryClient, affectedListId, {
          includeCandidateRestaurants: true,
        }),
      ),
    );
  } else if (listId) {
    invalidations.push(
      invalidateRestaurantListContentQueries(queryClient, listId, {
        includeCandidateRestaurants: true,
      }),
    );
  } else {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.defaultListRoot }),
      queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.detailRoot }),
    );
  }

  if (sourceListId) {
    invalidations.push(invalidateRestaurantListSaveTargetQueries(queryClient, sourceListId));
  }
  if (
    outcome.operationName.startsWith('list.default.') ||
    outcome.operationName === 'list.bookmark.save' ||
    outcome.operationName === 'list.bookmark.remove'
  ) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: restaurantListQueryKeys.defaultListRoot }),
      queryClient.invalidateQueries({ queryKey: WANT_TO_TRY_MEMBERSHIP_QUERY_ROOT }),
    );
  }

  await Promise.all(invalidations);
}

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

async function replaySharedRestaurantListRecommendationSave(
  payload: FeatureOutboxOperationPayloadMap['list.shared-recommendation.save'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await saveSharedRestaurantListRecommendation(payload, requestOptions);
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
