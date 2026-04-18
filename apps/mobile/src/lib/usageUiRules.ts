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

export function shouldShowOfflineUsageWarning(isOnline: boolean, isFreeUser: boolean): boolean {
  return !isOnline && isFreeUser;
}
