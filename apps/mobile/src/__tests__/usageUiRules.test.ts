import { resolveCreateVisitSearchUi, shouldShowOfflineUsageWarning } from '../lib/usageUiRules';

describe('CreateVisitScreen usage UI rules', () => {
  it('shows remaining-label variants only when free user has <= 10 searches left', () => {
    const atTen = resolveCreateVisitSearchUi({
      isFreeTier: true,
      enforceQuota: true,
      placesQueriesRemaining: 10,
      isOnline: true,
      isSearching: false,
    });
    expect(atTen.compactLabel).toBe('Search (10 left)');
    expect(atTen.expandedLabel).toBe('Search Food Places (10 left)');

    const aboveTen = resolveCreateVisitSearchUi({
      isFreeTier: true,
      enforceQuota: true,
      placesQueriesRemaining: 11,
      isOnline: true,
      isSearching: false,
    });
    expect(aboveTen.compactLabel).toBe('Search');
    expect(aboveTen.expandedLabel).toBe('Search Food Places');
  });

  it('disables search at 0 remaining for free users', () => {
    const exhausted = resolveCreateVisitSearchUi({
      isFreeTier: true,
      enforceQuota: true,
      placesQueriesRemaining: 0,
      isOnline: true,
      isSearching: false,
    });

    expect(exhausted.hasQuota).toBe(false);
    expect(exhausted.isQuotaReached).toBe(true);
    expect(exhausted.isSearchDisabled).toBe(true);
  });

  it('does not disable search when quota is exhausted but enforcement is off', () => {
    const exhaustedPreview = resolveCreateVisitSearchUi({
      isFreeTier: true,
      enforceQuota: false,
      placesQueriesRemaining: 0,
      isOnline: true,
      isSearching: false,
    });

    expect(exhaustedPreview.isQuotaReached).toBe(true);
    expect(exhaustedPreview.isSearchDisabled).toBe(false);
  });
});

describe('PhotoProcessingScreen offline warning rule', () => {
  it('shows warning only when free user is offline', () => {
    expect(shouldShowOfflineUsageWarning(false, true)).toBe(true);
    expect(shouldShowOfflineUsageWarning(true, true)).toBe(false);
    expect(shouldShowOfflineUsageWarning(false, false)).toBe(false);
  });
});
