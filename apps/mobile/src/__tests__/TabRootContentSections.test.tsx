import React from 'react';
import { Share } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lockInviteCode } from '../features';
import { useQueuedLogoutConfirmation } from '../hooks/useQueuedLogoutConfirmation';
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
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
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

jest.mock('../components/add', () => ({
  AddOptionCard: (props: Record<string, unknown>) => mockReact.createElement('AddOptionCard', props),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('ConfirmDestructiveModal', props, children),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListInlineBody: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('OptionListInlineBody', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  ScreenContentSection: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('ScreenContentSection', props, children),
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
  deleteAccount: jest.fn(),
  feedbackQueryKeys: {
    summary: ['feature', 'feedback', 'summary'],
  },
  generateInviteCodes: jest.fn(),
  getAuthRecord: jest.fn(() => ({ isInitialUser: false })),
  getFeedbackCountSummary: jest.fn(),
  getProfile: jest.fn(),
  invalidateInviteCodesQueries: jest.fn(),
  listInviteCodes: jest.fn(),
  lockInviteCode: jest.fn(),
  profileQueryKeys: {
    inviteCodes: jest.fn(() => ['feature', 'profile', 'invites']),
    profile: ['feature', 'profile'],
  },
  updateProfile: jest.fn(),
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

jest.mock('../hooks/useQueuedLogoutConfirmation', () => ({
  useQueuedLogoutConfirmation: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
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
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
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
    mockedLockInviteCode.mockReset();
    mockedShare.mockReset();
    mockedUseQueuedLogoutConfirmation.mockReset();

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    } as never);
    mockedUseMutation.mockReturnValue({
      isPending: false,
      mutateAsync: jest.fn(),
    } as never);
    mockedLockInviteCode.mockResolvedValue(undefined);
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
