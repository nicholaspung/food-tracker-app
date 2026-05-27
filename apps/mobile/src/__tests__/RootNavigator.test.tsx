import React from 'react';
import { act, create } from 'react-test-renderer';

import { trackObservabilityEvent, trackWebPageLeave, trackWebPageView } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { AUTH_LINKING, RootNavigator } from '../navigation/RootNavigator';

const mockReact = React;
const mockNavigate = jest.fn();
let mockCurrentRouteName = 'Home';
let mockAppStateChange: ((nextState: string) => void) | undefined;
let mockNavigationStateChange: (() => void) | undefined;

jest.mock('react-native', () => {
  return {
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn((_event: string, handler: (nextState: string) => void) => {
        mockAppStateChange = handler;
        return {
          remove: jest.fn(),
        };
      }),
    },
    Platform: {
      OS: 'ios',
      select: (options: Record<string, unknown>) => options.ios ?? options.default,
    },
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('View', props, children),
  };
});

jest.mock('@react-navigation/native', () => ({
  DefaultTheme: {
    colors: {},
  },
  NavigationContainer: ({
    children,
    onReady,
    onStateChange,
  }: {
    children?: React.ReactNode;
    onReady?: () => void;
    onStateChange?: () => void;
  }) => {
    mockNavigationStateChange = onStateChange;
    mockReact.useEffect(() => {
      onReady?.();
    }, [onReady]);

    return mockReact.createElement('NavigationContainer', null, children);
  },
  useNavigationContainerRef: () => ({
    getCurrentRoute: () => ({ name: mockCurrentRouteName }),
    isReady: () => true,
    navigate: mockNavigate,
  }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement('StackNavigator', null, children),
    Screen: ({
      name,
      component: Component,
      initialParams,
    }: {
      name: string;
      component: React.ComponentType<any>;
      initialParams?: unknown;
    }) =>
      mockReact.createElement(
        'StackScreen',
        { name },
        Component
          ? mockReact.createElement(Component, {
              navigation: {
                canGoBack: () => false,
                goBack: jest.fn(),
                navigate: jest.fn(),
                reset: jest.fn(),
              },
              route: {
                key: `${name}-route`,
                name,
                params: initialParams,
              },
            })
          : null,
      ),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    bottom: 0,
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
  trackWebPageLeave: jest.fn(),
  trackWebPageView: jest.fn(),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackProductEvent: jest.fn(),
}));

jest.mock('../features/store/onboardingStore', () => ({
  MAIN_ONBOARDING_VERSION: 1,
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      background: {
        app: 'white',
        surface: 'white',
      },
      border: {
        default: 'black',
      },
      text: {
        brand: 'blue',
        primary: 'black',
      },
    },
    typography: {
      label: {},
    },
  }),
}));

jest.mock('../components/shared', () => ({
  EmailVerificationGraceBanner: (props: Record<string, unknown>) =>
    mockReact.createElement('EmailVerificationGraceBanner', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
}));

jest.mock('../components/shared/BottomTabNavigation', () => ({
  BottomTabNavigation: (props: Record<string, unknown>) => mockReact.createElement('BottomTabNavigation', props),
  getBottomTabRouteForScreen: () => null,
}));

jest.mock('../ui', () => ({
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
}));

jest.mock('../screens', () => {
  const screenNames = [
    'AddRestaurantToListScreen',
    'AddFeatureOnboardingScreen',
    'AddVisitScreen',
    'AboutScreen',
    'BillDetailScreen',
    'BillsScreen',
    'CreateBillScreen',
    'CreateRestaurantListScreen',
    'CreateVisitAddRestaurantScreen',
    'CreateVisitAddMenuItemScreen',
    'CreateVisitEditMenuItemScreen',
    'CreateVisitScreen',
    'EditFoodProductScreen',
    'EditRestaurantListScreen',
    'CreateFeedbackScreen',
    'AddFriendScreen',
    'EditVisitScreen',
    'FeedbackScreen',
    'FeedbackDetailScreen',
    'FeatureOnboardingScreen',
    'ForgotPasswordScreen',
    'FriendsScreen',
    'HomeScreen',
    'ListDetailScreen',
    'ListsScreen',
    'LoginScreen',
    'MiscScreen',
    'RestaurantDiscoveryRestaurantScreen',
    'RestaurantDiscoveryScreen',
    'NoteEditorScreen',
    'NotesScreen',
    'OnboardingScreen',
    'PhotoProcessingScreen',
    'PrivacyPolicyScreen',
    'ProfileScreen',
    'QRScannerScreen',
    'FoodProductScreen',
    'ResetPasswordScreen',
    'SettingsScreen',
    'SignUpScreen',
    'SplashScreen',
    'TermsOfServiceScreen',
    'TipCalculatorScreen',
    'CreateTastingSessionScreen',
    'JoinTastingSessionScreen',
    'TastingSessionDetailScreen',
    'TastingSessionLobbyScreen',
    'TastingSessionPlanningScreen',
    'TastingSessionResultsScreen',
    'TastingSessionTastingScreen',
    'TastingSessionsScreen',
    'VisitShareCustomizationScreen',
    'VerifyEmailScreen',
  ];

  return Object.fromEntries(
    screenNames.map((name) => [
      name,
      () => mockReact.createElement('MockScreen', { screenName: name }, name),
    ]),
  );
});

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedTrackWebPageLeave = trackWebPageLeave as jest.MockedFunction<typeof trackWebPageLeave>;
const mockedTrackWebPageView = trackWebPageView as jest.MockedFunction<typeof trackWebPageView>;
const completedMobileOnboardingState = {
  main: {
    completedVersion: 1,
  },
};

describe('RootNavigator', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedTrackWebPageLeave.mockReset();
    mockedTrackWebPageView.mockReset();
    mockedUseAuth.mockReset();
    mockAppStateChange = undefined;
    mockCurrentRouteName = 'Home';
    mockNavigationStateChange = undefined;
  });

  it('tracks the initial route with product and web page analytics', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    await act(async () => {
      create(<RootNavigator />);
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('SCREEN_VIEW', {
      previousScreenName: null,
      screenName: 'Home',
    });
    expect(mockedTrackWebPageView).toHaveBeenCalledTimes(1);
    expect(mockedTrackWebPageView).toHaveBeenCalledWith({
      previousScreenName: null,
      screenName: 'Home',
    });
  });

  it('tracks web pageleave and pageview on route transitions without duplicating same-route updates', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    await act(async () => {
      create(<RootNavigator />);
    });

    await act(async () => {
      mockNavigationStateChange?.();
    });

    expect(mockedTrackWebPageView).toHaveBeenCalledTimes(1);
    expect(mockedTrackWebPageLeave).not.toHaveBeenCalled();

    mockCurrentRouteName = 'Friends';
    await act(async () => {
      mockNavigationStateChange?.();
    });

    expect(mockedTrackWebPageLeave).toHaveBeenCalledWith(
      expect.objectContaining({
        nextScreenName: 'Friends',
        reason: 'navigation',
        screenName: 'Home',
      }),
    );
    expect(mockedTrackWebPageView).toHaveBeenCalledTimes(2);
    expect(mockedTrackWebPageView).toHaveBeenLastCalledWith({
      previousScreenName: 'Home',
      screenName: 'Friends',
    });
  });

  it('tracks web pageleave when the app backgrounds', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    await act(async () => {
      create(<RootNavigator />);
    });

    await act(async () => {
      mockAppStateChange?.('background');
    });

    expect(mockedTrackWebPageLeave).toHaveBeenCalledWith(
      expect.objectContaining({
        nextScreenName: null,
        reason: 'app_background',
        screenName: 'Home',
      }),
    );
  });

  it('renders the grace-period banner for authenticated unverified users', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'grace_period',
      verificationGraceEndsAt: '2026-04-24T12:00:00.000Z',
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(1);
  });

  it('does not render the grace-period banner on the VerifyEmail route', async () => {
    mockCurrentRouteName = 'VerifyEmail';
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'grace_period',
      verificationGraceEndsAt: '2026-04-24T12:00:00.000Z',
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(0);
  });

  it('does not render the grace-period banner while required feature onboarding is incomplete', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
      },
      isSubmitting: false,
      verificationStatus: 'grace_period',
      verificationGraceEndsAt: '2026-04-24T12:00:00.000Z',
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedStackScreens = renderer.root.findAllByType('StackScreen').map((node: any) => node.props.name);
    expect(renderedStackScreens.indexOf('FeatureOnboarding')).toBeLessThan(renderedStackScreens.indexOf('Home'));
    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(0);
  });

  it('renders only the verification flow after the grace period expires', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'verification_required',
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'grace_expired',
      verificationGraceEndsAt: '2026-04-24T12:00:00.000Z',
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });
    const renderedScreens = renderer.root.findAllByType('MockScreen').map((node: any) => node.props.screenName);

    expect(renderedScreens).toContain('VerifyEmailScreen');
    expect(renderedScreens).not.toContain('HomeScreen');
  });

  it('renders bottom tabs on authenticated tab routes even while auth submission is completing', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: true,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
  });

  it('renders bottom tabs after authenticated auth submission completes', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
  });

  it.each(['CreateTastingSession', 'JoinTastingSession'] as const)(
    'renders bottom tabs on the %s route',
    async (routeName) => {
      mockCurrentRouteName = routeName;
      mockedUseAuth.mockReturnValue({
        status: 'authenticated',
        actualUser: {
          id: 'user_1',
          isAdmin: false,
        },
        user: {
          id: 'user_1',
          isAdmin: false,
          mobileOnboardingState: completedMobileOnboardingState,
        },
        isSubmitting: false,
        verificationStatus: 'verified',
        verificationGraceEndsAt: null,
      } as unknown as ReturnType<typeof useAuth>);

      let renderer: any;
      await act(async () => {
        renderer = create(<RootNavigator />);
      });

      expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
    },
  );

  it('renders group tasting session routes for non-admin users', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedMockScreens = renderer.root.findAllByType('MockScreen').map((node: any) => node.props.screenName);
    expect(renderedMockScreens).toEqual(
      expect.arrayContaining([
        'TastingSessionsScreen',
        'CreateTastingSessionScreen',
        'JoinTastingSessionScreen',
        'TastingSessionDetailScreen',
        'TastingSessionLobbyScreen',
        'TastingSessionPlanningScreen',
        'TastingSessionTastingScreen',
        'TastingSessionResultsScreen',
      ]),
    );
    expect(
      renderer.root
        .findAllByType('EmptyState')
        .filter((node: any) => node.props.description === 'This route is restricted to admin users.'),
    ).toHaveLength(0);
  });

  it('puts required feature onboarding before Home for incomplete authenticated users', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedStackScreens = renderer.root.findAllByType('StackScreen').map((node: any) => node.props.name);
    expect(renderedStackScreens.indexOf('FeatureOnboarding')).toBeLessThan(renderedStackScreens.indexOf('Home'));
    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(0);
  });

  it('keeps completed authenticated users on the normal Home-first stack', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedStackScreens = renderer.root.findAllByType('StackScreen').map((node: any) => node.props.name);
    expect(renderedStackScreens.indexOf('Home')).toBeLessThan(renderedStackScreens.indexOf('FeatureOnboarding'));
    expect(renderedStackScreens).toContain('AddFeatureOnboarding');
    expect(renderedStackScreens).toContain('RestaurantDiscovery');
    expect(renderedStackScreens).toContain('RestaurantDiscoveryRestaurant');
    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
  });

  it('guards restaurant discovery routes for non-beta non-admin users', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
        isBetaUser: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        isBetaUser: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedStackScreens = renderer.root.findAllByType('StackScreen').map((node: any) => node.props.name);
    const renderedMockScreens = renderer.root.findAllByType('MockScreen').map((node: any) => node.props.screenName);
    const betaGuardMessages = renderer.root
      .findAllByType('EmptyState')
      .filter((node: any) => node.props.description === 'This beta feature is available to admins and beta users.');

    expect(renderedStackScreens).toContain('RestaurantDiscovery');
    expect(renderedStackScreens).toContain('RestaurantDiscoveryRestaurant');
    expect(renderedMockScreens).not.toContain('RestaurantDiscoveryScreen');
    expect(renderedMockScreens).not.toContain('RestaurantDiscoveryRestaurantScreen');
    expect(betaGuardMessages).toHaveLength(2);
  });

  it('renders restaurant discovery routes for beta users', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'user_1',
        isAdmin: false,
        isBetaUser: true,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      user: {
        id: 'user_1',
        isAdmin: false,
        isBetaUser: true,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedMockScreens = renderer.root.findAllByType('MockScreen').map((node: any) => node.props.screenName);
    expect(renderedMockScreens).toContain('RestaurantDiscoveryScreen');
    expect(renderedMockScreens).toContain('RestaurantDiscoveryRestaurantScreen');
  });

  it('renders restaurant discovery routes for actual admins previewing non-admin', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      actualUser: {
        id: 'admin_1',
        isAdmin: true,
        isBetaUser: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      user: {
        id: 'admin_1',
        isAdmin: false,
        isBetaUser: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: false,
      verificationStatus: 'verified',
      verificationGraceEndsAt: null,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    const renderedMockScreens = renderer.root.findAllByType('MockScreen').map((node: any) => node.props.screenName);
    expect(renderedMockScreens).toContain('RestaurantDiscoveryScreen');
    expect(renderedMockScreens).toContain('RestaurantDiscoveryRestaurantScreen');
  });

  it('waits for the auth screen transition before showing the verification banner after submission', async () => {
    jest.useFakeTimers();
    let authValue = {
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
        mobileOnboardingState: completedMobileOnboardingState,
      },
      isSubmitting: true,
      verificationStatus: 'grace_period',
      verificationGraceEndsAt: '2026-04-24T12:00:00.000Z',
    } as unknown as ReturnType<typeof useAuth>;
    mockedUseAuth.mockImplementation(() => authValue);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(0);

    authValue = {
      ...authValue,
      isSubmitting: false,
    };

    await act(async () => {
      renderer.update(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(499);
    });

    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    expect(renderer.root.findAllByType('BottomTabNavigation')).toHaveLength(1);
    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(1);
    jest.useRealTimers();
  });

  it('parses reset password token links', () => {
    const { getStateFromPath } = jest.requireActual('@react-navigation/native') as typeof import('@react-navigation/native');
    const state = getStateFromPath('/reset-password?token=abc', AUTH_LINKING.config);

    expect(state?.routes[0]).toMatchObject({
      name: 'ResetPassword',
      params: {
        token: 'abc',
      },
    });
  });

  it('registers beta and production auth link prefixes', () => {
    expect(AUTH_LINKING.prefixes).toEqual(
      expect.arrayContaining([
        'yummyrecs://',
        'yummyrecs-preview://',
        'https://app.yummyrecs.com',
        'https://beta.app.yummyrecs.com',
      ]),
    );
  });

  it('parses verify email token links', () => {
    const { getStateFromPath } = jest.requireActual('@react-navigation/native') as typeof import('@react-navigation/native');
    const state = getStateFromPath('/verify-email?token=abc', AUTH_LINKING.config);

    expect(state?.routes[0]).toMatchObject({
      name: 'VerifyEmail',
      params: {
        token: 'abc',
      },
    });
  });

  it('parses waitlist approval signup links', () => {
    const { getStateFromPath } = jest.requireActual('@react-navigation/native') as typeof import('@react-navigation/native');
    const state = getStateFromPath(
      '/signup?email=approved%40example.com&mode=waitlist_approved',
      AUTH_LINKING.config,
    );

    expect(state?.routes[0]).toMatchObject({
      name: 'SignUp',
      params: {
        email: 'approved@example.com',
        mode: 'waitlist_approved',
      },
    });
  });

  it('parses shared restaurant list links', () => {
    const { getStateFromPath } = jest.requireActual('@react-navigation/native') as typeof import('@react-navigation/native');
    const state = getStateFromPath('/lists/shared/share-token-123', AUTH_LINKING.config);

    expect(state?.routes[0]).toMatchObject({
      name: 'SharedRestaurantList',
      params: {
        shareToken: 'share-token-123',
      },
    });
  });
});
