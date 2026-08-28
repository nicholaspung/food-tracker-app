export interface CreateVisitSearchUiInput {
  isFreeTier: boolean;
  enforceQuota: boolean;
  placesQueriesRemaining: number | null;
  isOnline: boolean;
  isSearching: boolean;
}

export interface CreateVisitSearchUiState {
  hasQuota: boolean;
  isQuotaReached: boolean;
  compactLabel: string;
  expandedLabel: string;
  isSearchDisabled: boolean;
}

export interface PhotoUploadQuotaUiInput {
  perRecordLimit: number;
  usedInRecord: number;
  remainingMonthlyEstimate: number | null;
}

export interface PhotoUploadQuotaUiState {
  remainingPerRecord: number;
  remainingMonthlyEstimate: number | null;
  maxSelectableNow: number;
  hasQuota: boolean;
}

interface UsageViewUser {
  isAdmin?: boolean;
  isSubscriber?: boolean;
}

export interface UsageViewContext {
  isActualAdmin: boolean;
  isDisplayAdminUser: boolean;
  isDisplaySubscriberUser: boolean;
  isDisplayFreeUser: boolean;
  usagePreviewTier: 'subscriber' | 'free' | null;
  shouldEnforceUsageLimitsClientSide: boolean;
}

interface DisplayPhotoUploadsPerRecordLimitInput {
  snapshotLimit: number | null | undefined;
  isDisplayAdminUser: boolean;
  isDisplaySubscriberUser: boolean;
  isDisplayFreeUser: boolean;
}

export function resolveUsageViewContext(input: {
  actualUser: UsageViewUser | null | undefined;
  user: UsageViewUser | null | undefined;
}): UsageViewContext {
  const isActualAdmin = input.actualUser?.isAdmin === true;
  const isDisplayAdminUser = input.user?.isAdmin === true;
  const isDisplaySubscriberUser = input.user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;

  return {
    isActualAdmin,
    isDisplayAdminUser,
    isDisplaySubscriberUser,
    isDisplayFreeUser,
    usagePreviewTier: isActualAdmin && !isDisplayAdminUser
      ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
      : null,
    shouldEnforceUsageLimitsClientSide: !isActualAdmin,
  };
}

export function resolveCreateVisitSearchUi(input: CreateVisitSearchUiInput): CreateVisitSearchUiState {
  const isQuotaReached =
    input.isFreeTier &&
    typeof input.placesQueriesRemaining === 'number' &&
    input.placesQueriesRemaining <= 0;

  const shouldShowRemainingLabel =
    input.isFreeTier &&
    typeof input.placesQueriesRemaining === 'number' &&
    input.placesQueriesRemaining <= 10;

  const hasQuota = !isQuotaReached;

  const compactLabel = shouldShowRemainingLabel
    ? `Search (${input.placesQueriesRemaining} left)`
    : 'Search';
  const expandedLabel = shouldShowRemainingLabel
    ? `Search Food Places (${input.placesQueriesRemaining} left)`
    : 'Search Food Places';

  return {
    compactLabel,
    expandedLabel,
    hasQuota,
    isQuotaReached,
    isSearchDisabled: !input.isOnline || input.isSearching || (input.enforceQuota && isQuotaReached),
  };
}

export function resolvePhotoUploadQuotaUi(input: PhotoUploadQuotaUiInput): PhotoUploadQuotaUiState {
  const perRecordLimit = Math.max(input.perRecordLimit, 0);
  const usedInRecord = Math.max(input.usedInRecord, 0);
  const remainingPerRecord = Math.max(perRecordLimit - usedInRecord, 0);
  const remainingMonthlyEstimate =
    typeof input.remainingMonthlyEstimate === 'number'
      ? Math.max(input.remainingMonthlyEstimate, 0)
      : null;
  const maxSelectableNow =
    typeof remainingMonthlyEstimate === 'number'
      ? Math.min(remainingPerRecord, remainingMonthlyEstimate)
      : remainingPerRecord;

  return {
    remainingPerRecord,
    remainingMonthlyEstimate,
    maxSelectableNow,
    hasQuota: maxSelectableNow > 0,
  };
}

export function resolveDisplayPhotoUploadsPerRecordLimit(
  input: DisplayPhotoUploadsPerRecordLimitInput,
): number | null {
  if (typeof input.snapshotLimit === 'number') {
    return input.snapshotLimit;
  }

  if (input.isDisplayAdminUser) {
    return null;
  }

  if (input.isDisplaySubscriberUser) {
    return 20;
  }

  if (input.isDisplayFreeUser) {
    return 1;
  }

  return 1;
}

export function shouldShowOfflineUsageWarning(isOnline: boolean, isFreeUser: boolean): boolean {
  return !isOnline && isFreeUser;
}
