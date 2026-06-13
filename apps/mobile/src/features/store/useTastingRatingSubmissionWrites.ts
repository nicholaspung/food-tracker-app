import { useCallback, useRef } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type {
  TastingRestaurantRecord,
  TastingSessionRecord,
} from '../models';
import type { VisitPhotoUploadInput } from './featureStore';
import {
  completeTastingSession,
  submitTastingRatings,
} from './tastingSessionsApiStore';
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

type TastingRatingSubmissionWriteResult<T> =
  | {
      result: T;
      status: 'completed';
    }
  | {
      message: string;
      status: 'blocked';
    };

function blocked(message: string): TastingRatingSubmissionWriteResult<never> {
  return {
    message,
    status: 'blocked',
  };
}

async function refreshTastingSession(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
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

export function useTastingRatingSubmissionWrites() {
  const queryClient = useQueryClient();
  const uploadedPhotoKeysRef = useRef<Set<string>>(new Set());

  const submitRatingDraft = useCallback(
    async ({
      approvedRestaurants,
      currentUserId,
      draftByItemId,
      isOnline,
      sessionId,
    }: SubmitTastingRatingDraftInput): Promise<TastingRatingSubmissionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to submit ratings.');
      }

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
      await refreshTastingSession(queryClient, sessionId);
      return {
        result: nextSession,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const completeTasting = useCallback(
    async ({
      isOnline,
      sessionId,
    }: CompleteTastingInput): Promise<TastingRatingSubmissionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to complete this tasting.');
      }

      const nextSession = await completeTastingSession(sessionId);
      await refreshTastingSession(queryClient, sessionId);
      return {
        result: nextSession,
        status: 'completed',
      };
    },
    [queryClient],
  );

  return {
    completeTasting,
    submitRatingDraft,
  };
}

export type TastingRatingSubmissionWrites = ReturnType<typeof useTastingRatingSubmissionWrites>;
