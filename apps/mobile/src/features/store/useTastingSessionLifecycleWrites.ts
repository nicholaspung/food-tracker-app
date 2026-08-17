import { useMemo, useRef, type MutableRefObject } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { useConnectivity } from '../../providers/ConnectivityProvider';
import type {
  RestaurantRecord,
  TastingRestaurantRecord,
  TastingSessionRecord,
} from '../models';
import type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  MenuItemRecord,
  ReopenTastingInviteWindowInput,
  VisitPhotoUploadInput,
} from './featureStore';
import type {
  OfflineAwareFeatureWriteResult,
  OfflineOutboxFeatureWriteOptions,
} from './useOfflineAwareFeatureWrite';
import { useOfflineAwareFeatureWrite } from './useOfflineAwareFeatureWrite';
import {
  acceptTastingInvite,
  completeTastingSession,
  createTastingSession,
  deleteTastingSession,
  dismissTastingInvite,
  joinTastingSession,
  kickTastingParticipant,
  leaveTastingSession,
  lockTastingSessionMembership,
  reopenTastingInviteWindow,
  resendTastingInvite,
  setTastingMenuItemSuggestionStatus,
  setTastingRestaurantSuggestionStatus,
  startTastingSession,
  submitTastingRatings,
  suggestTastingMenuItem,
  suggestTastingRestaurant,
} from './tastingSessionsApiStore';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import { removeTastingSessionFromSummariesCache } from './tastingSessionSummariesCache';
import { tastingSessionsQueryKeys } from './tastingSessionsQuery';
import { uploadVisitPhotos } from './visitPhotoUploads';
import { syncVisitMutationCaches } from './visitsQuery';

export interface TastingRatingDraftPhoto {
  id: string;
  upload: VisitPhotoUploadInput;
  thumbnailUri: string;
  viewerUri: string;
  labelDate: string;
}

export interface TastingRatingDraft {
  included: boolean;
  photos: TastingRatingDraftPhoto[];
  rating: number;
  note: string;
}

export interface TastingSessionIdWriteInput {
  sessionId: string;
}

export interface RemoveTastingParticipantInput extends TastingSessionIdWriteInput {
  participantId: string;
}

export interface ResendTastingInviteInput extends TastingSessionIdWriteInput {
  inviteId: string;
}

export interface ReopenTastingInviteWindowWriteInput
  extends TastingSessionIdWriteInput,
    ReopenTastingInviteWindowInput {}

export interface AddTastingPlanRestaurantInput extends TastingSessionIdWriteInput {
  restaurant: Pick<RestaurantRecord, 'id' | 'name'>;
}

export interface RemoveTastingPlanRestaurantInput extends TastingSessionIdWriteInput {
  restaurantSuggestionId: string;
}

export interface AddTastingPlanMenuItemInput extends TastingSessionIdWriteInput {
  existingSuggestionId?: string;
  menuItem: Pick<MenuItemRecord, 'id' | 'name'>;
  restaurantSuggestionId: string;
}

export interface RemoveTastingPlanMenuItemInput extends TastingSessionIdWriteInput {
  itemSuggestionId: string;
}

export interface SubmitTastingRatingDraftInput extends TastingSessionIdWriteInput {
  approvedRestaurants: TastingRestaurantRecord[];
  currentUserId: string | null | undefined;
  draftByItemId: Record<string, TastingRatingDraft>;
}

export type TastingSessionLifecycleWriteResult<T> =
  | {
      result: T;
      status: 'completed';
    }
  | {
      status: 'queued';
    }
  | {
      message: string;
      status: 'blocked';
    };

type TastingReplaySafeWrite = <TName extends FeatureOutboxOperationName, TResult>(
  options: OfflineOutboxFeatureWriteOptions<TName, TResult>,
) => Promise<OfflineAwareFeatureWriteResult<TResult>>;

export const TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES = {
  acceptInvite: 'Connect to the internet to join a tasting session.',
  completeTasting: 'Connect to the internet to complete this tasting.',
  createSession: 'Connect to the internet to create a group tasting.',
  deleteSession: 'Connect to the internet to delete this tasting session.',
  dismissInvite: 'Connect to the internet to dismiss this invite.',
  joinSession: 'Connect to the internet to join a group tasting.',
  leaveSession: 'Connect to the internet to leave this tasting session.',
  lockLobby: 'Connect to the internet to lock the group.',
  planning: 'Planning actions require a connection.',
  removeParticipant: 'Connect to the internet to remove a participant.',
  reopenInviteWindow: 'Connect to the internet to reopen the invite window.',
  resendInvite: 'Connect to the internet to resend this invite.',
  submitRatings: 'Connect to the internet to submit ratings.',
} as const;

function blockedTastingSessionLifecycleWrite(
  message: string,
): TastingSessionLifecycleWriteResult<never> {
  return {
    message,
    status: 'blocked',
  };
}

function completed<T>(result: T): TastingSessionLifecycleWriteResult<T> {
  return {
    result,
    status: 'completed',
  };
}

function mapReplaySafeResult<T>(
  result: OfflineAwareFeatureWriteResult<T>,
): TastingSessionLifecycleWriteResult<T> {
  if (result.status === 'queued') {
    return { status: 'queued' };
  }

  return completed(result.result);
}

async function invalidateTastingSessionList(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.summariesRoot }),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
  ]);
}

async function invalidateTastingSessionDetail(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
}

async function invalidateTastingSessionLifecycleQueries(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    invalidateTastingSessionList(queryClient),
    invalidateTastingSessionDetail(queryClient, sessionId),
  ]);
}

async function refreshTastingSessionDetailAndSignals(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    invalidateTastingSessionDetail(queryClient, sessionId),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
  ]);
}

async function removeDeletedTastingSessionFromCache(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
  removeTastingSessionFromSummariesCache(queryClient, sessionId);
  queryClient.setQueryData(tastingSessionsQueryKeys.detail(sessionId), null);
  await invalidateTastingSessionList(queryClient);
}

function buildTastingRatingSubmissionPayload({
  approvedRestaurants,
  draftByItemId,
}: Pick<SubmitTastingRatingDraftInput, 'approvedRestaurants' | 'draftByItemId'>) {
  return {
    restaurants: approvedRestaurants
      .map((restaurant) => ({
        restaurantSuggestionId: restaurant.id,
        items: (restaurant.items ?? [])
          .filter((item) => item.status === 'approved')
          .map((item) => ({ item, draft: draftByItemId[item.id] }))
          .filter(({ draft }) => Boolean(draft))
          .filter(({ draft }) => draft.included)
          .map(({ item, draft }) => ({
            itemId: item.id,
            note: draft.note.trim() || undefined,
            rating: draft.rating,
          })),
      }))
      .filter((restaurant) => restaurant.items.length > 0),
  };
}

function buildSubmittedPhotoKey(itemId: string, photoUri: string): string {
  return `${itemId}:${photoUri}`;
}

async function uploadSubmittedRatingPhotos({
  currentUserId,
  draftByItemId,
  nextSession,
  uploadedPhotoKeys,
}: {
  currentUserId: string | null | undefined;
  draftByItemId: Record<string, TastingRatingDraft>;
  nextSession: TastingSessionRecord;
  uploadedPhotoKeys: Set<string>;
}): Promise<Set<string>> {
  if (!currentUserId) {
    return new Set();
  }

  const nextUploadedKeys = new Set<string>();
  const nextItems = nextSession.restaurants.flatMap((restaurant) => restaurant.items ?? []);
  for (const item of nextItems) {
    const draft = draftByItemId[item.id];
    if (!draft) {
      continue;
    }
    if (!draft.included || draft.photos.length === 0) {
      continue;
    }

    const rating = item.ratings.find((entry) => entry.userId === currentUserId);
    if (!rating?.generatedFoodItemId) {
      continue;
    }

    const pendingPhotos = draft.photos.filter(
      (photo) => !uploadedPhotoKeys.has(buildSubmittedPhotoKey(item.id, photo.upload.uri)),
    );
    if (pendingPhotos.length === 0) {
      continue;
    }

    await uploadVisitPhotos(
      rating.generatedVisitId,
      rating.generatedFoodItemId,
      currentUserId,
      pendingPhotos.map((photo) => photo.upload),
    );
    pendingPhotos.forEach((photo) => {
      nextUploadedKeys.add(buildSubmittedPhotoKey(item.id, photo.upload.uri));
    });
  }

  return nextUploadedKeys;
}

interface TastingSessionLifecycleWriteRuntime {
  isOnline: boolean;
  queryClient: QueryClient;
  uploadedPhotoKeysRef: MutableRefObject<Set<string>>;
  writeReplaySafe: TastingReplaySafeWrite;
}

export function createTastingSessionLifecycleWriteActions({
  isOnline,
  queryClient,
  uploadedPhotoKeysRef,
  writeReplaySafe,
}: TastingSessionLifecycleWriteRuntime) {
  const runOnlineOnly = async <T>(
    message: string,
    execute: () => Promise<T>,
    refresh: (result: T) => Promise<void>,
  ): Promise<TastingSessionLifecycleWriteResult<T>> => {
    if (!isOnline) {
      return blockedTastingSessionLifecycleWrite(message);
    }

    const result = await execute();
    await refresh(result);
    return completed(result);
  };

  const createSession = async (
    input: CreateTastingSessionInput,
  ): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> => {
    const payload = {
      invitedUserIds: input.invitedUserIds,
      joinDurationMinutes: input.joinDurationMinutes,
      name: input.name,
    };
    const result = await writeReplaySafe({
      execute: createTastingSession.bind(null, payload),
      offline: {
        payload,
        strategy: 'outbox',
      },
      operationName: 'tasting-session.create',
    });
    if (result.status === 'completed') {
      await invalidateTastingSessionList(queryClient);
    }
    return mapReplaySafeResult(result);
  };

  const joinSession = async (
    input: JoinTastingSessionInput,
  ): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> => {
    const payload = { inviteCode: input.inviteCode };
    const result = await writeReplaySafe({
      execute: joinTastingSession.bind(null, payload),
      offline: {
        payload,
        strategy: 'outbox',
      },
      operationName: 'tasting-session.join',
    });
    if (result.status === 'completed') {
      await invalidateTastingSessionList(queryClient);
    }
    return mapReplaySafeResult(result);
  };

  const acceptInvite = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.acceptInvite,
      () => acceptTastingInvite(sessionId),
      () => invalidateTastingSessionList(queryClient),
    );

  const dismissInvite = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<{ success: boolean }>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.dismissInvite,
      () => dismissTastingInvite(sessionId),
      () => invalidateTastingSessionList(queryClient),
    );

  const deleteSession = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<{ success: boolean }>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.deleteSession,
      () => deleteTastingSession(sessionId),
      () => removeDeletedTastingSessionFromCache(queryClient, sessionId),
    );

  const leaveSession = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<{ success: boolean }>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.leaveSession,
      () => leaveTastingSession(sessionId),
      () => removeDeletedTastingSessionFromCache(queryClient, sessionId),
    );

  const resendInvite = async ({
    inviteId,
    sessionId,
  }: ResendTastingInviteInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.resendInvite,
      () => resendTastingInvite(sessionId, inviteId),
      () => invalidateTastingSessionLifecycleQueries(queryClient, sessionId),
    );

  const reopenInviteWindow = async ({
    joinDurationMinutes,
    sessionId,
  }: ReopenTastingInviteWindowWriteInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.reopenInviteWindow,
      () => reopenTastingInviteWindow(sessionId, { joinDurationMinutes }),
      () => invalidateTastingSessionLifecycleQueries(queryClient, sessionId),
    );

  const lockLobby = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> => {
    const result = await writeReplaySafe({
      execute: lockTastingSessionMembership.bind(null, sessionId),
      offline: {
        payload: {
          sessionId,
          status: 'planning',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.status.update',
    });
    if (result.status === 'completed') {
      await invalidateTastingSessionLifecycleQueries(queryClient, sessionId);
    }
    return mapReplaySafeResult(result);
  };

  const removeParticipant = async ({
    participantId,
    sessionId,
  }: RemoveTastingParticipantInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.removeParticipant,
      () => kickTastingParticipant(sessionId, participantId),
      () => invalidateTastingSessionLifecycleQueries(queryClient, sessionId),
    );

  const addRestaurant = async ({
    restaurant,
    sessionId,
  }: AddTastingPlanRestaurantInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.planning,
      () =>
        suggestTastingRestaurant(sessionId, {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
        }),
      () => refreshTastingSessionDetailAndSignals(queryClient, sessionId),
    );

  const removeRestaurant = async ({
    restaurantSuggestionId,
    sessionId,
  }: RemoveTastingPlanRestaurantInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.planning,
      () => setTastingRestaurantSuggestionStatus(sessionId, restaurantSuggestionId, 'rejected'),
      () => refreshTastingSessionDetailAndSignals(queryClient, sessionId),
    );

  const addMenuItem = async ({
    existingSuggestionId,
    menuItem,
    restaurantSuggestionId,
    sessionId,
  }: AddTastingPlanMenuItemInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.planning,
      () =>
        existingSuggestionId
          ? setTastingMenuItemSuggestionStatus(sessionId, existingSuggestionId, 'approved')
          : suggestTastingMenuItem(sessionId, restaurantSuggestionId, {
              menuItemId: menuItem.id,
              name: menuItem.name,
            }),
      () => refreshTastingSessionDetailAndSignals(queryClient, sessionId),
    );

  const removeMenuItem = async ({
    itemSuggestionId,
    sessionId,
  }: RemoveTastingPlanMenuItemInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.planning,
      () => setTastingMenuItemSuggestionStatus(sessionId, itemSuggestionId, 'rejected'),
      () => refreshTastingSessionDetailAndSignals(queryClient, sessionId),
    );

  const startTasting = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> => {
    const result = await writeReplaySafe({
      execute: startTastingSession.bind(null, sessionId),
      offline: {
        payload: {
          sessionId,
          status: 'tasting',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.status.update',
    });
    if (result.status === 'completed') {
      await refreshTastingSessionDetailAndSignals(queryClient, sessionId);
    }
    return mapReplaySafeResult(result);
  };

  const submitRatingDraft = async ({
    approvedRestaurants,
    currentUserId,
    draftByItemId,
    sessionId,
  }: SubmitTastingRatingDraftInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> =>
    runOnlineOnly(
      TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.submitRatings,
      async () => {
        const payload = buildTastingRatingSubmissionPayload({
          approvedRestaurants,
          draftByItemId,
        });
        const nextSession = await submitTastingRatings(sessionId, payload);
        const nextUploadedKeys = await uploadSubmittedRatingPhotos({
          currentUserId,
          draftByItemId,
          nextSession,
          uploadedPhotoKeys: uploadedPhotoKeysRef.current,
        });
        if (nextUploadedKeys.size > 0) {
          uploadedPhotoKeysRef.current = new Set([
            ...uploadedPhotoKeysRef.current,
            ...nextUploadedKeys,
          ]);
        }

        await syncVisitMutationCaches(queryClient, {
          includeUsage: nextUploadedKeys.size > 0,
          includeVisitPhotos: nextUploadedKeys.size > 0,
        });
        return nextSession;
      },
      () => refreshTastingSessionDetailAndSignals(queryClient, sessionId),
    );

  const completeTasting = async ({
    sessionId,
  }: TastingSessionIdWriteInput): Promise<TastingSessionLifecycleWriteResult<TastingSessionRecord>> => {
    const result = await writeReplaySafe({
      execute: completeTastingSession.bind(null, sessionId),
      offline: {
        payload: {
          sessionId,
          status: 'completed',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.status.update',
    });
    if (result.status === 'completed') {
      await refreshTastingSessionDetailAndSignals(queryClient, sessionId);
    }
    return mapReplaySafeResult(result);
  };

  return {
    acceptInvite,
    addMenuItem,
    addRestaurant,
    completeTasting,
    createSession,
    deleteSession,
    dismissInvite,
    joinSession,
    leaveSession,
    lockLobby,
    removeMenuItem,
    removeParticipant,
    removeRestaurant,
    reopenInviteWindow,
    resendInvite,
    startTasting,
    submitRatingDraft,
  };
}

export function useTastingSessionLifecycleWrites() {
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const uploadedPhotoKeysRef = useRef<Set<string>>(new Set());
  const writeReplaySafe = useOfflineAwareFeatureWrite();

  return useMemo(
    () =>
      createTastingSessionLifecycleWriteActions({
        isOnline,
        queryClient,
        uploadedPhotoKeysRef,
        writeReplaySafe,
      }),
    [isOnline, queryClient, writeReplaySafe],
  );
}

export type TastingSessionLifecycleWrites = ReturnType<typeof useTastingSessionLifecycleWrites>;
