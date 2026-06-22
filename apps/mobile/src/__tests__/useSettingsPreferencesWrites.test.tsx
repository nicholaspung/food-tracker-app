import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import {
  getAuthRecord,
  saveAuthRecord,
  sendApiRequest,
  updateCollectionRecord,
} from '../features/store/pocketbaseGateway';
import { invalidateSettingsQueries, settingsQueryKeys } from '../features/store/settingsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useSettingsPreferencesWrites } from '../features/store/useSettingsPreferencesWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getAuthRecord: jest.fn(),
  saveAuthRecord: jest.fn(),
  sendApiRequest: jest.fn(),
  updateCollectionRecord: jest.fn(),
}));

jest.mock('../features/store/settingsQuery', () => ({
  invalidateSettingsQueries: jest.fn(),
  mapUserSettings: jest.fn((record) => ({
    visitVisibility: record.defaultVisitVisibility === 'private' ? 'private' : 'friends',
    restaurantVisibility: record.defaultRestaurantVisibility === 'friends' ? 'friends' : 'private',
    listVisibility: record.defaultListVisibility === 'private' ? 'private' : 'friends',
    homeFeedMode: record.defaultHomeFeedMode === 'friends' ? 'friends' : 'mine',
    homeFeedTypeFilter:
      record.defaultHomeFeedTypeFilter === 'all' || record.defaultHomeFeedTypeFilter === 'food-products'
        ? record.defaultHomeFeedTypeFilter
        : 'visits',
    homeFeedSort: record.defaultHomeFeedSort === 'tracked' ? 'tracked' : 'created',
    notificationPreferences: {
      notificationBillsEnabled: record.bill_owed_enabled === true,
      notificationMonthlyFriendsActivityEnabled: record.monthly_friends_activity_enabled === true,
      notificationTastingInvitesEnabled: record.tasting_invites_enabled === true,
    },
  })),
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
const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
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
    notificationPreferences: {
      notificationBillsEnabled: true,
      notificationMonthlyFriendsActivityEnabled: true,
      notificationTastingInvitesEnabled: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedGetAuthRecord.mockReturnValue({ id: 'user_1' } as never);
    mockedInvalidateSettingsQueries.mockResolvedValue(undefined);
    mockedSendApiRequest.mockResolvedValue({
      billOwedEnabled: true,
      monthlyFriendsActivityEnabled: true,
      tastingInvitesEnabled: false,
    } as never);
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
            bill_owed_enabled: true,
            monthly_friends_activity_enabled: true,
            tasting_invites_enabled: false,
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
    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/notification-preferences',
      expect.objectContaining({
        body: {
          billOwedEnabled: true,
          monthlyFriendsActivityEnabled: true,
          tastingInvitesEnabled: false,
        },
        method: 'PUT',
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
      notificationPreferences: {
        notificationBillsEnabled: true,
        notificationMonthlyFriendsActivityEnabled: true,
        notificationTastingInvitesEnabled: false,
      },
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
