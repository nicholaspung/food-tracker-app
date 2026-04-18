import {
  resolveCreateVisitSearchUi,
  resolveDisplayPhotoUploadsPerRecordLimit,
  resolvePhotoUploadQuotaUi,
  shouldShowOfflineUsageWarning,
} from '../lib/usageUiRules';

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

describe('NoteEditorScreen photo upload quota UI rules', () => {
  it('returns per-record remaining when no monthly estimate is available', () => {
    expect(resolvePhotoUploadQuotaUi({
      perRecordLimit: 5,
      usedInRecord: 2,
      remainingMonthlyEstimate: null,
    })).toEqual({
      remainingPerRecord: 3,
      remainingMonthlyEstimate: null,
      maxSelectableNow: 3,
      hasQuota: true,
    });
  });

  it('caps selectable photos by the lower monthly estimate', () => {
    expect(resolvePhotoUploadQuotaUi({
      perRecordLimit: 10,
      usedInRecord: 4,
      remainingMonthlyEstimate: 2,
    })).toEqual({
      remainingPerRecord: 6,
      remainingMonthlyEstimate: 2,
      maxSelectableNow: 2,
      hasQuota: true,
    });
  });

  it('reports no quota when remaining capacity is zero', () => {
    expect(resolvePhotoUploadQuotaUi({
      perRecordLimit: 3,
      usedInRecord: 3,
      remainingMonthlyEstimate: 5,
    })).toEqual({
      remainingPerRecord: 0,
      remainingMonthlyEstimate: 5,
      maxSelectableNow: 0,
      hasQuota: false,
    });
  });

  it('clamps negative inputs to zero', () => {
    expect(resolvePhotoUploadQuotaUi({
      perRecordLimit: -1,
      usedInRecord: -4,
      remainingMonthlyEstimate: -2,
    })).toEqual({
      remainingPerRecord: 0,
      remainingMonthlyEstimate: 0,
      maxSelectableNow: 0,
      hasQuota: false,
    });
  });
});

describe('display photo uploads per record limit', () => {
  it('returns snapshot limit when present for free preview', () => {
    expect(resolveDisplayPhotoUploadsPerRecordLimit({
      snapshotLimit: 1,
      isDisplayAdminUser: false,
      isDisplaySubscriberUser: false,
      isDisplayFreeUser: true,
    })).toBe(1);
  });

  it('returns snapshot limit when present for subscriber preview', () => {
    expect(resolveDisplayPhotoUploadsPerRecordLimit({
      snapshotLimit: 20,
      isDisplayAdminUser: false,
      isDisplaySubscriberUser: true,
      isDisplayFreeUser: false,
    })).toBe(20);
  });

  it('falls back to 1 for free display tier when snapshot is unavailable', () => {
    expect(resolveDisplayPhotoUploadsPerRecordLimit({
      snapshotLimit: null,
      isDisplayAdminUser: false,
      isDisplaySubscriberUser: false,
      isDisplayFreeUser: true,
    })).toBe(1);
  });

  it('falls back to 20 for subscriber display tier when snapshot is unavailable', () => {
    expect(resolveDisplayPhotoUploadsPerRecordLimit({
      snapshotLimit: undefined,
      isDisplayAdminUser: false,
      isDisplaySubscriberUser: true,
      isDisplayFreeUser: false,
    })).toBe(20);
  });

  it('returns null for admin display tier when snapshot is unavailable', () => {
    expect(resolveDisplayPhotoUploadsPerRecordLimit({
      snapshotLimit: null,
      isDisplayAdminUser: true,
      isDisplaySubscriberUser: false,
      isDisplayFreeUser: false,
    })).toBeNull();
  });
});

describe('PhotoProcessingScreen offline warning rule', () => {
  it('shows warning only when free user is offline', () => {
    expect(shouldShowOfflineUsageWarning(false, true)).toBe(true);
    expect(shouldShowOfflineUsageWarning(true, true)).toBe(false);
    expect(shouldShowOfflineUsageWarning(false, false)).toBe(false);
  });
});
