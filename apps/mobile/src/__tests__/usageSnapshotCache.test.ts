import AsyncStorage from '@react-native-async-storage/async-storage';

import { readUsageSnapshotCache, writeUsageSnapshotCache } from '../lib/usageSnapshotCache';

describe('usageSnapshotCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('writes and reads snapshot per user key', async () => {
    const userId = 'user_1';
    await writeUsageSnapshotCache(userId, {
      monthKey: '2026-02',
      userTier: 'free',
      limits: {
        photoUploadsPerRecord: 1,
        photoUploadsMonthly: 5,
        placesQueriesMonthly: 100,
        menuScansMonthly: 5,
        receiptScansMonthly: 5,
        storefrontReadsMonthly: 5,
      },
      usage: {
        photoUploads: 2,
        placesQueries: 10,
        menuScans: 1,
        receiptScans: 1,
        storefrontReads: 1,
      },
      remaining: {
        photoUploadsMonthly: 3,
        placesQueriesMonthly: 90,
        menuScansMonthly: 4,
        receiptScansMonthly: 4,
        storefrontReadsMonthly: 4,
      },
    });

    const cached = await readUsageSnapshotCache(userId);

    expect(cached).not.toBeNull();
    expect(cached?.snapshot.monthKey).toBe('2026-02');
    expect(cached?.snapshot.usage.photoUploads).toBe(2);
  });
});
