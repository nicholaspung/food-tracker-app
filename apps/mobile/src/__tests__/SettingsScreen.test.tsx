import React from 'react';
import { act, create } from 'react-test-renderer';

import { SettingsScreen } from '../screens/SettingsScreen';

const mockReact = React;
const mockSetPreference = jest.fn();
const mockSaveSettings = jest.fn();
const mockSetQueryData = jest.fn();
const mockGetRemoteNotificationPermissionStatus = jest.fn();
const mockRegisterCurrentRemoteNotificationDevice = jest.fn();
const mockRequestRemoteNotificationPermission = jest.fn();
const mockSettingsData = {
  homeFeedMode: 'mine',
  homeFeedSort: 'created',
  homeFeedTypeFilter: 'visits',
  listVisibility: 'friends',
  notificationPreferences: {
    notificationBillsEnabled: true,
    notificationMonthlyFriendsActivityEnabled: true,
    notificationTastingInvitesEnabled: true,
  },
  restaurantVisibility: 'private',
  visitVisibility: 'friends',
};

const mockTheme = {
  colors: {
    background: {
      app: 'app-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      subtle: 'subtle-border',
    },
    text: {
      muted: 'muted-text',
      primary: 'primary-text',
    },
  },
  preference: 'system',
  radii: {
    md: 12,
  },
  setPreference: mockSetPreference,
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
  },
} as const;

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  Switch: (props: Record<string, unknown>) => mockReact.createElement('Switch', props),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockSettingsData,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
    },
  }),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: () => ({
    isOnline: true,
  }),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: () => mockSaveSettings,
}));

jest.mock('../features', () => ({
  buildHomeFeedDefaultsUpdate: ({
    homeFeedMode,
    homeFeedSort,
    homeFeedTypeFilter,
  }: {
    homeFeedMode: string;
    homeFeedSort: string;
    homeFeedTypeFilter: string;
  }) => ({
    defaultHomeFeedMode: homeFeedMode === 'friends' ? 'friends' : 'mine',
    defaultHomeFeedSort: homeFeedSort === 'tracked' ? 'tracked' : 'created',
    defaultHomeFeedTypeFilter:
      homeFeedTypeFilter === 'all' || homeFeedTypeFilter === 'food-products'
        ? homeFeedTypeFilter
        : 'visits',
  }),
  getCollectionRecord: jest.fn(),
  getNotificationPreferences: jest.fn(),
  invalidateSettingsQueries: jest.fn(),
  mapHomeFeedDefaultsFromRecord: (record: Record<string, unknown> | null | undefined) => ({
    homeFeedMode: record?.defaultHomeFeedMode === 'friends' ? 'friends' : 'mine',
    homeFeedSort: record?.defaultHomeFeedSort === 'tracked' ? 'tracked' : 'created',
    homeFeedTypeFilter:
      record?.defaultHomeFeedTypeFilter === 'all' || record?.defaultHomeFeedTypeFilter === 'food-products'
        ? record.defaultHomeFeedTypeFilter
        : 'visits',
  }),
  saveAuthRecord: jest.fn(),
  settingsQueryKeys: {
    detail: (userId: string) => ['settings', userId],
  },
  updateCollectionRecord: jest.fn(),
  useSettingsPreferencesWrites: () => ({
    saveSettingsPreferences: mockSaveSettings,
  }),
}));

jest.mock('../notifications/notificationInteraction', () => ({
  getRemoteNotificationPermissionStatus: () => mockGetRemoteNotificationPermissionStatus(),
  registerCurrentRemoteNotificationDevice: (...args: unknown[]) =>
    mockRegisterCurrentRemoteNotificationDevice(...args),
  requestRemoteNotificationPermission: () => mockRequestRemoteNotificationPermission(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getAuthRecord: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof mockTheme, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(mockTheme, ...args),
  useTheme: () => mockTheme,
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  SectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SectionCard', props, children),
  SegmentedControl: ({
    getOptionTestID,
    onChange,
    options,
    value,
  }: {
    getOptionTestID?: (value: string, index: number) => string | undefined;
    onChange: (value: string) => void;
    options: readonly { label: string; value: string }[];
    value: string;
  }) =>
    mockReact.createElement(
      'SegmentedControl',
      { value },
      options.map((option, index) =>
        mockReact.createElement('SegmentedOption', {
          key: option.value,
          label: option.label,
          onPress: () => {
            onChange(option.value);
          },
          testID: getOptionTestID?.(option.value, index),
          value: option.value,
        }),
      ),
    ),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  VisibilityOptionSelector: (props: Record<string, unknown>) =>
    mockReact.createElement('VisibilityOptionSelector', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockSetPreference.mockClear();
    mockSaveSettings.mockClear();
    mockSetQueryData.mockClear();
    mockGetRemoteNotificationPermissionStatus.mockReset();
    mockRegisterCurrentRemoteNotificationDevice.mockReset();
    mockRequestRemoteNotificationPermission.mockReset();
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('granted');
    mockRegisterCurrentRemoteNotificationDevice.mockResolvedValue(true);
    mockRequestRemoteNotificationPermission.mockResolvedValue('granted');
    mockSettingsData.notificationPreferences.notificationBillsEnabled = true;
    mockSettingsData.notificationPreferences.notificationMonthlyFriendsActivityEnabled = true;
    mockSettingsData.notificationPreferences.notificationTastingInvitesEnabled = true;
    mockSaveSettings.mockResolvedValue({
      result: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedSort: 'tracked',
        defaultHomeFeedTypeFilter: 'all',
        defaultListVisibility: 'friends',
        defaultRestaurantVisibility: 'private',
        defaultVisitVisibility: 'friends',
      },
      status: 'executed',
    });
  });

  it('renders local appearance options and applies dark mode without saving server settings', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
    });

    const sectionCards = renderer.root.findAllByType('SectionCard');
    expect(sectionCards[0].props.title).toBe('Appearance');
    expect(sectionCards[0].props.description).toBe('Choose how Yummy Recs looks on this device.');

    const appearanceOptions = renderer.root.findAllByType('SegmentedOption');
    expect(appearanceOptions.slice(0, 3).map((option: any) => option.props.label)).toEqual(['System', 'Light', 'Dark']);

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-appearance-dark' }).props.onPress();
    });

    expect(mockSetPreference).toHaveBeenCalledWith('dark');
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('renders home feed default controls and saves changed defaults', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
    });

    const sectionCards = renderer.root.findAllByType('SectionCard');
    expect(sectionCards.map((section: any) => section.props.title)).toContain('Default Home Feed');

    const findSaveAction = () => renderer.root.findByType('BackHeaderScreenScaffold').props.primaryAction;

    expect(findSaveAction()).toEqual(
      expect.objectContaining({
        disabled: true,
        label: 'Save Settings',
        testID: 'settings-save-button',
      }),
    );

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-home-feed-mode-friends' }).props.onPress();
      renderer.root.findByProps({ testID: 'settings-home-feed-type-all' }).props.onPress();
      renderer.root.findByProps({ testID: 'settings-home-feed-sort-tracked' }).props.onPress();
    });

    expect(findSaveAction().disabled).toBe(false);

    await act(async () => {
      findSaveAction().onPress();
      await Promise.resolve();
    });

    expect(mockSaveSettings).toHaveBeenCalledWith({
      homeFeedMode: 'friends',
      homeFeedSort: 'tracked',
      homeFeedTypeFilter: 'all',
      listVisibility: 'friends',
      notificationPreferences: {
        notificationBillsEnabled: true,
        notificationMonthlyFriendsActivityEnabled: true,
        notificationTastingInvitesEnabled: true,
      },
      restaurantVisibility: 'private',
      userId: 'user-1',
      visitVisibility: 'friends',
    });
  });

  it('renders notification preference toggles and saves changed values separately from in-app indicators', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
      await Promise.resolve();
    });

    const sectionCards = renderer.root.findAllByType('SectionCard');
    expect(sectionCards.map((section: any) => section.props.title)).toContain('Notification Preferences');

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-notification-bills-toggle' }).props.onValueChange(false);
      await Promise.resolve();
    });

    const saveAction = renderer.root.findByType('BackHeaderScreenScaffold').props.primaryAction;
    expect(saveAction.disabled).toBe(false);

    await act(async () => {
      saveAction.onPress();
      await Promise.resolve();
    });

    expect(mockRequestRemoteNotificationPermission).not.toHaveBeenCalled();
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationPreferences: {
          notificationBillsEnabled: false,
          notificationMonthlyFriendsActivityEnabled: true,
          notificationTastingInvitesEnabled: true,
        },
      }),
    );
  });

  it('requests OS permission when turning a notification preference on', async () => {
    mockSettingsData.notificationPreferences.notificationTastingInvitesEnabled = false;
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('undetermined');
    mockRequestRemoteNotificationPermission.mockResolvedValue('granted');
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-notification-tasting-invites-toggle' }).props.onValueChange(true);
      await Promise.resolve();
    });

    expect(mockRequestRemoteNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockRegisterCurrentRemoteNotificationDevice).toHaveBeenCalledWith('settings');
    expect(renderer.root.findByProps({ testID: 'settings-notification-tasting-invites-toggle' }).props.value).toBe(true);
  });

  it('shows denied permission state without hiding saved preference values', async () => {
    mockSettingsData.notificationPreferences.notificationTastingInvitesEnabled = true;
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('denied');
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
      await Promise.resolve();
    });

    const tastingToggle = renderer.root.findByProps({ testID: 'settings-notification-tasting-invites-toggle' });
    expect(tastingToggle.props.value).toBe(true);
    expect(tastingToggle.props.disabled).toBe(true);
    expect(renderer.root.findAllByType('Card').some((card: any) => card.props.tone === 'warning')).toBe(true);
  });
});
