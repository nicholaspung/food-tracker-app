import React from 'react';
import { Share } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteAccount, lockInviteCode, useMonthlyUsage } from '../features';
import { useQueuedLogoutConfirmation } from '../hooks/useQueuedLogoutConfirmation';
import {
  clearNotificationDeviceIdentity,
  getVisitReminderNotificationStatus,
  scheduleVisitReminderNotification,
} from '../notifications/notificationInteraction';
import { useAuth } from '../providers/AuthProvider';
import { AddVisitScreen } from '../screens/AddVisitScreen';
import { MiscScreen } from '../screens/MiscScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

const mockReact = React;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  ActivityIndicator: (props: Record<string, unknown>) => mockReact.createElement('ActivityIndicator', props),
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode) }) =>
    mockReact.createElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    ),
  Share: {
    sharedAction: 'sharedAction',
    share: jest.fn(),
  },
  ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScrollView', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('KeyboardAwareScrollView', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('ConfirmDestructiveModal', props, children),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureActionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListInlineBody: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('OptionListInlineBody', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  ScreenContentSection: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('ScreenContentSection', props, children),
  SectionHeader: (props: Record<string, unknown>) => mockReact.createElement('SectionHeader', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  TabBrandHeader: (props: Record<string, unknown>) => mockReact.createElement('TabBrandHeader', props),
  TabRootScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('TabRootScreenScaffold', props, children),
  TabSectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('TabSectionCard', props, children),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  billsQueryKeys: {
    root: ['feature', 'bills'],
  },
  deleteAccount: jest.fn(),
  feedbackQueryKeys: {
    summary: ['feature', 'feedback', 'summary'],
  },
  generateInviteCodes: jest.fn(),
  getAuthRecord: jest.fn(() => ({ isInitialUser: false })),
  getFeedbackCountSummary: jest.fn(),
  getProfile: jest.fn(),
  isAddOnboardingCardDismissed: jest.fn((state, cardId) => Boolean(state?.addCards?.[cardId]?.dismissedAt)),
  invalidateInviteCodesQueries: jest.fn(),
  listInviteCodes: jest.fn(),
  lockInviteCode: jest.fn(),
  profileQueryKeys: {
    inviteCodes: jest.fn(() => ['feature', 'profile', 'invites']),
    profile: ['feature', 'profile'],
  },
  summarizeBillOwedNotificationSignal: jest.fn(() => ({
    indicator: {
      kind: 'none',
    },
  })),
  summarizeTastingSessionNotificationSignal: jest.fn(() => ({
    indicator: {
      kind: 'none',
    },
  })),
  tastingSessionsQueryKeys: {
    root: ['feature', 'tastingSessions'],
  },
  updateProfile: jest.fn(),
  useMonthlyUsage: jest.fn(),
}));

jest.mock('../lib/appMetadata', () => ({
  formatAppVersionLabel: jest.fn(() => '1.0.0'),
}));

jest.mock('../lib/emailVerificationAccess', () => ({
  formatEmailVerificationRemainingTime: jest.fn(() => '2 days left'),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../notifications/notificationInteraction', () => ({
  clearNotificationDeviceIdentity: jest.fn(),
  getVisitReminderNotificationStatus: jest.fn(),
  scheduleVisitReminderNotification: jest.fn(),
}));

jest.mock('../hooks/useQueuedLogoutConfirmation', () => ({
  useQueuedLogoutConfirmation: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/SyncProvider', () => ({
  useSync: () => ({
    failedCount: 0,
    getQueuedMutations: jest.fn(() => Promise.resolve([])),
    isSyncing: false,
    nextRetryAt: null,
    queueDepth: 0,
  }),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            background: {
              app: 'app-background',
              muted: 'muted-background',
              surface: 'surface-background',
            },
            border: {
              brand: 'brand-border',
              danger: 'danger-border',
              default: 'default-border',
              info: 'info-border',
              subtle: 'subtle-border',
              success: 'success-border',
              warning: 'warning-border',
            },
            fill: {
              danger: 'danger-fill',
            },
            status: {
              dangerBg: 'danger-background',
              infoBg: 'info-background',
              successBg: 'success-background',
              warningBg: 'warning-background',
            },
            text: {
              brand: 'brand-text',
              danger: 'danger-text',
              info: 'info-text',
              inverse: 'inverse-text',
              muted: 'muted-text',
              primary: 'primary-text',
              secondary: 'secondary-text',
              success: 'success-text',
              warning: 'warning-text',
            },
          },
          radii: {
            md: 12,
            pill: 999,
          },
          spacing: {
            md: 16,
            sm: 12,
            xl: 24,
            xs: 8,
            xxs: 4,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      background: {
        app: 'app-background',
        muted: 'muted-background',
        surface: 'surface-background',
      },
      border: {
        brand: 'brand-border',
        danger: 'danger-border',
        default: 'default-border',
        info: 'info-border',
        subtle: 'subtle-border',
        success: 'success-border',
        warning: 'warning-border',
      },
      fill: {
        danger: 'danger-fill',
      },
      status: {
        dangerBg: 'danger-background',
        infoBg: 'info-background',
        successBg: 'success-background',
        warningBg: 'warning-background',
      },
      text: {
        brand: 'brand-text',
        danger: 'danger-text',
        info: 'info-text',
        inverse: 'inverse-text',
        muted: 'muted-text',
        primary: 'primary-text',
        secondary: 'secondary-text',
        success: 'success-text',
        warning: 'warning-text',
      },
    },
    radii: {
      md: 12,
      pill: 999,
    },
    spacing: {
      md: 16,
      sm: 12,
      xl: 24,
      xs: 8,
      xxs: 4,
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Modal', props, children),
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseMonthlyUsage = useMonthlyUsage as jest.MockedFunction<typeof useMonthlyUsage>;
const mockedDeleteAccount = deleteAccount as jest.MockedFunction<typeof deleteAccount>;
const mockedClearNotificationDeviceIdentity = clearNotificationDeviceIdentity as jest.MockedFunction<
  typeof clearNotificationDeviceIdentity
>;
const mockedGetVisitReminderNotificationStatus = getVisitReminderNotificationStatus as jest.MockedFunction<
  typeof getVisitReminderNotificationStatus
>;
const mockedScheduleVisitReminderNotification = scheduleVisitReminderNotification as jest.MockedFunction<
  typeof scheduleVisitReminderNotification
>;
const mockedLockInviteCode = lockInviteCode as jest.MockedFunction<typeof lockInviteCode>;
const mockedShare = Share.share as jest.MockedFunction<typeof Share.share>;
const mockedUseQueuedLogoutConfirmation = useQueuedLogoutConfirmation as jest.MockedFunction<
  typeof useQueuedLogoutConfirmation
>;

function renderWithNavigation(element: React.ReactElement) {
  return create(element);
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style || typeof style !== 'object') {
    return {};
  }

  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (accumulator, entry) => ({ ...accumulator, ...flattenStyle(entry) }),
      {},
    );
  }

  return style as Record<string, unknown>;
}

function buildExecutingMutationMock(options: unknown) {
  const mutationFn = (options as { mutationFn?: (input: unknown) => unknown }).mutationFn;

  return {
    isPending: false,
    mutateAsync: jest.fn((input: unknown) => mutationFn?.(input)),
  } as never;
}

describe('tab root content sections', () => {
  beforeEach(() => {
    mockedUseQuery.mockReset();
    mockedUseMutation.mockReset();
    mockedUseQueryClient.mockReset();
    mockedUseAuth.mockReset();
    mockedUseMonthlyUsage.mockReset();
    mockedDeleteAccount.mockReset();
    mockedClearNotificationDeviceIdentity.mockReset();
    mockedGetVisitReminderNotificationStatus.mockReset();
    mockedScheduleVisitReminderNotification.mockReset();
    mockedLockInviteCode.mockReset();
    mockedShare.mockReset();
    mockedUseQueuedLogoutConfirmation.mockReset();

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    } as never);
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: jest.fn(),
    } as never);
    mockedUseMutation.mockReturnValue({
      isPending: false,
      mutateAsync: jest.fn(),
    } as never);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: null,
      cachedAt: null,
      isUsingCachedSnapshot: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockedDeleteAccount.mockResolvedValue(undefined);
    mockedClearNotificationDeviceIdentity.mockResolvedValue(undefined);
    mockedLockInviteCode.mockResolvedValue(undefined);
    mockedGetVisitReminderNotificationStatus.mockResolvedValue({
      status: 'none',
    });
    mockedScheduleVisitReminderNotification.mockResolvedValue({
      notificationId: 'notification_1',
      status: 'scheduled',
    });
    mockedShare.mockResolvedValue({
      action: Share.sharedAction,
    } as Awaited<ReturnType<typeof Share.share>>);
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
        isBetaUser: false,
        isSubscriber: false,
      },
      signOut: jest.fn(),
      user: {
        email: 'user@example.com',
        id: 'user-1',
        isBetaUser: false,
        verified: true,
      },
      verificationGraceEndsAt: null,
      verificationStatus: 'verified',
    } as never);
    mockedUseQueuedLogoutConfirmation.mockReturnValue({
      cancelLabel: 'Stay Logged In',
      cancelLogout: jest.fn(),
      confirmLabel: 'Log Out & Discard',
      confirmLoadingLabel: 'Logging out...',
      confirmLogout: jest.fn(),
      description:
        'You have unsynced offline changes queued on this device. Logging out will discard those changes and clear cached data for this account.',
      hasQueuedWrites: false,
      isConfirmVisible: false,
      isLoggingOut: false,
      requestLogout: jest.fn(),
      title: 'Discard offline changes and log out?',
    });
  });

  it('keeps the Add tab header fixed and scrolls the orange body section underneath it', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    const scrollView = renderer.root.findByType('ScrollView');
    expect(scaffold.props.scroll).toBe(false);
    expect(flattenStyle(scrollView.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        flex: 1,
      }),
    );
    expect(renderer.root.findByProps({ testID: 'add-screen-content-section' })).toBeTruthy();
  });

  it('shows Track Restaurant Visit and visit reminder actions in a shared Track section list', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    const restaurantAction = renderer.root.findByProps({ testID: 'add-option-restaurant-visit' });
    const reminderAction = renderer.root.findByProps({ testID: 'add-option-visit-reminder' });

    expect(renderer.root.findByProps({ title: 'Track' })).toBeTruthy();
    expect(restaurantAction.props.title).toBe('Track Restaurant Visit');
    expect(restaurantAction.props.description).toBe('Restaurant, dishes, photos, and ratings');
    expect(reminderAction.props.title).toBe('Visit Reminder');
    expect(reminderAction.props.description).toBe('Get a one-time prompt to start a visit');
    expect(reminderAction.props.isLast).toBe(true);
  });

  it('opens reminder choices and schedules a local visit reminder through the notification module', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.visible).toBe(false);

    await act(async () => {
      renderer.root.findByProps({ testID: 'add-option-visit-reminder' }).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.visible).toBe(true);
    expect(mockedGetVisitReminderNotificationStatus).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'visit-reminder-option-15' }).props.label).toBe('15 min');
    expect(renderer.root.findByProps({ testID: 'visit-reminder-option-30' }).props.label).toBe('30 min');
    expect(renderer.root.findByProps({ testID: 'visit-reminder-option-60' }).props.label).toBe('1 hr');

    await act(async () => {
      renderer.root.findByProps({ testID: 'visit-reminder-option-30' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockedScheduleVisitReminderNotification).toHaveBeenCalledWith(30);
    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.visible).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'visit-reminder-option-15' })).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType('Text')
        .some((node: any) => node.children.includes('Reminder scheduled for 30 minutes from now.')),
    ).toBe(true);
    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.secondaryAction.label).toBe('Done');

    await act(async () => {
      renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.secondaryAction.onPress();
    });

    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.visible).toBe(false);
    expect(renderer.root.findAllByProps({ testID: 'visit-reminder-option-15' })).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType('Text')
        .some((node: any) => node.children.includes('Reminder scheduled for 30 minutes from now.')),
    ).toBe(true);
  });

  it('shows the already scheduled visit reminder state instead of time choices when one exists', async () => {
    mockedGetVisitReminderNotificationStatus.mockResolvedValue({
      status: 'scheduled',
    });
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'add-option-visit-reminder' }).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.visible).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'visit-reminder-option-15' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'visit-reminder-option-30' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'visit-reminder-option-60' })).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType('Text')
        .some((node: any) => node.children.includes('You already have a visit reminder scheduled.')),
    ).toBe(true);
  });

  it('surfaces visit reminder permission and scheduling failures without leaving the Add tab', async () => {
    mockedScheduleVisitReminderNotification.mockResolvedValue({
      errorMessage: 'Notification permission is off.',
      status: 'permission_denied',
    });
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'add-option-visit-reminder' }).props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'visit-reminder-option-15' }).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: 'visit-reminder-modal' }).props.visible).toBe(true);
    expect(renderer.root.findAllByType('Text').some((node: any) => node.children.includes('Notification permission is off.'))).toBe(true);
  });

  it('hides Food Discovery from non-beta non-admin users', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    expect(renderer.root.findAllByProps({ testID: 'add-option-food-discovery' })).toHaveLength(0);
  });

  it('shows Food Discovery for beta users', async () => {
    const navigate = jest.fn();
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
        isBetaUser: true,
        isSubscriber: false,
      },
      user: {
        email: 'beta@example.com',
        id: 'user-beta',
        isBetaUser: true,
        verified: true,
      },
      verificationGraceEndsAt: null,
      verificationStatus: 'verified',
    } as never);
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    const foodDiscoveryCard = renderer.root.findByProps({ testID: 'add-option-food-discovery' });
    expect(foodDiscoveryCard.props.titleAccessory).toBeTruthy();

    await act(async () => {
      foodDiscoveryCard.props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('RestaurantDiscovery');
  });

  it('shows Food Discovery for actual admins even when previewing non-admin', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: true,
        isBetaUser: false,
        isSubscriber: false,
      },
      user: {
        email: 'admin@example.com',
        id: 'user-admin',
        isAdmin: false,
        isBetaUser: false,
        verified: true,
      },
      verificationGraceEndsAt: null,
      verificationStatus: 'verified',
    } as never);
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    expect(renderer.root.findByProps({ testID: 'add-option-food-discovery' }).props.titleAccessory).toBeTruthy();
  });

  it('routes Add options through onboarding until the card is dismissed', async () => {
    const navigate = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'add-option-restaurant-visit' }).props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('AddFeatureOnboarding', { cardId: 'trackRestaurantVisit' });
  });

  it('routes dismissed Add options directly to their destinations', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
        isBetaUser: true,
        isSubscriber: false,
      },
      user: {
        id: 'user-1',
        isBetaUser: true,
        mobileOnboardingState: {
          addCards: {
            trackRestaurantVisit: { dismissedAt: '2026-04-28T12:00:00.000Z' },
            trackFoodProduct: { dismissedAt: '2026-04-28T12:01:00.000Z' },
            logNote: { dismissedAt: '2026-04-28T12:02:00.000Z' },
            processSavedPhotos: { dismissedAt: '2026-04-28T12:03:00.000Z' },
            manageNotes: { dismissedAt: '2026-04-28T12:04:00.000Z' },
          },
        },
      },
    } as never);
    const navigate = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    const expectedRoutes = [
      ['add-option-restaurant-visit', 'CreateVisit'],
      ['add-option-food-discovery', 'RestaurantDiscovery'],
      ['add-option-food-product', 'FoodProduct'],
      ['add-option-log-note', 'NoteEditor'],
      ['add-option-process-photos', 'ProcessPhotos'],
      ['add-option-manage-notes', 'Notes'],
    ] as const;

    for (const [testID, routeName] of expectedRoutes) {
      await act(async () => {
        renderer.root.findByProps({ testID }).props.onPress();
      });
      expect(navigate).toHaveBeenLastCalledWith(routeName);
    }
  });

  it('disables Process Saved Photos when the free monthly photo limit is exhausted', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
        isBetaUser: false,
        isSubscriber: false,
      },
      user: {
        id: 'user-1',
        isBetaUser: false,
        isSubscriber: false,
        mobileOnboardingState: {
          addCards: {
            processSavedPhotos: { dismissedAt: '2026-04-28T12:03:00.000Z' },
          },
        },
      },
    } as never);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        remaining: {
          photoUploadsMonthly: 0,
        },
      },
    } as never);
    const navigate = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    const processPhotosCard = renderer.root.findByProps({ testID: 'add-option-process-photos' });
    expect(processPhotosCard.props.disabled).toBe(true);
    expect(processPhotosCard.props.description).toBe(
      "You've reached this month's free photo limit. Photo processing unlocks again next month.",
    );
    expect(processPhotosCard.props.titleAccessory).toBeTruthy();

    await act(async () => {
      processPhotosCard.props.onPress();
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the More tab header fixed and renders an orange scroll body', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        isAdmin: false,
      },
    } as never);

    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <MiscScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'misc', name: 'Misc' } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    const scrollView = renderer.root.findByType('ScrollView');
    expect(scaffold.props.scroll).toBe(false);
    expect(flattenStyle(scrollView.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        flex: 1,
      }),
    );
    expect(renderer.root.findByProps({ testID: 'misc-screen-content-section' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'feature-group-tastings' })).toBeTruthy();
  });

  it('keeps the Profile tab header fixed and uses a keyboard-aware orange body scroller', async () => {
    mockedUseQuery.mockImplementation((options) => {
      const queryKey = JSON.stringify(options.queryKey);

      if (queryKey === JSON.stringify(['feature', 'profile'])) {
        return {
          data: {
            createdAt: '2026-04-01T00:00:00.000Z',
            displayName: 'Nick',
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      if (queryKey === JSON.stringify(['feature', 'feedback', 'summary'])) {
        return {
          data: {
            activeCount: 2,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });

    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <ProfileScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'profile', name: 'Profile' } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    const scrollView = renderer.root.findByType('KeyboardAwareScrollView');
    expect(scaffold.props.scroll).toBe(false);
    expect(flattenStyle(scrollView.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        flex: 1,
      }),
    );
    expect(renderer.root.findByProps({ testID: 'profile-screen-content-section' })).toBeTruthy();
  });

  it('routes the Profile logout button through the queued logout confirmation hook', async () => {
    const requestLogout = jest.fn();
    mockedUseQueuedLogoutConfirmation.mockReturnValue({
      cancelLabel: 'Stay Logged In',
      cancelLogout: jest.fn(),
      confirmLabel: 'Log Out & Discard',
      confirmLoadingLabel: 'Logging out...',
      confirmLogout: jest.fn(),
      description:
        'You have unsynced offline changes queued on this device. Logging out will discard those changes and clear cached data for this account.',
      hasQueuedWrites: false,
      isConfirmVisible: false,
      isLoggingOut: false,
      requestLogout,
      title: 'Discard offline changes and log out?',
    });
    mockedUseQuery.mockImplementation((options) => {
      const queryKey = JSON.stringify(options.queryKey);

      if (queryKey === JSON.stringify(['feature', 'profile'])) {
        return {
          data: {
            createdAt: '2026-04-01T00:00:00.000Z',
            displayName: 'Nick',
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      if (queryKey === JSON.stringify(['feature', 'feedback', 'summary'])) {
        return {
          data: {
            activeCount: 2,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });

    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <ProfileScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'profile', name: 'Profile' } as never}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: 'profile-logout-button' }).props.onPress();
    });

    expect(requestLogout).toHaveBeenCalledTimes(1);
  });

  it('clears the local notification device identity after successful account deletion', async () => {
    const signOut = jest.fn();
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
        isBetaUser: false,
        isSubscriber: false,
      },
      signOut,
      user: {
        email: 'user@example.com',
        id: 'user-1',
        isBetaUser: false,
        verified: true,
      },
      verificationGraceEndsAt: null,
      verificationStatus: 'verified',
    } as never);
    mockedUseQuery.mockImplementation((options) => {
      const queryKey = JSON.stringify(options.queryKey);

      if (queryKey === JSON.stringify(['feature', 'profile'])) {
        return {
          data: {
            createdAt: '2026-04-01T00:00:00.000Z',
            displayName: 'Nick',
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      if (queryKey === JSON.stringify(['feature', 'feedback', 'summary'])) {
        return {
          data: {
            activeCount: 2,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });

    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <ProfileScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'profile', name: 'Profile' } as never}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: 'profile-delete-account-toggle' }).props.onPress();
    });
    const deleteButton = renderer.root
      .findAllByType('Button')
      .find((button: any) => button.props.label === 'Delete Account');
    act(() => {
      deleteButton?.props.onPress();
    });
    const modal = renderer.root.findByProps({ testID: 'profile-delete-account-confirmation-modal' });
    act(() => {
      modal.findByType('Input').props.onChangeText('password123');
    });

    await act(async () => {
      await modal.props.onConfirm();
    });

    expect(mockedDeleteAccount).toHaveBeenCalledWith('password123');
    expect(mockedClearNotificationDeviceIdentity).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shares signup invite codes with the iOS App Store link and locks after sharing', async () => {
    mockedUseMutation.mockImplementation(buildExecutingMutationMock);
    mockedUseQuery.mockImplementation((options) => {
      const queryKey = JSON.stringify(options.queryKey);

      if (queryKey === JSON.stringify(['feature', 'profile'])) {
        return {
          data: {
            createdAt: '2026-04-01T00:00:00.000Z',
            displayName: 'Nick',
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      if (queryKey === JSON.stringify(['feature', 'feedback', 'summary'])) {
        return {
          data: {
            activeCount: 2,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [
          {
            code: 'INVITE123',
            id: 'invite-code-1',
            locked: false,
          },
        ],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });

    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <ProfileScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'profile', name: 'Profile' } as never}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: 'profile-invite-codes-toggle' }).props.onPress();
    });

    const shareButton = renderer.root
      .findAllByType('Button')
      .find((button: any) => button.props.label === 'Share Invite');

    await act(async () => {
      await shareButton?.props.onPress();
    });

    expect(mockedShare).toHaveBeenCalledWith({
      message: expect.stringContaining('https://apps.apple.com/us/app/yummy-recs/id6761597807'),
    });
    expect(mockedShare).toHaveBeenCalledWith({
      message: expect.stringContaining('yummyrecs://signup?code=INVITE123'),
    });
    expect(mockedShare).toHaveBeenCalledWith({
      message: expect.stringContaining('Your invite code: INVITE123'),
    });
    expect(mockedLockInviteCode).toHaveBeenCalledWith('invite-code-1');
  });

  it('does not lock signup invite codes when sharing is canceled', async () => {
    mockedShare.mockResolvedValue({
      action: 'dismissedAction',
    } as Awaited<ReturnType<typeof Share.share>>);
    mockedUseMutation.mockImplementation(buildExecutingMutationMock);
    mockedUseQuery.mockImplementation((options) => {
      const queryKey = JSON.stringify(options.queryKey);

      if (queryKey === JSON.stringify(['feature', 'profile'])) {
        return {
          data: {
            createdAt: '2026-04-01T00:00:00.000Z',
            displayName: 'Nick',
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      if (queryKey === JSON.stringify(['feature', 'feedback', 'summary'])) {
        return {
          data: {
            activeCount: 2,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [
          {
            code: 'INVITE123',
            id: 'invite-code-1',
            locked: false,
          },
        ],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });

    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <ProfileScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'profile', name: 'Profile' } as never}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: 'profile-invite-codes-toggle' }).props.onPress();
    });

    const shareButton = renderer.root
      .findAllByType('Button')
      .find((button: any) => button.props.label === 'Share Invite');

    await act(async () => {
      await shareButton?.props.onPress();
    });

    expect(mockedShare).toHaveBeenCalledTimes(1);
    expect(mockedLockInviteCode).not.toHaveBeenCalled();
  });
});
