import { env } from '../../config/env';
import type {
  EnqueueMutationInput,
  QueuedMutation,
  SuccessfulMutationReplayOutcome,
  SuccessfulReplayCacheHint,
  SuccessfulReplayIdentity,
} from '../../offline/types';
import {
  replayRegisteredFeatureOutboxOperation,
  resolveRegisteredFeatureOutboxReplayMetadata,
  type FeatureOutboxReplayResult,
} from './featureOutboxReplayAdapters';
import { FEATURE_OUTBOX_OPERATION_NAMES } from './featureOutboxRegistry';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import type { HomeFeedDefaultsRecord } from './homeFeedPreferences';
import type {
  CompleteMainOnboardingInput,
  DismissAddOnboardingCardInput,
  DismissMoreOnboardingCardInput,
} from './onboardingStore';
import type { BillParticipantRecord, BillRecord } from '../models';
import type { TastingSessionStatus } from '../models';
import type { CreateBillInput, UpdateBillInput } from './billTypes';
import {
  type AddRestaurantVisitRatingsToListInput,
  type CreateFeedbackInput,
  type CreateNoteInput,
  type CreateFoodProductInput,
  type ConvertVisitItemToFoodProductInput,
  type CreateRestaurantListInput,
  type CreateVisitInput,
  type InviteFriendInput,
  type MarkNoteUsedInput,
  type MoveRestaurantListRestaurantInput,
  type OrganizeRestaurantListItemInput,
  type RemoveRestaurantFoodItemBookmarkFromListInput,
  type RemoveRestaurantListSourceRatingInput,
  type SaveRestaurantFoodItemToListInput,
  type SaveRestaurantToDefaultListInput,
  type SendFeedbackMessageInput,
  type UpdateFoodProductInput,
  type UpdateRestaurantListInput,
  type UpdateVisitInput,
  type UpdateNoteInput,
} from './featureStore';
import type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
} from './tastingSessionsApiStore';

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

interface MoveVisitItemOperationPayload {
  itemId: string;
  destinationVisitId: string;
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
  foodItemId?: string;
  menuItemId?: string;
  note?: string;
  sourceListId?: string;
  sourceListItemId?: string;
  sourceUserId?: string;
}

type SaveRestaurantToDefaultListOperationPayload = SaveRestaurantToDefaultListInput;

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

interface FriendSuggestionAcceptOperationPayload {
  inviterId: string;
}

interface FriendRemoveOperationPayload {
  friendId: string;
}

type TastingSessionCreateOperationPayload = CreateTastingSessionInput;
type TastingSessionJoinOperationPayload = JoinTastingSessionInput;

interface TastingSessionStatusUpdateOperationPayload {
  sessionId: string;
  status: TastingSessionStatus;
}

interface SettingsSaveOperationPayload extends HomeFeedDefaultsRecord {
  userId: string;
  defaultVisitVisibility: 'friends' | 'private';
  defaultRestaurantVisibility: 'private' | 'friends';
  defaultListVisibility: 'private' | 'friends';
  tasting_invites_enabled: boolean;
  bill_owed_enabled: boolean;
  monthly_friends_activity_enabled: boolean;
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
  'settings.visibility.save': SettingsSaveOperationPayload;
  'onboarding.main.complete': MainOnboardingCompleteOperationPayload;
  'onboarding.more-card.dismiss': MoreOnboardingCardDismissOperationPayload;
  'onboarding.add-card.dismiss': AddOnboardingCardDismissOperationPayload;
  'visit.create': CreateVisitInput;
  'visit.update': VisitUpdateOperationPayload;
  'visit.delete': VisitDeleteOperationPayload;
  'visit.item.move': MoveVisitItemOperationPayload;
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
  'list.default.restaurant.save': SaveRestaurantToDefaultListOperationPayload;
  'list.item.organize': OrganizeRestaurantListItemInput;
  'list.restaurant.add': AddRestaurantVisitRatingsToListInput;
  'list.restaurant.reorder': MoveRestaurantListRestaurantInput;
  'list.restaurant.remove.source': RemoveRestaurantListSourceRatingInput;
  'list.restaurant.remove.user': RemoveRestaurantListUserRatingOperationPayload;
  'list.bookmark.save': SaveRestaurantFoodItemToListInput;
  'list.bookmark.remove': RemoveRestaurantFoodItemBookmarkFromListInput;
  'bill.create': CreateBillInput;
  'bill.update': BillUpdateOperationPayload;
  'bill.delete': BillDeleteOperationPayload;
  'bill.status.toggle': BillStatusToggleOperationPayload;
  'bill.participant.toggle-paid': BillParticipantTogglePaidOperationPayload;
  'feedback.create': CreateFeedbackInput;
  'feedback.message.send': SendFeedbackMessageInput;
  'friend.accept': FriendAcceptOperationPayload;
  'friend.suggestion.accept': FriendSuggestionAcceptOperationPayload;
  'friend.remove': FriendRemoveOperationPayload;
  'friend.request.send': InviteFriendInput;
  'friend.request.reject': FriendRemoveOperationPayload;
  'friend.request.cancel': FriendRemoveOperationPayload;
  'tasting-session.create': TastingSessionCreateOperationPayload;
  'tasting-session.join': TastingSessionJoinOperationPayload;
  'tasting-session.status.update': TastingSessionStatusUpdateOperationPayload;
}

export type FeatureOutboxOperationName = keyof FeatureOutboxOperationPayloadMap;
export type FeatureOutboxOperationPayload<TName extends FeatureOutboxOperationName> =
  FeatureOutboxOperationPayloadMap[TName];

function buildFeatureOutboxUrl(operationName: FeatureOutboxOperationName): string {
  return `${FEATURE_OUTBOX_URL_PREFIX}${operationName}`;
}

export function parseFeatureOutboxOperationName(url: string): FeatureOutboxOperationName | null {
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
      sourceListItemId: payload.sourceListItemId,
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
  operationName: 'bill.update' | 'bill.status.toggle' = 'bill.update',
): EnqueueMutationInput {
  return {
    method: 'PUT',
    url: `${env.pocketbaseUrl}/api/bills/${encodeURIComponent(billId)}`,
    headers: {
      'X-Mobile-Write-Operation': operationName,
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

export async function replayFeatureOutboxMutation(
  mutation: QueuedMutation,
  options?: {
    authToken?: string | null;
    signal?: AbortSignal;
  },
): Promise<FeatureOutboxMutationReplayResult> {
  const operationName = parseFeatureOutboxOperationName(mutation.url);
  if (!operationName) {
    return { status: 'unhandled' };
  }

  const parsedPayload = parseMutationPayload(operationName, mutation.body);
  if (parsedPayload.status === 'terminalInvalidPayload') {
    return parsedPayload;
  }

  const requestOptions = createReplayFeatureWriteRequestOptions(mutation, options);
  const replayResult = await replayRegisteredFeatureOutboxOperation(
    operationName,
    parsedPayload.payload,
    requestOptions,
  );
  if (replayResult.status !== 'replayed') {
    return replayResult;
  }

  return {
    identity: replayResult.identity,
    status: 'replayed',
    successfulReplay: createSuccessfulFeatureOutboxReplayOutcome(
      mutation,
      operationName,
      {
        cacheHints: replayResult.cacheHints,
        identity: replayResult.identity,
      },
    ),
  };
}

type FeatureOutboxMutationReplayResult =
  | Exclude<FeatureOutboxReplayResult, { status: 'replayed' }>
  | {
      identity: SuccessfulReplayIdentity;
      status: 'replayed';
      successfulReplay: SuccessfulMutationReplayOutcome;
    };

export function createApiFeatureOutboxReplayOutcome(
  mutation: QueuedMutation,
): SuccessfulMutationReplayOutcome | null {
  const operationName = getHeaderFeatureOutboxOperationName(mutation);
  if (!operationName) {
    return null;
  }

  return createSuccessfulFeatureOutboxReplayOutcome(
    mutation,
    operationName,
    getApiFeatureOutboxReplayMetadata(mutation, operationName),
  );
}

function createSuccessfulFeatureOutboxReplayOutcome(
  mutation: QueuedMutation,
  operationName: FeatureOutboxOperationName,
  metadata: {
    cacheHints: readonly SuccessfulReplayCacheHint[];
    identity: SuccessfulReplayIdentity;
  },
): SuccessfulMutationReplayOutcome {
  return {
    ...(metadata.cacheHints.length > 0 ? { cacheHints: metadata.cacheHints } : {}),
    idempotencyKey: mutation.idempotencyKey,
    identity: metadata.identity,
    operationName,
    originAccountId: mutation.originAccountId,
  };
}

function getHeaderFeatureOutboxOperationName(
  mutation: QueuedMutation,
): FeatureOutboxOperationName | null {
  const rawOperationName =
    mutation.headers['X-Mobile-Write-Operation'] ??
    mutation.headers['x-mobile-write-operation'];
  return rawOperationName && FEATURE_OUTBOX_OPERATION_NAMES.has(
    rawOperationName as FeatureOutboxOperationName,
  )
    ? rawOperationName as FeatureOutboxOperationName
    : null;
}

function getApiFeatureOutboxReplayMetadata(
  mutation: QueuedMutation,
  operationName: FeatureOutboxOperationName,
): {
  cacheHints: readonly SuccessfulReplayCacheHint[];
  identity: SuccessfulReplayIdentity;
} {
  const pathSegments = getUrlPathSegments(mutation.url);
  const body = getJsonBodyRecord(mutation.body);
  const registeredMetadata = body
    ? resolveRegisteredFeatureOutboxReplayMetadata(operationName, body)
    : null;
  if (
    operationName === 'bill.update' ||
    operationName === 'bill.status.toggle' ||
    operationName === 'bill.delete'
  ) {
    return { cacheHints: [], identity: { billId: pathSegments.at(-1) } };
  }
  if (operationName === 'bill.participant.toggle-paid') {
    return { cacheHints: [], identity: { billId: pathSegments.at(-4) } };
  }
  if (operationName === 'visit.item.move') {
    return {
      cacheHints: ['visit-photos'],
      identity: {
        destinationVisitId:
          typeof body?.destinationVisitId === 'string' ? body.destinationVisitId : undefined,
        itemId: pathSegments.at(-2),
      },
    };
  }

  return registeredMetadata ?? { cacheHints: [], identity: {} };
}

function getJsonBodyRecord(body: string | null): Record<string, unknown> | null {
  if (!body) {
    return null;
  }

  try {
    const parsedBody: unknown = JSON.parse(body);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return null;
    }
    return parsedBody as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getUrlPathSegments(url: string): string[] {
  try {
    return new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return [];
  }
}

type ParsedMutationPayload =
  | {
      status: 'ok';
      payload: unknown;
    }
  | {
      status: 'terminalInvalidPayload';
      message: string;
    };

function parseMutationPayload(
  operationName: FeatureOutboxOperationName,
  value: string | null,
): ParsedMutationPayload {
  if (!value) {
    return {
      status: 'ok',
      payload: {},
    };
  }

  try {
    return {
      status: 'ok',
      payload: JSON.parse(value),
    };
  } catch {
    return {
      status: 'terminalInvalidPayload',
      message: `Invalid payload for ${operationName}: payload must be valid JSON.`,
    };
  }
}

function createReplayFeatureWriteRequestOptions(
  mutation: QueuedMutation,
  options?: {
    authToken?: string | null;
    signal?: AbortSignal;
  },
): FeatureWriteRequestOptions {
  const headers: Record<string, string> = {
    ...mutation.headers,
    'Idempotency-Key': mutation.idempotencyKey,
    'X-Idempotency-Key': mutation.idempotencyKey,
  };
  if (options?.authToken && !hasHeader(headers, 'Authorization')) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  return {
    headers,
    ...(options?.signal ? { signal: options.signal } : {}),
  };
}

function hasHeader(headers: Record<string, string>, expectedHeaderName: string): boolean {
  const normalizedExpectedName = expectedHeaderName.toLowerCase();
  return Object.keys(headers).some(
    (headerName) => headerName.toLowerCase() === normalizedExpectedName,
  );
}
