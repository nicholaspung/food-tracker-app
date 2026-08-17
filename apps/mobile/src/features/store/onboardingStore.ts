import type { RecordModel } from 'pocketbase';

import {
  normalizeMobileOnboardingState,
  type AddOnboardingCardId,
  type MobileOnboardingState,
  type MoreOnboardingCardId,
} from '../../types/auth';
import { getAuthRecord, getCollectionRecord, saveAuthRecord, updateCollectionRecord } from './pocketbaseGateway';
import {
  type FeatureWriteRequestOptions,
  getAuthenticatedUserId,
  trackFeatureMutation,
} from './featureStoreShared';

export const MAIN_ONBOARDING_VERSION = 1;

interface MobileOnboardingRecord {
  mobileOnboardingState?: unknown;
}

export interface CompleteMainOnboardingInput {
  completedAt?: string;
  version?: number;
}

export interface DismissMoreOnboardingCardInput {
  cardId: MoreOnboardingCardId;
  dismissedAt?: string;
}

export interface DismissAddOnboardingCardInput {
  cardId: AddOnboardingCardId;
  dismissedAt?: string;
}

function resolveTimestamp(value: string | undefined): string {
  return value?.trim() || new Date().toISOString();
}

export function getMobileOnboardingState(record: MobileOnboardingRecord | null | undefined): MobileOnboardingState {
  return normalizeMobileOnboardingState(record?.mobileOnboardingState) ?? {};
}

export function isMoreOnboardingCardDismissed(
  state: MobileOnboardingState | null | undefined,
  cardId: MoreOnboardingCardId,
): boolean {
  return Boolean(state?.moreCards?.[cardId]?.dismissedAt);
}

export function isAddOnboardingCardDismissed(
  state: MobileOnboardingState | null | undefined,
  cardId: AddOnboardingCardId,
): boolean {
  return Boolean(state?.addCards?.[cardId]?.dismissedAt);
}

export function buildMainOnboardingCompletedState(
  currentState: MobileOnboardingState | null | undefined,
  input: CompleteMainOnboardingInput = {},
): MobileOnboardingState {
  return {
    ...(currentState ?? {}),
    main: {
      ...(currentState?.main ?? {}),
      completedAt: resolveTimestamp(input.completedAt),
      completedVersion: input.version ?? MAIN_ONBOARDING_VERSION,
    },
  };
}

export function buildMoreOnboardingCardDismissedState(
  currentState: MobileOnboardingState | null | undefined,
  input: DismissMoreOnboardingCardInput,
): MobileOnboardingState {
  return {
    ...(currentState ?? {}),
    moreCards: {
      ...(currentState?.moreCards ?? {}),
      [input.cardId]: {
        ...(currentState?.moreCards?.[input.cardId] ?? {}),
        dismissedAt: resolveTimestamp(input.dismissedAt),
      },
    },
  };
}

export function buildAddOnboardingCardDismissedState(
  currentState: MobileOnboardingState | null | undefined,
  input: DismissAddOnboardingCardInput,
): MobileOnboardingState {
  return {
    ...(currentState ?? {}),
    addCards: {
      ...(currentState?.addCards ?? {}),
      [input.cardId]: {
        ...(currentState?.addCards?.[input.cardId] ?? {}),
        dismissedAt: resolveTimestamp(input.dismissedAt),
      },
    },
  };
}

export function saveOptimisticMobileOnboardingState(nextState: MobileOnboardingState): void {
  const currentAuthRecord = getAuthRecord();
  if (!currentAuthRecord) {
    return;
  }

  saveAuthRecord({
    ...(currentAuthRecord as RecordModel),
    mobileOnboardingState: nextState,
  } as RecordModel);
}

async function updateUserOnboardingState(
  userId: string,
  buildNextState: (currentState: MobileOnboardingState) => MobileOnboardingState,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RecordModel & MobileOnboardingRecord> {
  const currentRecord = await getCollectionRecord<RecordModel & MobileOnboardingRecord>('users', userId);
  const currentState = getMobileOnboardingState(currentRecord);
  const nextState = buildNextState(currentState);

  const updatedRecord = await updateCollectionRecord<RecordModel & MobileOnboardingRecord>(
    'users',
    userId,
    {
      mobileOnboardingState: nextState,
    },
    { headers: requestOptions?.headers },
  );
  saveAuthRecord(updatedRecord);
  return updatedRecord;
}

export async function completeMainOnboarding(
  userId: string,
  input: CompleteMainOnboardingInput = {},
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RecordModel & MobileOnboardingRecord> {
  return trackFeatureMutation('onboarding.main.complete', async () => {
    getAuthenticatedUserId();

    return updateUserOnboardingState(
      userId,
      (currentState) => buildMainOnboardingCompletedState(currentState, input),
      requestOptions,
    );
  });
}

export async function dismissMoreOnboardingCard(
  userId: string,
  input: DismissMoreOnboardingCardInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RecordModel & MobileOnboardingRecord> {
  return trackFeatureMutation('onboarding.more-card.dismiss', async () => {
    getAuthenticatedUserId();

    return updateUserOnboardingState(
      userId,
      (currentState) => buildMoreOnboardingCardDismissedState(currentState, input),
      requestOptions,
    );
  });
}

export async function dismissAddOnboardingCard(
  userId: string,
  input: DismissAddOnboardingCardInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<RecordModel & MobileOnboardingRecord> {
  return trackFeatureMutation('onboarding.add-card.dismiss', async () => {
    getAuthenticatedUserId();

    return updateUserOnboardingState(
      userId,
      (currentState) => buildAddOnboardingCardDismissedState(currentState, input),
      requestOptions,
    );
  });
}
