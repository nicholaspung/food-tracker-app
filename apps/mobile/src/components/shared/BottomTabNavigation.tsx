import { Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '../../ui/AppIcon';

import { friendsQueryKeys, getCachedFriendsSummary, getFriendsCountSummary } from '../../features';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../../theme';
import { createPlatformShadow } from '../../theme/shadows';
import { Text } from '../../ui';

export type BottomTabRoute = 'Home' | 'AddVisit' | 'Friends' | 'Misc' | 'Profile';

interface BottomTabNavigationProps {
  currentRouteName?: keyof RootStackParamList;
  currentRouteParams?: RootStackParamList[keyof RootStackParamList];
  bottomPadding: number;
  onNavigate: (route: BottomTabRoute) => void;
}

const TAB_ACTIVE_ROUTES: Record<BottomTabRoute, (keyof RootStackParamList)[]> = {
  Home: ['Home'],
  AddVisit: [
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
    'Notes',
    'NoteEditor',
  ],
  Friends: ['Friends', 'AddFriend', 'QRScanner'],
  Misc: [
    'Misc',
    'MoreFeatureOnboarding',
    'Lists',
    'CreateRestaurantList',
    'ListDetail',
    'EditRestaurantList',
    'AddRestaurantToList',
    'Bills',
    'BillDetail',
    'TipCalculator',
    'TastingSessions',
    'TastingSessionDetail',
    'CreateTastingSession',
    'JoinTastingSession',
    'TastingSessionLobby',
    'TastingSessionPlanning',
    'TastingSessionTasting',
    'TastingSessionResults',
  ],
  Profile: [
    'Profile',
    'Settings',
    'Feedback',
    'FeedbackDetail',
    'Tutorials',
  ],
};

const BOTTOM_TAB_ROUTES: BottomTabRoute[] = ['Home', 'AddVisit', 'Friends', 'Misc', 'Profile'];

const useStyles = createThemedStyles((theme, bottomPadding: number) => ({
  container: {
    backgroundColor: theme.colors.background.surface,
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    ...createPlatformShadow({
      color: theme.colors.background.inverse,
      elevation: 10,
      offset: { width: 0, height: -2 },
      opacity: 0.08,
      radius: 4,
    }),
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 56 + bottomPadding,
    paddingBottom: bottomPadding,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: theme.spacing.xs,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.fill.danger,
    borderRadius: theme.radii.pill,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -8,
    top: -4,
  },
  iconWrap: {
    position: 'relative',
  },
}));

export function getBottomTabRouteForScreen(
  routeName?: keyof RootStackParamList,
  routeParams?: RootStackParamList[keyof RootStackParamList],
): BottomTabRoute | undefined {
  if (!routeName) {
    return undefined;
  }

  if (isProfileTutorialRoute(routeName, routeParams)) {
    return 'Profile';
  }

  return BOTTOM_TAB_ROUTES.find((tabRoute) => TAB_ACTIVE_ROUTES[tabRoute].includes(routeName));
}

function isProfileTutorialRoute(
  routeName: keyof RootStackParamList,
  routeParams?: RootStackParamList[keyof RootStackParamList],
): boolean {
  if (routeName === 'Tutorials') {
    return true;
  }

  if (!routeParams || typeof routeParams !== 'object') {
    return false;
  }

  const params = routeParams as Record<string, unknown>;

  if (routeName === 'FeatureOnboarding') {
    return params.mode === 'replay' && params.source === 'profile';
  }

  if (routeName === 'AddFeatureOnboarding' || routeName === 'MoreFeatureOnboarding') {
    return params.mode === 'replay' && params.source === 'profile';
  }

  return false;
}

const TABS: {
  route: BottomTabRoute;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  {
    route: 'Home',
    label: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    route: 'AddVisit',
    label: 'Add',
    icon: 'add-outline',
    activeIcon: 'add',
  },
  {
    route: 'Friends',
    label: 'Friends',
    icon: 'people-outline',
    activeIcon: 'people',
  },
  {
    route: 'Misc',
    label: 'More',
    icon: 'ellipsis-horizontal-outline',
    activeIcon: 'ellipsis-horizontal',
  },
  {
    route: 'Profile',
    label: 'Profile',
    icon: 'person-outline',
    activeIcon: 'person',
  },
];

function getFriendsTabAccessibilityLabel(pendingInvitesCount: number): string {
  if (pendingInvitesCount <= 0) {
    return 'Friends';
  }

  if (pendingInvitesCount > 9) {
    return 'Friends, 9 or more pending invites';
  }

  const inviteLabel = pendingInvitesCount === 1 ? 'pending invite' : 'pending invites';

  return `Friends, ${pendingInvitesCount} ${inviteLabel}`;
}

export function BottomTabNavigation({
  currentRouteName,
  currentRouteParams,
  bottomPadding,
  onNavigate,
}: BottomTabNavigationProps) {
  const theme = useTheme();
  const styles = useStyles(bottomPadding);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const cachedFriendsSummary = getCachedFriendsSummary(queryClient, userId);
  const { data: friendsSummary } = useQuery({
    queryKey: friendsQueryKeys.summary(userId),
    queryFn: ({ signal }) => getFriendsCountSummary({ signal }),
    enabled: Boolean(userId),
    initialData: cachedFriendsSummary?.summary,
    initialDataUpdatedAt: cachedFriendsSummary?.updatedAt,
    refetchOnReconnect: 'always',
  });
  const pendingInvitesCount = friendsSummary?.requestsCount ?? 0;
  const activeTabRoute = getBottomTabRouteForScreen(currentRouteName, currentRouteParams);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {TABS.map((tab) => {
          const isActive = activeTabRoute === tab.route;
          const showBadge = tab.route === 'Friends' && pendingInvitesCount > 0;
          const accessibilityLabel =
            tab.route === 'Friends' ? getFriendsTabAccessibilityLabel(pendingInvitesCount) : tab.label;

          return (
            <Pressable
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              key={tab.route}
              onPress={() => {
                onNavigate(tab.route);
              }}
              style={styles.tab}
              testID={`tab-${tab.route}`}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  color={isActive ? theme.colors.text.brand : theme.colors.text.muted}
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={22}
                />
                {showBadge ? (
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.badge}
                  >
                    <Text tone="inverse" variant="captionStrong">
                      {pendingInvitesCount > 9 ? '9+' : pendingInvitesCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text tone={isActive ? 'brand' : 'muted'} variant="bodySmTightSemiBold">
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
