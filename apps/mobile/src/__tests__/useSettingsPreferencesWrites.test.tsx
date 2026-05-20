import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { getAuthRecord, saveAuthRecord, updateCollectionRecord } from '../features/store/pocketbaseGateway';
import { invalidateSettingsQueries, settingsQueryKeys } from '../features/store/settingsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useSettingsPreferencesWrites } from '../features/store/useSettingsPreferencesWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getAuthRecord: jest.fn(),
  saveAuthRecord: jest.fn(),
  updateCollectionRecord: jest.fn(),
}));

jest.mock('../features/store/settingsQuery', () => ({
  invalidateSettingsQueries: jest.fn(),
  settingsQueryKeys: {
    detail: (userId: string) => ['feature', 'settings', userId],
  },
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedGetAuthRecord = getAuthRecord as jest.MockedFunction<typeof getAuthRecord>;
const mockedSaveAuthRecord = saveAuthRecord as jest.MockedFunction<typeof saveAuthRecord>;
const mockedUpdateCollectionRecord = updateCollectionRecord as jest.MockedFunction<typeof updateCollectionRecord>;
const mockedInvalidateSettingsQueries =
  invalidateSettingsQueries as jest.MockedFunction<typeof invalidateSettingsQueries>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;

describe('useSettingsPreferencesWrites', () => {
  const queryClient = {
    setQueryData: jest.fn(),
  };
  const input = {
    userId: 'user_1',
    visitVisibility: 'friends' as const,
    restaurantVisibility: 'private' as const,
    listVisibility: 'friends' as const,
    homeFeedMode: 'friends' as const,
    homeFeedTypeFilter: 'all' as const,
    homeFeedSort: 'tracked' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedGetAuthRecord.mockReturnValue({ id: 'user_1' } as never);
    mockedInvalidateSettingsQueries.mockResolvedValue(undefined);
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'user_1',
      defaultVisitVisibility: 'friends',
      defaultRestaurantVisibility: 'private',
      defaultListVisibility: 'friends',
      defaultHomeFeedMode: 'friends',
      defaultHomeFeedTypeFilter: 'all',
      defaultHomeFeedSort: 'tracked',
    } as never);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useSettingsPreferencesWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useSettingsPreferencesWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useSettingsPreferencesWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('saves Settings Preferences through the outbox payload and updates completed caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.saveSettingsPreferences(input);

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'settings.visibility.save',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: expect.objectContaining({
            userId: 'user_1',
            defaultVisitVisibility: 'friends',
            defaultRestaurantVisibility: 'private',
            defaultListVisibility: 'friends',
            defaultHomeFeedMode: 'friends',
            defaultHomeFeedTypeFilter: 'all',
            defaultHomeFeedSort: 'tracked',
          }),
        },
      }),
    );
    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith(
      'users',
      'user_1',
      expect.objectContaining({
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedSort: 'tracked',
        defaultHomeFeedTypeFilter: 'all',
      }),
    );
    expect(mockedSaveAuthRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_1' }));
    expect(queryClient.setQueryData).toHaveBeenCalledWith(settingsQueryKeys.detail('user_1'), {
      visitVisibility: 'friends',
      restaurantVisibility: 'private',
      listVisibility: 'friends',
      homeFeedMode: 'friends',
      homeFeedTypeFilter: 'all',
      homeFeedSort: 'tracked',
    });
    expect(mockedInvalidateSettingsQueries).toHaveBeenCalledWith(queryClient, 'user_1');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues Settings Preferences and optimistically updates auth/query state', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.saveSettingsPreferences(input);

    expect(mockedUpdateCollectionRecord).not.toHaveBeenCalled();
    expect(mockedSaveAuthRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user_1',
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedSort: 'tracked',
        defaultHomeFeedTypeFilter: 'all',
      }),
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      settingsQueryKeys.detail('user_1'),
      expect.objectContaining({
        homeFeedMode: 'friends',
        homeFeedSort: 'tracked',
        homeFeedTypeFilter: 'all',
      }),
    );
    expect(mockedInvalidateSettingsQueries).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});
