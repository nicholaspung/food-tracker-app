import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View, type AppStateStatus } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BottomTabNavigation,
  getBottomTabRouteForScreen,
  type BottomTabRoute,
} from '../components/shared/BottomTabNavigation';
import { EmailVerificationGraceBanner, EmptyState } from '../components/shared';
import { APP_NAME } from '../lib/branding';
import type { HomeInitialViewParams } from './homeRouteParams';
import { MAIN_ONBOARDING_VERSION } from '../features/store/onboardingStore';
import type { AddOnboardingCardId, MoreOnboardingCardId } from '../types/auth';
import type { MainOnboardingCardId } from '../types/onboarding';
import { useAuth } from '../providers/AuthProvider';
import { LayoutChromeProvider } from '../providers/LayoutChromeProvider';
import { trackObservabilityEvent } from '../observability';
import {
  AddRestaurantToListScreen,
  AddFeatureOnboardingScreen,
  AddVisitScreen,
  AboutScreen,
  BillDetailScreen,
  BillsScreen,
  CreateBillScreen,
  CreateRestaurantListScreen,
  CreateVisitAddRestaurantScreen,
  CreateVisitAddMenuItemScreen,
  CreateVisitEditMenuItemScreen,
  CreateVisitScreen,
  EditFoodProductScreen,
  EditRestaurantListScreen,
  CreateFeedbackScreen,
  AddFriendScreen,
  EditVisitScreen,
  FeedbackScreen,
  FeedbackDetailScreen,
  FeatureOnboardingScreen,
  ForgotPasswordScreen,
  FriendsScreen,
  HomeScreen,
  ListDetailScreen,
  ListsScreen,
  LoginScreen,
  MiscScreen,
  MoreFeatureOnboardingScreen,
  RestaurantDiscoveryRestaurantScreen,
  RestaurantDiscoveryScreen,
  NoteEditorScreen,
  NotesScreen,
  OnboardingScreen,
  PhotoProcessingScreen,
  PrivacyPolicyScreen,
  ProfileScreen,
  QRScannerScreen,
  FoodProductScreen,
  ResetPasswordScreen,
  SettingsScreen,
  SignUpScreen,
  SplashScreen,
  TermsOfServiceScreen,
  TipCalculatorScreen,
  TutorialsScreen,
  TastingSessionDetailScreen,
  TastingSessionsScreen,
  VisitShareCustomizationScreen,
  VerifyEmailScreen,
  WaitlistConfirmationScreen,
} from '../screens';
import { useTheme } from '../theme';
import { Screen } from '../ui';

export type RootStackParamList = {
  Onboarding: undefined;
  Login:
    | {
        email?: string;
      }
    | undefined;
  SignUp:
    | {
        email?: string;
        inviteCode?: string;
        code?: string;
        mode?: 'waitlist_approved' | 'invite_code' | 'join_waitlist';
      }
    | undefined;
  WaitlistConfirmation: {
    email: string;
  };
  ForgotPassword: undefined;
  ResetPassword:
    | {
        email?: string;
        token?: string;
        source?: 'request' | 'email_link';
      }
    | undefined;
  VerifyEmail:
    | {
        email?: string;
        password?: string;
        token?: string;
        source?: 'sign_up' | 'login' | 'banner' | 'profile' | 'expired_entry' | 'email_link';
      }
    | undefined;
  FeatureOnboarding:
    | {
        mode?: 'required' | 'replay';
        initialCardId?: MainOnboardingCardId;
        source?: 'profile';
      }
    | undefined;
  Home:
    | {
        initialView?: HomeInitialViewParams;
      }
    | undefined;
  VisitShareCustomization: {
    restaurantName: string;
    visitDate: string;
    items: {
      itemId: string;
      itemName: string;
      rating: number;
      photoId: string;
      photoFilename: string;
      photoCollectionId?: string;
      photoCollectionName?: string;
    }[];
  };
  AddVisit: undefined;
  RestaurantDiscovery: undefined;
  RestaurantDiscoveryRestaurant: {
    restaurantId: string;
    restaurantName: string;
    location?: string;
    city?: string;
    cuisineType?: string;
    visibility?: 'private' | 'friends' | 'public';
    latitude?: number;
    longitude?: number;
    placeId?: string;
    isGooglePlace?: boolean;
    userVisitCount?: number;
    friendCount?: number;
    hasPendingMenuReview?: boolean;
  };
  AddFeatureOnboarding: {
    cardId: AddOnboardingCardId;
    mode?: 'firstRun' | 'replay';
    source?: 'add' | 'profile';
  };
  CreateVisit:
    | {
        preselectedRestaurantId?: string;
        preselectedRestaurantName?: string;
        preselectedMenuItemId?: string;
        preselectedMenuItemName?: string;
        sourceListId?: string;
        sourceListItemId?: string;
        sourceNoteId?: string;
        editVisitId?: string;
        returnToStep?: 0 | 1 | 2;
      }
    | undefined;
  CreateVisitAddRestaurant:
    | {
        editVisitId?: string;
        initialLocation?: string;
        initialRestaurantName?: string;
        returnTo?: 'CreateVisit' | 'RestaurantDiscovery' | 'RestaurantDiscoveryRestaurant';
        sourceNoteId?: string;
      }
    | undefined;
  CreateVisitAddMenuItem: {
    restaurantId: string;
    restaurantName: string;
    editVisitId?: string;
    sourceNoteId?: string;
  };
  CreateVisitEditMenuItem: {
    menuItemId: string;
    restaurantId: string;
    initialName: string;
    initialVisibility?: 'private' | 'friends' | 'public';
  };
  EditVisit: { visitId: string };
  FoodProduct:
    | {
        sourceNoteId?: string;
        returnToPrevious?: boolean;
      }
    | undefined;
  EditFoodProduct: { foodProductId: string; exitToHomeOnClose?: boolean };
  ProcessPhotos:
    | {
        mode?: 'menu_scan' | 'general';
        restaurantId?: string;
        restaurantName?: string;
        autoStartSourcePicker?: boolean;
        sourceNoteId?: string;
      }
    | undefined;
  Lists: undefined;
  CreateRestaurantList: undefined;
  ListDetail: { listId: string };
  EditRestaurantList: { listId: string };
  AddRestaurantToList: { listId: string };
  Notes: undefined;
  NoteEditor: { noteId?: string } | undefined;
  Friends:
    | {
        initialSection?: 'my-code' | 'friends-list';
        initialFriendsSubTab?: 'friends' | 'requests' | 'sent';
      }
    | undefined;
  AddFriend: undefined;
  Profile: undefined;
  About: undefined;
  TermsOfService: undefined;
  PrivacyPolicy: undefined;
  QRScanner: undefined;
  Settings: undefined;
  Feedback: undefined;
  CreateFeedback: undefined;
  FeedbackDetail: { feedbackId: string };
  Tutorials: undefined;
  Misc: undefined;
  MoreFeatureOnboarding: {
    cardId: MoreOnboardingCardId;
    mode?: 'firstRun' | 'replay';
    source?: 'more' | 'profile';
  };
  TastingSessions: undefined;
  TastingSessionDetail: { sessionId: string };
  Bills: undefined;
  CreateBill: { billId?: string } | undefined;
  BillDetail: { billId: string };
  TipCalculator: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export const AUTH_LINKING: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'yummyrecs://',
    'https://yummyrecs.com',
    'https://www.yummyrecs.com',
    'https://beta.yummyrecs.com',
    'https://app.yummyrecs.com',
    'https://beta.app.yummyrecs.com',
  ],
  config: {
    screens: {
      Onboarding: '',
      Login: 'login',
      SignUp: 'signup',
      WaitlistConfirmation: 'waitlist',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
      VerifyEmail: 'verify-email',
      Home: 'home',
      Friends: 'friends',
    },
  },
};

const ROUTES_WITH_TABS: (keyof RootStackParamList)[] = [
  'Home',
  'FeatureOnboarding',
  'AddVisit',
  'RestaurantDiscovery',
  'RestaurantDiscoveryRestaurant',
  'AddFeatureOnboarding',
  'CreateVisit',
  'CreateVisitAddRestaurant',
  'CreateVisitAddMenuItem',
  'CreateVisitEditMenuItem',
  'EditVisit',
  'FoodProduct',
  'EditFoodProduct',
  'ProcessPhotos',
  'Friends',
  'AddFriend',
  'QRScanner',
  'Profile',
  'About',
  'TermsOfService',
  'PrivacyPolicy',
  'Settings',
  'Feedback',
  'CreateFeedback',
  'FeedbackDetail',
  'Tutorials',
  'Misc',
  'MoreFeatureOnboarding',
  'Lists',
  'CreateRestaurantList',
  'ListDetail',
  'EditRestaurantList',
  'AddRestaurantToList',
  'Notes',
  'NoteEditor',
  'Bills',
  'CreateBill',
  'BillDetail',
  'TipCalculator',
  'TastingSessions',
  'TastingSessionDetail',
];

const WEB_TAB_TITLE_BY_ROUTE: Record<BottomTabRoute, string> = {
  Home: 'Home',
  AddVisit: 'Add',
  Friends: 'Friends',
  Misc: 'More',
  Profile: 'Profile',
};
const AUTH_CHROME_SETTLE_DELAY_MS = 500;

const WEB_SCREEN_TITLE_BY_ROUTE: Partial<Record<keyof RootStackParamList, string>> = {
  Onboarding: 'Welcome',
  Login: 'Login',
  SignUp: 'Sign Up',
  WaitlistConfirmation: 'Waitlist',
  ForgotPassword: 'Forgot Password',
  ResetPassword: 'Check Email',
  VerifyEmail: 'Verify Email',
  FeatureOnboarding: 'Onboarding',
  RestaurantDiscovery: 'Food Discovery',
  RestaurantDiscoveryRestaurant: 'Food Discovery',
  AddFeatureOnboarding: 'Feature Intro',
  CreateFeedback: 'New Feedback',
  VisitShareCustomization: 'Share',
};

function getWebDocumentTitle(routeName?: keyof RootStackParamList) {
  if (!routeName) {
    return APP_NAME;
  }

  const tabRoute = getBottomTabRouteForScreen(routeName);
  const screenTitle = tabRoute
    ? WEB_TAB_TITLE_BY_ROUTE[tabRoute]
    : (WEB_SCREEN_TITLE_BY_ROUTE[routeName] ?? routeName);

  return `${APP_NAME} - ${screenTitle}`;
}

function AdminOnlyRouteGuard() {
  return (
    <Screen>
      <EmptyState
        description="This route is restricted to admin users."
        title="Access denied"
      />
    </Screen>
  );
}

function BetaFeatureRouteGuard() {
  return (
    <Screen>
      <EmptyState
        description="This beta feature is available to admins and beta users."
        title="Access denied"
      />
    </Screen>
  );
}

export function RootNavigator() {
  const { status, actualUser, user, verificationGraceEndsAt, verificationStatus, isSubmitting } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootStackParamList>();
  const [currentRouteParams, setCurrentRouteParams] = useState<RootStackParamList[keyof RootStackParamList]>();
  const [verificationBannerHeight, setVerificationBannerHeight] = useState(0);
  const previousRouteNameRef = useRef<keyof RootStackParamList | null>(null);
  const activeRouteNameRef = useRef<keyof RootStackParamList | null>(null);
  const routeStartedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const authSubmissionWasActiveRef = useRef(false);
  const [isAuthenticatedChromeReady, setIsAuthenticatedChromeReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    document.title = getWebDocumentTitle(currentRouteName);
  }, [currentRouteName]);

  const navigationTheme = {
    ...DefaultTheme,
    dark: theme.colorScheme === 'dark',
    colors: {
      ...DefaultTheme.colors,
      primary: theme.colors.text.brand,
      background: theme.colors.background.app,
      card: theme.colors.background.surface,
      text: theme.colors.text.primary,
      border: theme.colors.border.default,
    },
  };

  const trackScreenDwellCompleted = useCallback((options: {
    nextScreenName?: keyof RootStackParamList;
    reason?: 'app_background';
  }) => {
    const activeRouteName = activeRouteNameRef.current;
    const routeStartedAt = routeStartedAtRef.current;
    if (!activeRouteName || routeStartedAt === null) {
      return;
    }

    trackObservabilityEvent('SCREEN_DWELL_COMPLETED', {
      durationMs: Math.max(0, Date.now() - routeStartedAt),
      nextScreenName: options.nextScreenName ?? null,
      reason: options.reason ?? null,
      screenName: activeRouteName,
    });
  }, []);

  const updateCurrentRoute = useCallback(() => {
    const currentRoute = navigationRef.getCurrentRoute();
    const routeName = currentRoute?.name;
    const typedRouteName = routeName as keyof RootStackParamList | undefined;
    const typedRouteParams = currentRoute?.params as RootStackParamList[keyof RootStackParamList] | undefined;
    setCurrentRouteName(typedRouteName);
    setCurrentRouteParams(typedRouteParams);

    if (!typedRouteName) {
      return;
    }

    const previousRouteName = previousRouteNameRef.current;
    if (!previousRouteName) {
      activeRouteNameRef.current = typedRouteName;
      routeStartedAtRef.current = Date.now();
      trackObservabilityEvent('SCREEN_VIEW', {
        screenName: typedRouteName,
        previousScreenName: null,
      });
      previousRouteNameRef.current = typedRouteName;
      return;
    }

    if (previousRouteName === typedRouteName) {
      activeRouteNameRef.current = typedRouteName;
      if (routeStartedAtRef.current === null) {
        routeStartedAtRef.current = Date.now();
      }
      return;
    }

    trackScreenDwellCompleted({ nextScreenName: typedRouteName });
    trackObservabilityEvent('SCREEN_VIEW', {
      screenName: typedRouteName,
      previousScreenName: previousRouteName,
    });
    activeRouteNameRef.current = typedRouteName;
    routeStartedAtRef.current = Date.now();
    previousRouteNameRef.current = typedRouteName;
  }, [navigationRef, trackScreenDwellCompleted]);

  const requiresFeatureOnboarding =
    status === 'authenticated' &&
    (user?.mobileOnboardingState?.main?.completedVersion ?? 0) < MAIN_ONBOARDING_VERSION;
  const canAccessFoodDiscovery = actualUser?.isAdmin === true || user?.isBetaUser === true;
  const hasBottomTabsRoute =
    status === 'authenticated' &&
    !requiresFeatureOnboarding &&
    !!currentRouteName &&
    ROUTES_WITH_TABS.includes(currentRouteName);
  const shouldShowVerificationBanner =
    status === 'authenticated' &&
    isAuthenticatedChromeReady &&
    verificationStatus === 'grace_period' &&
    Boolean(verificationGraceEndsAt) &&
    currentRouteName !== 'VerifyEmail';
  const navigatorKey =
    status === 'authenticated'
      ? 'authenticated'
      : status === 'verification_required'
        ? 'verification-required'
      : 'unauthenticated';
  const bottomPadding = Math.max(6, Math.min(insets.bottom, 10));

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    navigatorBody: {
      flex: 1,
    },
  });

  const handleTabPress = (route: BottomTabRoute) => {
    if (!navigationRef.isReady()) {
      return;
    }

    trackObservabilityEvent('TAB_PRESSED', {
      currentScreenName: currentRouteName ?? null,
      tabRoute: route,
    });
    navigationRef.navigate(route);
  };

  useEffect(() => {
    if (isSubmitting) {
      authSubmissionWasActiveRef.current = true;
      setIsAuthenticatedChromeReady(false);
      return undefined;
    }

    if (status !== 'authenticated') {
      setIsAuthenticatedChromeReady(false);
      return undefined;
    }

    if (!authSubmissionWasActiveRef.current) {
      setIsAuthenticatedChromeReady(true);
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      authSubmissionWasActiveRef.current = false;
      setIsAuthenticatedChromeReady(true);
    }, AUTH_CHROME_SETTLE_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isSubmitting, status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (previousState === 'active' && nextState === 'background') {
        trackScreenDwellCompleted({ reason: 'app_background' });
        routeStartedAtRef.current = null;
        return;
      }

      if (previousState === 'background' && nextState === 'active' && activeRouteNameRef.current) {
        routeStartedAtRef.current = Date.now();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [trackScreenDwellCompleted]);

  if (status === 'bootstrapping') {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer
      linking={AUTH_LINKING}
      onReady={updateCurrentRoute}
      onStateChange={updateCurrentRoute}
      ref={navigationRef}
      theme={navigationTheme}
    >
      <LayoutChromeProvider
        topInsetConsumedByOverlay={shouldShowVerificationBanner}
        topOverlayHeight={shouldShowVerificationBanner ? verificationBannerHeight : 0}
      >
        <View style={styles.container}>
          {shouldShowVerificationBanner && verificationGraceEndsAt ? (
            <View
              onLayout={(event) => {
                setVerificationBannerHeight(event.nativeEvent.layout.height);
              }}
            >
              <EmailVerificationGraceBanner
                graceEndsAt={verificationGraceEndsAt}
                onVerifyPress={() => {
                  navigationRef.navigate('VerifyEmail', {
                    source: 'banner',
                  });
                }}
              />
            </View>
          ) : null}
          <View style={styles.navigatorBody}>
            <Stack.Navigator
              key={navigatorKey}
              screenOptions={{
                animation: 'none',
                headerStyle: {
                  backgroundColor: theme.colors.background.surface,
                },
                headerTintColor: theme.colors.text.primary,
                headerTitleStyle: {
                  ...theme.typography.label,
                },
                contentStyle: {
                  backgroundColor: theme.colors.background.app,
                },
              }}
            >
              {status === 'authenticated' ? (
                <>
                  {requiresFeatureOnboarding ? (
                    <Stack.Screen
                      component={FeatureOnboardingScreen}
                      initialParams={{ mode: 'required' }}
                      name="FeatureOnboarding"
                      options={{ headerShown: false }}
                    />
                  ) : null}
                  <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
                  {!requiresFeatureOnboarding ? (
                    <Stack.Screen
                      component={FeatureOnboardingScreen}
                      name="FeatureOnboarding"
                      options={{ headerShown: false }}
                    />
                  ) : null}
                  <Stack.Screen
                    component={VisitShareCustomizationScreen}
                    name="VisitShareCustomization"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={AddVisitScreen} name="AddVisit" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={canAccessFoodDiscovery ? RestaurantDiscoveryScreen : BetaFeatureRouteGuard}
                    name="RestaurantDiscovery"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={canAccessFoodDiscovery ? RestaurantDiscoveryRestaurantScreen : BetaFeatureRouteGuard}
                    name="RestaurantDiscoveryRestaurant"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={AddFeatureOnboardingScreen}
                    name="AddFeatureOnboarding"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={CreateVisitScreen}
                    name="CreateVisit"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={CreateVisitAddRestaurantScreen}
                    name="CreateVisitAddRestaurant"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={CreateVisitAddMenuItemScreen}
                    name="CreateVisitAddMenuItem"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={CreateVisitEditMenuItemScreen}
                    name="CreateVisitEditMenuItem"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={EditVisitScreen} name="EditVisit" options={{ headerShown: false }} />
                  <Stack.Screen component={FoodProductScreen} name="FoodProduct" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={EditFoodProductScreen}
                    name="EditFoodProduct"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={PhotoProcessingScreen}
                    name="ProcessPhotos"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={ListsScreen} name="Lists" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={CreateRestaurantListScreen}
                    name="CreateRestaurantList"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={ListDetailScreen} name="ListDetail" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={EditRestaurantListScreen}
                    name="EditRestaurantList"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={AddRestaurantToListScreen}
                    name="AddRestaurantToList"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={NotesScreen} name="Notes" options={{ headerShown: false }} />
                  <Stack.Screen component={NoteEditorScreen} name="NoteEditor" options={{ headerShown: false }} />
                  <Stack.Screen component={FriendsScreen} name="Friends" options={{ headerShown: false }} />
                  <Stack.Screen component={AddFriendScreen} name="AddFriend" options={{ headerShown: false }} />
                  <Stack.Screen component={ProfileScreen} name="Profile" options={{ headerShown: false }} />
                  <Stack.Screen component={AboutScreen} name="About" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={TermsOfServiceScreen}
                    name="TermsOfService"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={PrivacyPolicyScreen}
                    name="PrivacyPolicy"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={QRScannerScreen} name="QRScanner" options={{ headerShown: false }} />
                  <Stack.Screen component={SettingsScreen} name="Settings" options={{ headerShown: false }} />
                  <Stack.Screen component={FeedbackScreen} name="Feedback" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={CreateFeedbackScreen}
                    name="CreateFeedback"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={FeedbackDetailScreen}
                    name="FeedbackDetail"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={TutorialsScreen} name="Tutorials" options={{ headerShown: false }} />
                  <Stack.Screen component={MiscScreen} name="Misc" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={MoreFeatureOnboardingScreen}
                    name="MoreFeatureOnboarding"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={user?.isAdmin ? TastingSessionsScreen : AdminOnlyRouteGuard}
                    name="TastingSessions"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={user?.isAdmin ? TastingSessionDetailScreen : AdminOnlyRouteGuard}
                    name="TastingSessionDetail"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen component={BillsScreen} name="Bills" options={{ headerShown: false }} />
                  <Stack.Screen component={CreateBillScreen} name="CreateBill" options={{ headerShown: false }} />
                  <Stack.Screen component={BillDetailScreen} name="BillDetail" options={{ headerShown: false }} />
                  <Stack.Screen component={TipCalculatorScreen} name="TipCalculator" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={VerifyEmailScreen}
                    name="VerifyEmail"
                    options={{ headerShown: false }}
                  />
                </>
              ) : status === 'verification_required' ? (
                <>
                  <Stack.Screen
                    component={VerifyEmailScreen}
                    initialParams={{ source: 'expired_entry' }}
                    name="VerifyEmail"
                    options={{ headerShown: false }}
                  />
                </>
              ) : (
                <>
                  <Stack.Screen component={OnboardingScreen} name="Onboarding" options={{ headerShown: false }} />
                  <Stack.Screen component={LoginScreen} name="Login" options={{ headerShown: false }} />
                  <Stack.Screen component={SignUpScreen} name="SignUp" options={{ headerShown: false }} />
                  <Stack.Screen
                    component={WaitlistConfirmationScreen}
                    name="WaitlistConfirmation"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={ForgotPasswordScreen}
                    name="ForgotPassword"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={ResetPasswordScreen}
                    name="ResetPassword"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    component={VerifyEmailScreen}
                    name="VerifyEmail"
                    options={{ headerShown: false }}
                  />
                </>
              )}
            </Stack.Navigator>
          </View>
          {hasBottomTabsRoute ? (
            <BottomTabNavigation
              bottomPadding={bottomPadding}
              currentRouteName={currentRouteName}
              currentRouteParams={currentRouteParams}
              onNavigate={handleTabPress}
            />
          ) : null}
        </View>
      </LayoutChromeProvider>
    </NavigationContainer>
  );
}
