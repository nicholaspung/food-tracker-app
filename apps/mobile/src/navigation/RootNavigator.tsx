import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabNavigation, type BottomTabRoute } from '../components/shared/BottomTabNavigation';
import { EmptyState } from '../components/shared';
import { useAuth } from '../providers/AuthProvider';
import { trackObservabilityEvent } from '../observability';
import {
  AdminFeaturesScreen,
  AdminMenuReviewDetailScreen,
  AdminMenuReviewsScreen,
  AddRestaurantToListScreen,
  AddVisitScreen,
  BillDetailScreen,
  BillingScreen,
  BillsScreen,
  CreateBillScreen,
  CreateRestaurantListScreen,
  CreateVisitAddRestaurantScreen,
  CreateVisitAddMenuItemScreen,
  CreateVisitEditMenuItemScreen,
  CreateVisitScreen,
  EditRestaurantListScreen,
  EditQuickTrackScreen,
  EditVisitScreen,
  FeedbackScreen,
  FeedbackDetailScreen,
  ForgotPasswordScreen,
  FriendsScreen,
  HomeScreen,
  ListDetailScreen,
  ListsScreen,
  LoginScreen,
  MiscScreen,
  NoteEditorScreen,
  NotesScreen,
  OnboardingScreen,
  PhotoProcessingScreen,
  ProfileScreen,
  QRScannerScreen,
  QuickTrackScreen,
  ResetPasswordScreen,
  SettingsScreen,
  SignUpScreen,
  SplashScreen,
  TipCalculatorScreen,
  TastingSessionDetailScreen,
  TastingSessionsScreen,
  VisitShareCustomizationScreen,
  VerifyEmailScreen,
  WhatsNewScreen,
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
        inviteCode?: string;
        code?: string;
      }
    | undefined;
  ForgotPassword: undefined;
  ResetPassword:
    | {
        email?: string;
      }
    | undefined;
  VerifyEmail:
    | {
        email?: string;
        password?: string;
        source?: 'sign_up' | 'login';
      }
    | undefined;
  Home: undefined;
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
  CreateVisit:
    | {
        preselectedRestaurantId?: string;
        preselectedRestaurantName?: string;
        preselectedMenuItemId?: string;
        preselectedMenuItemName?: string;
        sourceListItemId?: string;
        returnToStep?: 0 | 1 | 2;
      }
    | undefined;
  CreateVisitAddRestaurant: undefined;
  CreateVisitAddMenuItem: {
    restaurantId: string;
    restaurantName: string;
  };
  CreateVisitEditMenuItem: {
    menuItemId: string;
    restaurantId: string;
    initialName: string;
    initialVisibility?: 'private' | 'friends' | 'public';
  };
  EditVisit: { visitId: string };
  QuickTrack: { sourceNoteId?: string } | undefined;
  EditQuickTrack: { quickTrackId: string };
  ProcessPhotos:
    | {
        mode?: 'menu_scan' | 'general';
        restaurantId?: string;
        restaurantName?: string;
        autoStartSourcePicker?: boolean;
      }
    | undefined;
  Lists: undefined;
  CreateRestaurantList: undefined;
  ListDetail: { listId: string };
  EditRestaurantList: { listId: string };
  AddRestaurantToList: { listId: string };
  Notes: undefined;
  NoteEditor: { noteId?: string } | undefined;
  Friends: undefined;
  Profile: undefined;
  AdminFeatures: undefined;
  AdminMenuReviews: undefined;
  AdminMenuReviewDetail: { requestId: string };
  QRScanner: undefined;
  Settings: undefined;
  Feedback: undefined;
  FeedbackDetail: { feedbackId: string };
  WhatsNew: undefined;
  Misc: undefined;
  TastingSessions: undefined;
  TastingSessionDetail: { sessionId: string };
  Bills: undefined;
  Billing: undefined;
  CreateBill: { billId?: string } | undefined;
  BillDetail: { billId: string };
  TipCalculator: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const TAB_BAR_BASE_HEIGHT = 56;
const AUTH_LINKING: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'yummyrecs://',
    'https://yummyrecs.com',
    'https://www.yummyrecs.com',
    'https://beta.yummyrecs.com',
  ],
  config: {
    screens: {
      Onboarding: '',
      Login: 'login',
      SignUp: 'signup',
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
  'AddVisit',
  'CreateVisit',
  'CreateVisitAddRestaurant',
  'CreateVisitAddMenuItem',
  'CreateVisitEditMenuItem',
  'EditVisit',
  'QuickTrack',
  'EditQuickTrack',
  'ProcessPhotos',
  'Friends',
  'QRScanner',
  'Profile',
  'AdminFeatures',
  'AdminMenuReviews',
  'AdminMenuReviewDetail',
  'Settings',
  'Feedback',
  'FeedbackDetail',
  'WhatsNew',
  'Misc',
  'Lists',
  'CreateRestaurantList',
  'ListDetail',
  'EditRestaurantList',
  'AddRestaurantToList',
  'Notes',
  'NoteEditor',
  'Bills',
  'Billing',
  'CreateBill',
  'BillDetail',
  'TipCalculator',
  'TastingSessions',
  'TastingSessionDetail',
];

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

export function RootNavigator() {
  const { actualUser, status, user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootStackParamList>();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const previousRouteNameRef = useRef<keyof RootStackParamList | null>(null);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (status === 'bootstrapping') {
    return <SplashScreen />;
  }

  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: theme.colors.text.brand,
      background: theme.colors.background.app,
      card: theme.colors.background.surface,
      text: theme.colors.text.primary,
      border: theme.colors.border.default,
    },
  };

  const updateCurrentRoute = () => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    const typedRouteName = routeName as keyof RootStackParamList | undefined;
    setCurrentRouteName(typedRouteName);

    if (!typedRouteName || previousRouteNameRef.current === typedRouteName) {
      return;
    }

    trackObservabilityEvent('SCREEN_VIEW', {
      screenName: typedRouteName,
      previousScreenName: previousRouteNameRef.current,
    });
    previousRouteNameRef.current = typedRouteName;
  };

  const showBottomTabs =
    status === 'authenticated' &&
    !!currentRouteName &&
    ROUTES_WITH_TABS.includes(currentRouteName) &&
    !isKeyboardVisible;

  const bottomPadding = Math.max(6, Math.min(insets.bottom, 10));
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + bottomPadding;

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

  return (
    <NavigationContainer
      linking={AUTH_LINKING}
      onReady={updateCurrentRoute}
      onStateChange={updateCurrentRoute}
      ref={navigationRef}
      theme={navigationTheme}
    >
      <View style={styles.container}>
        <View style={[styles.navigatorBody, showBottomTabs ? { paddingBottom: tabBarHeight } : null]}>
          <Stack.Navigator
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
                <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
                <Stack.Screen
                  component={VisitShareCustomizationScreen}
                  name="VisitShareCustomization"
                  options={{ headerShown: false }}
                />
                <Stack.Screen component={AddVisitScreen} name="AddVisit" options={{ headerShown: false }} />
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
                <Stack.Screen component={EditVisitScreen} name="EditVisit" options={{ title: 'Edit Visit' }} />
                <Stack.Screen component={QuickTrackScreen} name="QuickTrack" options={{ headerShown: false }} />
                <Stack.Screen
                  component={EditQuickTrackScreen}
                  name="EditQuickTrack"
                  options={{ title: 'Edit Quick Track' }}
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
                <Stack.Screen component={ProfileScreen} name="Profile" options={{ headerShown: false }} />
                <Stack.Screen
                  component={actualUser?.isAdmin ? AdminFeaturesScreen : AdminOnlyRouteGuard}
                  name="AdminFeatures"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  component={user?.isAdmin ? AdminMenuReviewsScreen : AdminOnlyRouteGuard}
                  name="AdminMenuReviews"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  component={user?.isAdmin ? AdminMenuReviewDetailScreen : AdminOnlyRouteGuard}
                  name="AdminMenuReviewDetail"
                  options={{ headerShown: false }}
                />
                <Stack.Screen component={QRScannerScreen} name="QRScanner" options={{ headerShown: false }} />
                <Stack.Screen component={SettingsScreen} name="Settings" options={{ headerShown: false }} />
                <Stack.Screen component={FeedbackScreen} name="Feedback" options={{ headerShown: false }} />
                <Stack.Screen
                  component={FeedbackDetailScreen}
                  name="FeedbackDetail"
                  options={{ headerShown: false }}
                />
                <Stack.Screen component={WhatsNewScreen} name="WhatsNew" options={{ headerShown: false }} />
                <Stack.Screen component={MiscScreen} name="Misc" options={{ headerShown: false }} />
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
                <Stack.Screen component={BillingScreen} name="Billing" options={{ headerShown: false }} />
                <Stack.Screen component={CreateBillScreen} name="CreateBill" options={{ headerShown: false }} />
                <Stack.Screen component={BillDetailScreen} name="BillDetail" options={{ headerShown: false }} />
                <Stack.Screen component={TipCalculatorScreen} name="TipCalculator" options={{ headerShown: false }} />
              </>
            ) : (
              <>
                <Stack.Screen component={OnboardingScreen} name="Onboarding" options={{ headerShown: false }} />
                <Stack.Screen component={LoginScreen} name="Login" options={{ headerShown: false }} />
                <Stack.Screen component={SignUpScreen} name="SignUp" options={{ headerShown: false }} />
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
        {showBottomTabs ? (
          <BottomTabNavigation
            bottomPadding={bottomPadding}
            currentRouteName={currentRouteName}
            onNavigate={handleTabPress}
          />
        ) : null}
      </View>
    </NavigationContainer>
  );
}
