import React from 'react';
import { act, create } from 'react-test-renderer';

import { NotificationPreferencesScreen } from '../screens/NotificationPreferencesScreen';

const mockReact = React;
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
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      subtle: 'subtle-border',
    },
    text: {
      primary: 'primary-text',
    },
  },
  radii: {
    md: 12,
  },
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

jest.mock('../features', () => ({
  getCollectionRecord: jest.fn(),
  getNotificationPreferences: jest.fn(),
  mapUserSettings: jest.fn(),
  settingsQueryKeys: {
    detail: (userId: string) => ['settings', userId],
  },
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
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  SectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SectionCard', props, children),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('NotificationPreferencesScreen', () => {
  beforeEach(() => {
    mockSaveSettings.mockReset();
    mockSetQueryData.mockReset();
    mockGetRemoteNotificationPermissionStatus.mockReset();
    mockRegisterCurrentRemoteNotificationDevice.mockReset();
    mockRequestRemoteNotificationPermission.mockReset();
    mockSettingsData.notificationPreferences.notificationBillsEnabled = true;
    mockSettingsData.notificationPreferences.notificationMonthlyFriendsActivityEnabled = true;
    mockSettingsData.notificationPreferences.notificationTastingInvitesEnabled = true;
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('granted');
    mockRegisterCurrentRemoteNotificationDevice.mockResolvedValue(true);
    mockRequestRemoteNotificationPermission.mockResolvedValue('granted');
    mockSaveSettings.mockResolvedValue({ status: 'executed' });
  });

  it('renders notification preference toggles and saves changed values separately from in-app indicators', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <NotificationPreferencesScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'NotificationPreferences-route', name: 'NotificationPreferences' } as never}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.title).toBe('Notifications');
    expect(renderer.root.findAllByType('SectionCard').map((section: any) => section.props.title)).toContain(
      'Notification Preferences',
    );

    await act(async () => {
      renderer.root.findByProps({ testID: 'notification-preferences-bills-toggle' }).props.onValueChange(false);
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
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <NotificationPreferencesScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'NotificationPreferences-route', name: 'NotificationPreferences' } as never}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      renderer.root
        .findByProps({ testID: 'notification-preferences-tasting-invites-toggle' })
        .props.onValueChange(true);
      await Promise.resolve();
    });

    expect(mockRequestRemoteNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockRegisterCurrentRemoteNotificationDevice).toHaveBeenCalledWith('settings');
  });

  it('shows denied permission state without hiding saved preference values', async () => {
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('denied');
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <NotificationPreferencesScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'NotificationPreferences-route', name: 'NotificationPreferences' } as never}
        />,
      );
      await Promise.resolve();
    });

    const tastingToggle = renderer.root.findByProps({
      testID: 'notification-preferences-tasting-invites-toggle',
    });
    expect(tastingToggle.props.value).toBe(true);
    expect(tastingToggle.props.disabled).toBe(true);
    expect(renderer.root.findAllByType('Card').some((card: any) => card.props.tone === 'warning')).toBe(true);
  });
});
