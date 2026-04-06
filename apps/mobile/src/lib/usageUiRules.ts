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

export function shouldShowOfflineUsageWarning(isOnline: boolean, isFreeUser: boolean): boolean {
  return !isOnline && isFreeUser;
}
