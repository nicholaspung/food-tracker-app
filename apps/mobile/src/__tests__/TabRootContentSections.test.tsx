import React from 'react';
import { act, create } from 'react-test-renderer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
    share: jest.fn(),
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
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

function renderWithNavigation(element: React.ReactElement) {
  return create(element);
}

function triggerHeaderMeasurement(renderer: any, height: number) {
  const headerWrapper = renderer.root.find(
    (node: any) =>
      node.type === 'View' &&
      typeof node.props.onLayout === 'function' &&
      node.findAllByType('TabBrandHeader').length > 0,
  );

  act(() => {
    headerWrapper.props.onLayout({
      nativeEvent: {
        layout: {
          height,
          width: 360,
          x: 0,
          y: 0,
        },
      },
    });
  });
}

describe('tab root content sections', () => {
  beforeEach(() => {
    mockedUseQuery.mockReset();
    mockedUseMutation.mockReset();
    mockedUseQueryClient.mockReset();
    mockedUseAuth.mockReset();

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
    } as never);
    mockedUseMutation.mockReturnValue({
      isPending: false,
      mutateAsync: jest.fn(),
    } as never);
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
  });

  it('measures the Add tab header and keeps the body in its orange content section', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderWithNavigation(
        <AddVisitScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'add', name: 'AddVisit' } as never}
        />,
      );
    });

    triggerHeaderMeasurement(renderer, 112);

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    expect(scaffold.props.scrollUnderlayTopInset).toBe(112);
    expect(renderer.root.findByProps({ testID: 'add-screen-content-section' })).toBeTruthy();
  });

  it('measures the More tab header, keeps the underlay orange, and renders an explicit content section', async () => {
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

    triggerHeaderMeasurement(renderer, 104);

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    expect(scaffold.props.scrollUnderlayTopInset).toBe(104);
    expect(scaffold.props.scrollUnderlayColor).toBe('app-background');
    expect(renderer.root.findByProps({ testID: 'misc-screen-content-section' })).toBeTruthy();
  });

  it('measures the Profile tab header and wraps the body in an orange content section', async () => {
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

    triggerHeaderMeasurement(renderer, 126);

    const scaffold = renderer.root.findByType('TabRootScreenScaffold');
    expect(scaffold.props.scrollUnderlayTopInset).toBe(126);
    expect(renderer.root.findByProps({ testID: 'profile-screen-content-section' })).toBeTruthy();
  });
});
