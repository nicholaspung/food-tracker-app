import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { listFriends } from '../../features';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useTheme } from '../../theme';
import { Text } from '../../ui';

export type BottomTabRoute = 'Home' | 'AddVisit' | 'Friends' | 'Misc' | 'Profile';

interface BottomTabNavigationProps {
  currentRouteName?: keyof RootStackParamList;
  bottomPadding: number;
  onNavigate: (route: BottomTabRoute) => void;
}

export const TAB_ACTIVE_ROUTES: Record<BottomTabRoute, (keyof RootStackParamList)[]> = {
  Home: ['Home'],
  AddVisit: [
    'AddVisit',
    'CreateVisit',
    'CreateVisitAddRestaurant',
    'CreateVisitAddMenuItem',
    'CreateVisitEditMenuItem',
    'EditVisit',
    'QuickTrack',
    'EditQuickTrack',
    'ProcessPhotos',
  ],
  Friends: ['Friends', 'QRScanner'],
  Misc: [
    'Misc',
    'Lists',
    'ListDetail',
    'AddRestaurantToList',
    'Notes',
    'NoteEditor',
    'Settings',
    'Bills',
    'BillDetail',
    'TastingSessions',
    'TastingSessionDetail',
  ],
  Profile: ['Profile', 'AdminFeatures', 'AdminMenuReviews', 'AdminMenuReviewDetail', 'WhatsNew'],
};

export const BOTTOM_TAB_ROUTES: BottomTabRoute[] = ['Home', 'AddVisit', 'Friends', 'Misc', 'Profile'];

export function getBottomTabRouteForScreen(
  routeName?: keyof RootStackParamList,
): BottomTabRoute | undefined {
  if (!routeName) {
    return undefined;
  }

  return BOTTOM_TAB_ROUTES.find((tabRoute) => TAB_ACTIVE_ROUTES[tabRoute].includes(routeName));
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

export function BottomTabNavigation({
  currentRouteName,
  bottomPadding,
  onNavigate,
}: BottomTabNavigationProps) {
  const theme = useTheme();
  const { data: friends = [] } = useQuery({
    queryKey: ['feature', 'friends'],
    queryFn: listFriends,
    refetchInterval: 30000,
  });

  const pendingInvitesCount = useMemo(
    () => friends.filter((friend) => friend.status === 'pending_received').length,
    [friends],
  );

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.background.surface,
      borderTopColor: theme.colors.border.subtle,
      borderTopWidth: 1,
      bottom: 0,
      elevation: 10,
      left: 0,
      position: 'absolute',
      right: 0,
      shadowColor: theme.colors.background.inverse,
      shadowOffset: {
        width: 0,
        height: -2,
      },
      shadowOpacity: 0.08,
      shadowRadius: 4,
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
    tabLabel: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    tabLabelActive: {
      color: theme.colors.text.brand,
    },
    badge: {
      alignItems: 'center',
      backgroundColor: theme.colors.text.danger,
      borderRadius: theme.radii.pill,
      height: 18,
      justifyContent: 'center',
      minWidth: 18,
      paddingHorizontal: 4,
      position: 'absolute',
      right: -8,
      top: -4,
    },
    badgeLabel: {
      color: theme.colors.text.inverse,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
    },
    iconWrap: {
      position: 'relative',
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {TABS.map((tab) => {
          const isActive = !!currentRouteName && TAB_ACTIVE_ROUTES[tab.route].includes(currentRouteName);
          const showBadge = tab.route === 'Friends' && pendingInvitesCount > 0;

          return (
            <Pressable
              accessibilityRole="button"
              key={tab.route}
              onPress={() => {
                onNavigate(tab.route);
              }}
              style={styles.tab}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  color={isActive ? theme.colors.text.brand : theme.colors.text.muted}
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={22}
                />
                {showBadge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeLabel}>
                      {pendingInvitesCount > 9 ? '9+' : pendingInvitesCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
