import { useQuery } from '@tanstack/react-query';

import {
  getSettingsDetail,
  mapUserSettings,
  settingsQueryKeys,
  useSettingsDetailRead,
} from '../features/store/settingsQuery';
import { getCollectionRecord } from '../features/store/pocketbaseGateway';
import {
  getNotificationPreferences,
  mapNotificationPreferences,
} from '../features/store/notificationPreferencesStore';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getCollectionRecord: jest.fn(),
}));

jest.mock('../features/store/notificationPreferencesStore', () => ({
  getNotificationPreferences: jest.fn(),
  mapNotificationPreferences: jest.fn(),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedGetCollectionRecord = getCollectionRecord as jest.MockedFunction<typeof getCollectionRecord>;
const mockedGetNotificationPreferences = getNotificationPreferences as jest.MockedFunction<
  typeof getNotificationPreferences
>;
const mockedMapNotificationPreferences = mapNotificationPreferences as jest.MockedFunction<
  typeof mapNotificationPreferences
>;

const defaultNotificationPreferences = {
  notificationBillsEnabled: true,
  notificationMonthlyFriendsActivityEnabled: true,
  notificationTastingInvitesEnabled: true,
};

describe('settingsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQuery.mockReturnValue({ data: null } as ReturnType<typeof useQuery>);
    mockedMapNotificationPreferences.mockReturnValue(defaultNotificationPreferences);
  });

  it('maps user settings defaults from the user record', () => {
    expect(mapUserSettings({
      defaultHomeFeedMode: 'friends',
      defaultHomeFeedSort: 'tracked',
      defaultHomeFeedTypeFilter: 'food-products',
      defaultListVisibility: 'private',
      defaultRestaurantVisibility: 'friends',
      defaultVisitVisibility: 'private',
    })).toEqual({
      homeFeedMode: 'friends',
      homeFeedSort: 'tracked',
      homeFeedTypeFilter: 'food-products',
      listVisibility: 'private',
      notificationPreferences: defaultNotificationPreferences,
      restaurantVisibility: 'friends',
      visitVisibility: 'private',
    });
  });

  it('reads the user record and notification preferences with the same AbortSignal', async () => {
    const abortController = new AbortController();
    const notificationPreferences = {
      notificationBillsEnabled: false,
      notificationMonthlyFriendsActivityEnabled: true,
      notificationTastingInvitesEnabled: false,
    };
    mockedGetCollectionRecord.mockResolvedValue({
      defaultHomeFeedMode: 'mine',
      defaultHomeFeedSort: 'created',
      defaultHomeFeedTypeFilter: 'visits',
      defaultListVisibility: 'friends',
      defaultRestaurantVisibility: 'private',
      defaultVisitVisibility: 'friends',
    });
    mockedGetNotificationPreferences.mockResolvedValue(notificationPreferences);

    const result = await getSettingsDetail('user_1', { signal: abortController.signal });

    expect(mockedGetCollectionRecord).toHaveBeenCalledWith('users', 'user_1', {
      signal: abortController.signal,
    });
    expect(mockedGetNotificationPreferences).toHaveBeenCalledWith('user_1', {
      signal: abortController.signal,
    });
    expect(result.notificationPreferences).toBe(notificationPreferences);
  });

  it('keeps the settings detail query key and authenticated-user guard in the hook', () => {
    useSettingsDetailRead('user_1');

    expect(mockedUseQuery).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      queryKey: settingsQueryKeys.detail('user_1'),
    }));

    useSettingsDetailRead(null);

    expect(mockedUseQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: false,
      queryKey: settingsQueryKeys.detail(null),
    }));
  });

  it('throws an auth error when the detail read has no user id', async () => {
    await expect(getSettingsDetail(null)).rejects.toThrow('Authentication required.');
  });
});
