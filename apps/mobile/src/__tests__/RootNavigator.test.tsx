import React from 'react';
import { act, create } from 'react-test-renderer';

import { useAuth } from '../providers/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';

const mockReact = React;
const mockNavigate = jest.fn();

jest.mock('react-native', () => {
  return {
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({
        remove: jest.fn(),
      })),
    },
    Platform: {
      OS: 'ios',
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
  NavigationContainer: ({ children }: { children?: React.ReactNode }) =>
    mockReact.createElement('NavigationContainer', null, children),
  useNavigationContainerRef: () => ({
    getCurrentRoute: () => ({ name: 'Home' }),
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
    'ForgotPasswordScreen',
    'FriendsScreen',
    'HomeScreen',
    'ListDetailScreen',
    'ListsScreen',
    'LoginScreen',
    'MiscScreen',
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
    'TastingSessionDetailScreen',
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

describe('RootNavigator', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockedUseAuth.mockReset();
  });

  it('renders the grace-period banner for authenticated unverified users', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user_1',
        isAdmin: false,
      },
      verificationStatus: 'grace_period',
      verificationGraceEndsAt: '2026-04-24T12:00:00.000Z',
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<RootNavigator />);
    });

    expect(renderer.root.findAllByType('EmailVerificationGraceBanner')).toHaveLength(1);
  });

  it('renders only the verification flow after the grace period expires', async () => {
    mockedUseAuth.mockReturnValue({
      status: 'verification_required',
      user: {
        id: 'user_1',
        isAdmin: false,
      },
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
});
