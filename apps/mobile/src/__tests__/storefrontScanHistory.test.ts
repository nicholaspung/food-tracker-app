import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  deleteStorefrontScanHistoryOption,
  getStorefrontScanHistory,
  saveStorefrontScanHistoryEntry,
} from '../features/store/storefrontScanHistory';

describe('storefrontScanHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists storefront scan history locally by newest scan first', async () => {
    await saveStorefrontScanHistoryEntry('user-1', {
      result: {
        found: true,
        options: [{ confidence: 'high', name: 'Older Cafe' }],
      },
      scannedAt: '2026-06-06T10:00:00.000Z',
      source: 'camera',
    });
    await saveStorefrontScanHistoryEntry('user-1', {
      result: {
        found: true,
        options: [{ confidence: 'high', name: 'Newer Sushi' }],
      },
      scannedAt: '2026-06-07T10:00:00.000Z',
      source: 'gallery',
    });

    const history = await getStorefrontScanHistory('user-1');

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          options: [expect.objectContaining({ name: 'Newer Sushi' })],
        }),
        scannedAt: '2026-06-07T10:00:00.000Z',
        source: 'gallery',
      }),
    );
    expect(history[1]).toEqual(expect.objectContaining({ scannedAt: '2026-06-06T10:00:00.000Z' }));
  });

  it('keeps scan history scoped by identity key', async () => {
    await saveStorefrontScanHistoryEntry('user-1', {
      result: {
        found: false,
        allText: 'Visible restaurant text',
      },
      scannedAt: '2026-06-07T10:00:00.000Z',
      source: 'gallery',
    });

    await expect(getStorefrontScanHistory('user-2')).resolves.toEqual([]);
  });

  it('deletes individual restaurant name options from saved scans', async () => {
    const savedEntries = await saveStorefrontScanHistoryEntry('user-1', {
      result: {
        found: true,
        options: [
          { confidence: 'high', name: 'Keep Sushi' },
          { confidence: 'medium', name: 'Delete Sushi' },
        ],
      },
      scannedAt: '2026-06-07T10:00:00.000Z',
      source: 'gallery',
    });

    await deleteStorefrontScanHistoryOption('user-1', {
      entryId: savedEntries[0].id,
      optionIndex: 1,
    });

    const history = await getStorefrontScanHistory('user-1');

    expect(history).toHaveLength(1);
    expect(history[0].result).toEqual({
      found: true,
      options: [{ confidence: 'high', name: 'Keep Sushi' }],
    });
  });

  it('removes the scan entry when its last restaurant name option is deleted', async () => {
    const savedEntries = await saveStorefrontScanHistoryEntry('user-1', {
      result: {
        found: true,
        options: [{ confidence: 'high', name: 'Only Sushi' }],
      },
      scannedAt: '2026-06-07T10:00:00.000Z',
      source: 'gallery',
    });

    await deleteStorefrontScanHistoryOption('user-1', {
      entryId: savedEntries[0].id,
      optionIndex: 0,
    });

    await expect(getStorefrontScanHistory('user-1')).resolves.toEqual([]);
  });
});
