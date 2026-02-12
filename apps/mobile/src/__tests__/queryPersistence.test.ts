import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';

describe('React Query persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('restores query cache data after a cold restart', async () => {
    const persister = createAsyncStoragePersister({
      storage: AsyncStorage,
      key: 'test_react_query_cache',
      throttleTime: 0,
    });

    const sourceClient = new QueryClient();
    sourceClient.setQueryData(['visits', 'today'], {
      total: 3,
      refreshedAt: '2026-02-12T00:00:00.000Z',
    });

    await persistQueryClientSave({
      queryClient: sourceClient,
      persister,
    });

    const restoredClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient: restoredClient,
      persister,
      maxAge: 1000 * 60 * 60 * 24,
    });

    expect(restoredClient.getQueryData(['visits', 'today'])).toEqual({
      total: 3,
      refreshedAt: '2026-02-12T00:00:00.000Z',
    });

    sourceClient.clear();
    restoredClient.clear();
  });
});
