import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabNavigation, type BottomTabRoute } from '../components/shared/BottomTabNavigation';
import { EmptyState } from '../components/shared';
import { useAuth } from '../providers/AuthProvider';
import {
  AdminFeaturesScreen,
  AdminMenuReviewDetailScreen,
  AdminMenuReviewsScreen,
  AddRestaurantToListScreen,
  AddVisitScreen,
  BillDetailScreen,
  BillsScreen,
  EditQuickTrackScreen,
  EditVisitScreen,
  FeedbackScreen,
  FeedbackDetailScreen,
  ForgotPasswordScreen,
  FriendsScreen,
  HomeScreen,
  InviteScreen,
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
  TastingSessionDetailScreen,
  TastingSessionsScreen,
  VerifyEmailScreen,
  WhatsNewScreen,
} from '../screens';
import { useTheme } from '../theme';
import { Screen } from '../ui';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  VerifyEmail: undefined;
  Home: undefined;
  AddVisit: undefined;
  EditVisit: { visitId: string };
  QuickTrack: { sourceNoteId?: string } | undefined;
  EditQuickTrack: { quickTrackId: string };
  ProcessPhotos: undefined;
  Lists: undefined;
  ListDetail: { listId: string };
  AddRestaurantToList: { listId: string };
  Notes: undefined;
  NoteEditor: { noteId?: string } | undefined;
  Friends: undefined;
  Profile: undefined;
  AdminFeatures: undefined;
  AdminMenuReviews: undefined;
  AdminMenuReviewDetail: { requestId: string };
  Invite: undefined;
  QRScanner: undefined;
  Settings: undefined;
  Feedback: undefined;
  FeedbackDetail: { feedbackId: string };
  WhatsNew: undefined;
  Misc: undefined;
  TastingSessions: undefined;
  TastingSessionDetail: { sessionId: string };
  Bills: undefined;
  BillDetail: { billId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const TAB_BAR_BASE_HEIGHT = 56;

const ROUTES_WITH_TABS: (keyof RootStackParamList)[] = [
  'Home',
  'AddVisit',
  'EditVisit',
  'QuickTrack',
  'EditQuickTrack',
  'ProcessPhotos',
  'Friends',
  'Invite',
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
  'ListDetail',
  'AddRestaurantToList',
  'Notes',
  'NoteEditor',
  'Bills',
  'BillDetail',
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
  const { status, user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootStackParamList>();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

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
    setCurrentRouteName(routeName as keyof RootStackParamList | undefined);
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

    navigationRef.navigate(route);
  };

  return (
    <NavigationContainer
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
                <Stack.Screen component={AddVisitScreen} name="AddVisit" options={{ title: 'Add Visit' }} />
                <Stack.Screen component={EditVisitScreen} name="EditVisit" options={{ title: 'Edit Visit' }} />
                <Stack.Screen component={QuickTrackScreen} name="QuickTrack" options={{ title: 'Quick Track' }} />
                <Stack.Screen
                  component={EditQuickTrackScreen}
                  name="EditQuickTrack"
                  options={{ title: 'Edit Quick Track' }}
                />
                <Stack.Screen
                  component={PhotoProcessingScreen}
                  name="ProcessPhotos"
                  options={{ title: 'Process Photos' }}
                />
                <Stack.Screen component={ListsScreen} name="Lists" options={{ title: 'Lists' }} />
                <Stack.Screen component={ListDetailScreen} name="ListDetail" options={{ title: 'List Detail' }} />
                <Stack.Screen
                  component={AddRestaurantToListScreen}
                  name="AddRestaurantToList"
                  options={{ title: 'Add to List' }}
                />
                <Stack.Screen component={NotesScreen} name="Notes" options={{ title: 'Notes' }} />
                <Stack.Screen component={NoteEditorScreen} name="NoteEditor" options={{ title: 'Note Editor' }} />
                <Stack.Screen component={FriendsScreen} name="Friends" options={{ headerShown: false }} />
                <Stack.Screen component={ProfileScreen} name="Profile" options={{ headerShown: false }} />
                <Stack.Screen
                  component={user?.isAdmin ? AdminFeaturesScreen : AdminOnlyRouteGuard}
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
                <Stack.Screen component={InviteScreen} name="Invite" options={{ title: 'Invite' }} />
                <Stack.Screen component={QRScannerScreen} name="QRScanner" options={{ title: 'QR Scanner' }} />
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
                  options={{ title: 'Session Detail' }}
                />
                <Stack.Screen component={BillsScreen} name="Bills" options={{ title: 'Bills' }} />
                <Stack.Screen component={BillDetailScreen} name="BillDetail" options={{ title: 'Bill Detail' }} />
              </>
            ) : (
              <>
                <Stack.Screen component={OnboardingScreen} name="Onboarding" options={{ title: 'Welcome' }} />
                <Stack.Screen component={LoginScreen} name="Login" options={{ title: 'Sign In' }} />
                <Stack.Screen component={SignUpScreen} name="SignUp" options={{ title: 'Sign Up' }} />
                <Stack.Screen
                  component={ForgotPasswordScreen}
                  name="ForgotPassword"
                  options={{ title: 'Forgot Password' }}
                />
                <Stack.Screen
                  component={ResetPasswordScreen}
                  name="ResetPassword"
                  options={{ title: 'Reset Password' }}
                />
                <Stack.Screen
                  component={VerifyEmailScreen}
                  name="VerifyEmail"
                  options={{ title: 'Verify Email' }}
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
