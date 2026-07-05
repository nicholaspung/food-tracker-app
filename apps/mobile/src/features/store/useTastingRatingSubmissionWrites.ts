import { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type {
  TastingRestaurantRecord,
  TastingSessionRecord,
} from '../models';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { OfflineOutboxFeatureWriteOptions } from './useOfflineAwareFeatureWrite';
import {
  blockedTastingSessionLifecycleWrite,
  createTastingSessionLifecycleWriteActions,
  TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES,
  type TastingRatingDraft,
  type TastingSessionLifecycleWriteResult,
} from './useTastingSessionLifecycleWrites';

interface SubmitTastingRatingDraftInput {
  approvedRestaurants: TastingRestaurantRecord[];
  currentUserId: string | null | undefined;
  draftByItemId: Record<string, TastingRatingDraft>;
  isOnline: boolean;
  sessionId: string;
}

interface CompleteTastingInput {
  isOnline: boolean;
  sessionId: string;
}

type TastingRatingSubmissionWriteResult<T> = Exclude<
  TastingSessionLifecycleWriteResult<T>,
  { status: 'queued' }
>;

async function executeReplaySafeWriteOnline<TName extends FeatureOutboxOperationName, TResult>(
  options: OfflineOutboxFeatureWriteOptions<TName, TResult>,
): Promise<{ result: TResult; status: 'completed' }> {
  return {
    result: await options.execute(),
    status: 'completed',
  };
}

function asCompatibilityResult<T>(
  result: Promise<TastingSessionLifecycleWriteResult<T>>,
): Promise<TastingRatingSubmissionWriteResult<T>> {
  return result as Promise<TastingRatingSubmissionWriteResult<T>>;
}

function blockedCompatibilityResult<T>(message: string): TastingRatingSubmissionWriteResult<T> {
  return blockedTastingSessionLifecycleWrite(message) as TastingRatingSubmissionWriteResult<T>;
}

export function useTastingRatingSubmissionWrites() {
  const queryClient = useQueryClient();
  const uploadedPhotoKeysRef = useRef<Set<string>>(new Set());

  const createActions = useCallback(
    (isOnline: boolean) =>
      createTastingSessionLifecycleWriteActions({
        isOnline,
        queryClient,
        uploadedPhotoKeysRef,
        writeReplaySafe: executeReplaySafeWriteOnline,
      }),
    [queryClient],
  );

  return useMemo(
    () => ({
      completeTasting: ({
        isOnline,
        sessionId,
      }: CompleteTastingInput): Promise<TastingRatingSubmissionWriteResult<TastingSessionRecord>> => {
        if (!isOnline) {
          return Promise.resolve(blockedCompatibilityResult(TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.completeTasting));
        }

        return asCompatibilityResult(createActions(isOnline).completeTasting({ sessionId }));
      },
      submitRatingDraft: ({
        approvedRestaurants,
        currentUserId,
        draftByItemId,
        isOnline,
        sessionId,
      }: SubmitTastingRatingDraftInput): Promise<TastingRatingSubmissionWriteResult<TastingSessionRecord>> => {
        if (!isOnline) {
          return Promise.resolve(blockedCompatibilityResult(TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.submitRatings));
        }

        return asCompatibilityResult(createActions(isOnline).submitRatingDraft({
          approvedRestaurants,
          currentUserId,
          draftByItemId,
          sessionId,
        }));
      },
    }),
    [createActions],
  );
}

export type TastingRatingSubmissionWrites = ReturnType<typeof useTastingRatingSubmissionWrites>;
