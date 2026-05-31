import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery } from '@tanstack/react-query';

import { ProfileScreen } from '../screens/ProfileScreen';
import { useAuth } from '../providers/AuthProvider';

const mockReact = React;
const mockNavigate = jest.fn();
const mockTrackObservabilityEvent = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  ActivityIndicator: (props: Record<string, unknown>) => mockReact.createElement('ActivityIndicator', props),
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  Share: {
    share: jest.fn(),
    sharedAction: 'sharedAction',
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('KeyboardAwareScrollView', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(() => ({
    isPending: false,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
  })),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({
    setQueryData: jest.fn(),
  })),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ConfirmDestructiveModal', props, children),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListInlineBody: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionListInlineBody', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  ScreenContentSection: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScreenContentSection', props, children),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  TabBrandHeader: (props: Record<string, unknown>) => mockReact.createElement('TabBrandHeader', props),
  TabRootScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('TabRootScreenScaffold', props, children),
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
  getAuthRecord: jest.fn(() => ({
    created: '2026-04-28T12:00:00.000Z',
    isInitialUser: false,
  })),
  getFeedbackCountSummary: jest.fn(),
  getProfile: jest.fn(),
  invalidateInviteCodesQueries: jest.fn(),
  listInviteCodes: jest.fn(),
  lockInviteCode: jest.fn(),
  profileQueryKeys: {
    inviteCodes: (userId?: string) => ['feature', 'profile', 'inviteCodes', userId],
    profile: ['feature', 'profile'],
  },
  updateProfile: jest.fn(),
}));

jest.mock('../hooks/useQueuedLogoutConfirmation', () => ({
  useQueuedLogoutConfirmation: () => ({
    cancelLabel: 'Cancel',
    cancelLogout: jest.fn(),
    confirmLabel: 'Log out',
    confirmLoadingLabel: 'Logging out...',
    confirmLogout: jest.fn(),
    description: 'Log out?',
    isConfirmVisible: false,
    isLoggingOut: false,
    requestLogout: jest.fn(),
    title: 'Log out?',
  }),
}));

jest.mock('../lib/appMetadata', () => ({
  formatAppVersionLabel: () => '1.0.0',
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: (...args: unknown[]) => mockTrackObservabilityEvent(...args),
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
  createThemedStyles: (factory: (...args: any[]) => Record<string, unknown>) =>
    (...args: any[]) =>
      factory(
        {
          colors: {
            background: {
              app: 'app',
              muted: 'muted',
              surface: 'surface',
            },
            border: {
              danger: 'dangerBorder',
              default: 'defaultBorder',
              subtle: 'subtle',
              warning: 'warningBorder',
            },
            fill: {
              danger: 'dangerFill',
            },
            status: {
              dangerBg: 'dangerBg',
              warningBg: 'warningBg',
            },
            text: {
              danger: 'danger',
              inverse: 'inverse',
              muted: 'muted',
              primary: 'primary',
              secondary: 'secondary',
              success: 'success',
              warning: 'warning',
            },
          },
          radii: {
            md: 8,
            pill: 999,
          },
          spacing: {
            md: 12,
            sm: 8,
            xl: 24,
            xs: 4,
            xxs: 2,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      background: {
        app: 'app',
      },
      text: {
        danger: 'danger',
        muted: 'muted',
        success: 'success',
      },
    },
    spacing: {
      sm: 8,
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

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

async function renderProfileScreen(): Promise<any> {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <ProfileScreen
        navigation={
          {
            navigate: mockNavigate,
          } as never
        }
        route={{ key: 'Profile-route', name: 'Profile' } as never}
      />,
    );
  });
  return renderer;
}

function findRow(renderer: any, testID: string): any {
  return renderer.root.findByProps({ testID });
}

describe('ProfileScreen tutorials', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockTrackObservabilityEvent.mockReset();
    mockedUseAuth.mockReturnValue({
      actualUser: {
        id: 'user_1',
        email: 'test@example.com',
        verified: true,
      },
      signOut: jest.fn(),
      user: {
        id: 'user_1',
        email: 'test@example.com',
        verified: true,
      },
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = JSON.stringify(options.queryKey);

      if (queryKey.includes('feedback')) {
        return {
          data: { activeCount: 0 },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      if (queryKey.includes('inviteCodes')) {
        return {
          data: [],
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: { displayName: 'Test User' },
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
  });

  it('renders Tutorials instead of Onboarding Tutorials and opens the Tutorials screen', async () => {
    const renderer = await renderProfileScreen();

    expect(renderer.root.findAllByProps({ title: 'Onboarding Tutorials' })).toHaveLength(0);
    expect(findRow(renderer, 'profile-tutorials-toggle').props.title).toBe('Tutorials');

    await act(async () => {
      findRow(renderer, 'profile-tutorials-toggle').props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Tutorials');
  });

  it('opens notification preferences from Invites & Settings', async () => {
    const renderer = await renderProfileScreen();

    const notificationRow = findRow(renderer, 'profile-notification-preferences-link');
    expect(notificationRow.props.title).toBe('Notifications');

    await act(async () => {
      notificationRow.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('NotificationPreferences');
  });
});
