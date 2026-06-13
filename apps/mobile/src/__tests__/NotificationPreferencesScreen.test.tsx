import React from 'react';
import { Linking } from 'react-native';
import { act, create } from 'react-test-renderer';

import { NotificationPreferencesScreen } from '../screens/NotificationPreferencesScreen';

const mockReact = React;
const mockSaveSettings = jest.fn();
const mockSetQueryData = jest.fn();
const mockGetRemoteNotificationPermissionStatus = jest.fn();
const mockRegisterCurrentRemoteNotificationDevice = jest.fn();
const mockRequestRemoteNotificationPermission = jest.fn();
const mockOpenSettings = jest.fn();
const mockAppStateListeners: ((state: string) => void)[] = [];
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

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockReact.useEffect(effect, [effect]);
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_eventName: string, listener: (state: string) => void) => {
      mockAppStateListeners.push(listener);
      return {
        remove: jest.fn(),
      };
    }),
  },
  Linking: {
    openSettings: mockOpenSettings,
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
  useSettingsDetailRead: () => ({
    data: mockSettingsData,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
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
  PageInfoToast: (props: Record<string, unknown>) => mockReact.createElement('PageInfoToast', props),
  SectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SectionCard', props, children),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../ui', () => ({
  Button: ({
    children,
    label,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; label?: React.ReactNode }) =>
    mockReact.createElement('Button', props, children ?? label),
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
    mockOpenSettings.mockReset();
    (Linking as unknown as { openSettings: typeof mockOpenSettings }).openSettings = mockOpenSettings;
    mockAppStateListeners.length = 0;
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
    expect(renderer.root.findAllByType('SectionCard').map((section: any) => section.props.title)).toContain(
      'System Notifications',
    );
    expect(renderer.root.findByProps({ testID: 'system-notification-permission-granted' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: 'system-notification-permission-action' })).toHaveLength(0);

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

  it('allows disabled notification categories to be turned on when system permission is granted', async () => {
    mockSettingsData.notificationPreferences.notificationTastingInvitesEnabled = false;
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('granted');
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
    expect(tastingToggle.props.value).toBe(false);
    expect(tastingToggle.props.disabled).toBe(false);

    await act(async () => {
      tastingToggle.props.onValueChange(true);
      await Promise.resolve();
    });

    const saveAction = renderer.root.findByType('BackHeaderScreenScaffold').props.primaryAction;
    expect(saveAction.disabled).toBe(false);
    expect(mockRequestRemoteNotificationPermission).not.toHaveBeenCalled();
  });

  it.each([
    ['granted', 'On'],
    ['denied', 'On, blocked by system settings.'],
    ['undetermined', 'On, notifications not enabled yet.'],
    ['unavailable', 'On, delivery cannot currently be confirmed.'],
    ['failed', 'On, delivery cannot currently be confirmed.'],
  ] as const)(
    'shows effective row-level delivery status when system permission is %s',
    async (permissionStatus, expectedStatusText) => {
      mockGetRemoteNotificationPermissionStatus.mockResolvedValue(permissionStatus);
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

      expect(
        renderer.root.findByProps({
          testID: 'notification-preferences-tasting-invites-toggle-status',
        }).props.children,
      ).toBe(expectedStatusText);
      expect(
        renderer.root.findByProps({
          testID: 'notification-preferences-bills-toggle-status',
        }).props.children,
      ).toBe(expectedStatusText);
      expect(
        renderer.root.findByProps({
          testID: 'notification-preferences-monthly-friends-activity-toggle-status',
        }).props.children,
      ).toBe(expectedStatusText);
    },
  );

  it('keeps disabled notification categories plainly off in row-level delivery status', async () => {
    mockSettingsData.notificationPreferences.notificationBillsEnabled = false;
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

    const billsToggle = renderer.root.findByProps({
      testID: 'notification-preferences-bills-toggle',
    });
    expect(billsToggle.props.value).toBe(false);
    expect(
      renderer.root.findByProps({
        testID: 'notification-preferences-bills-toggle-status',
      }).props.children,
    ).toBe('Off');
  });

  it('requests OS permission from the system notifications action and registers the device when granted', async () => {
    mockGetRemoteNotificationPermissionStatus.mockResolvedValue('undetermined');
    mockRequestRemoteNotificationPermission.mockResolvedValue('granted');
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

    expect(renderer.root.findByProps({ testID: 'system-notification-permission-undetermined' })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: 'system-notification-permission-action' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockRequestRemoteNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockRegisterCurrentRemoteNotificationDevice).toHaveBeenCalledWith('settings');
    expect(renderer.root.findByProps({ testID: 'system-notification-permission-granted' })).toBeTruthy();
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
    expect(tastingToggle.props.disabled).toBe(false);
    expect(renderer.root.findAllByType('Card').some((card: any) => card.props.tone === 'warning')).toBe(true);

    await act(async () => {
      renderer.root.findByProps({ testID: 'system-notification-permission-action' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('retries failed permission checks from the system notifications action', async () => {
    mockGetRemoteNotificationPermissionStatus.mockResolvedValueOnce('failed').mockResolvedValueOnce('granted');
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

    expect(renderer.root.findByProps({ testID: 'system-notification-permission-failed' })).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: 'system-notification-permission-action' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockGetRemoteNotificationPermissionStatus).toHaveBeenCalledTimes(2);
    expect(renderer.root.findByProps({ testID: 'system-notification-permission-granted' })).toBeTruthy();
  });

  it('refreshes system notification permission when the app returns to foreground', async () => {
    mockGetRemoteNotificationPermissionStatus.mockResolvedValueOnce('denied').mockResolvedValueOnce('granted');
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

    expect(renderer.root.findByProps({ testID: 'system-notification-permission-denied' })).toBeTruthy();

    await act(async () => {
      mockAppStateListeners[0]?.('active');
      await Promise.resolve();
    });

    expect(mockGetRemoteNotificationPermissionStatus).toHaveBeenCalledTimes(2);
    expect(renderer.root.findByProps({ testID: 'system-notification-permission-granted' })).toBeTruthy();
  });

  it('allows notification categories to be turned off when OS permission is denied', async () => {
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

    await act(async () => {
      renderer.root
        .findByProps({ testID: 'notification-preferences-tasting-invites-toggle' })
        .props.onValueChange(false);
      await Promise.resolve();
    });

    const saveAction = renderer.root.findByType('BackHeaderScreenScaffold').props.primaryAction;
    await act(async () => {
      saveAction.onPress();
      await Promise.resolve();
    });

    expect(mockRequestRemoteNotificationPermission).not.toHaveBeenCalled();
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationPreferences: expect.objectContaining({
          notificationTastingInvitesEnabled: false,
        }),
      }),
    );
  });

  it.each(['denied', 'undetermined', 'unavailable', 'failed'] as const)(
    'blocks disabled notification categories from being turned on when system permission is %s',
    async (permissionStatus) => {
      mockSettingsData.notificationPreferences.notificationTastingInvitesEnabled = false;
      mockGetRemoteNotificationPermissionStatus.mockResolvedValue(permissionStatus);
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
      expect(tastingToggle.props.value).toBe(false);
      expect(tastingToggle.props.disabled).toBe(true);

      await act(async () => {
        tastingToggle.props.onValueChange(true);
        await Promise.resolve();
      });

      const saveAction = renderer.root.findByType('BackHeaderScreenScaffold').props.primaryAction;
      expect(saveAction.disabled).toBe(true);
      expect(mockRequestRemoteNotificationPermission).not.toHaveBeenCalled();
      expect(mockRegisterCurrentRemoteNotificationDevice).not.toHaveBeenCalled();
      expect(mockSaveSettings).not.toHaveBeenCalled();
    },
  );
});
