import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  LoadingState,
  PageErrorToast,
  RatingPill,
  SegmentedControl,
  type SegmentedControlOption,
  VisitRestaurantOptionTrailing,
} from '../components/shared';
import { type AllLocationsHistoryRecord } from '../features';
import { useFoodDiscoveryRestaurantDetailReadModel } from '../features/store/useFoodDiscoveryMapReadModel';
import { buildVisitRestaurantDescription } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';

type RestaurantDiscoveryRestaurantScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RestaurantDiscoveryRestaurant'
>;
type RestaurantDetailScope = 'location' | 'allLocations';

const RESTAURANT_DETAIL_SCOPE_OPTIONS: readonly SegmentedControlOption<RestaurantDetailScope>[] = [
  { label: 'This Location', value: 'location' },
  { label: 'All Locations', value: 'allLocations' },
];

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  iconTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemDescription: {
    gap: theme.spacing.xxs,
  },
  itemMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
}));

function buildRestaurantFromRoute(
  params: RootStackParamList['RestaurantDiscoveryRestaurant'],
) {
  return {
    city: params.city,
    cuisineType: params.cuisineType,
    friendCount: params.friendCount,
    hasPendingMenuReview: params.hasPendingMenuReview,
    id: params.restaurantId,
    isGooglePlace: params.isGooglePlace,
    latitude: params.latitude,
    location: params.location,
    longitude: params.longitude,
    name: params.restaurantName,
    placeId: params.placeId,
    userVisitCount: params.userVisitCount,
    visibility: params.visibility,
  };
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function buildLatestLocationLabel(item: AllLocationsHistoryRecord['items'][number]) {
  const parts = [item.latestRestaurantName, item.latestRestaurantLocation].filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  return `Latest at ${parts.join(' • ')}`;
}

export function RestaurantDiscoveryRestaurantScreen({
  navigation,
  route,
}: RestaurantDiscoveryRestaurantScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { isOnline } = useConnectivity();
  const restaurant = useMemo(() => buildRestaurantFromRoute(route.params), [route.params]);
  const [detailScope, setDetailScope] = useState<RestaurantDetailScope>('location');
  const restaurantDescription = useMemo(() => {
    const parts = [buildVisitRestaurantDescription(restaurant, null)];
    if (restaurant.userVisitCount && restaurant.userVisitCount > 0) {
      parts.push(`You: ${restaurant.userVisitCount} ${restaurant.userVisitCount === 1 ? 'visit' : 'visits'}`);
    }
    if (restaurant.friendCount && restaurant.friendCount > 0) {
      parts.push(`Friends: ${restaurant.friendCount} ${restaurant.friendCount === 1 ? 'friend' : 'friends'}`);
    }
    if (restaurant.isGooglePlace) {
      parts.push('Google place');
    } else if (restaurant.visibility) {
      parts.push(restaurant.visibility);
    }
    return parts.filter(Boolean).join(' • ');
  }, [restaurant]);

  const restaurantDetail = useFoodDiscoveryRestaurantDetailReadModel({
    isOnline,
    restaurant,
  });

  const allLocationsHistory = restaurantDetail.allLocationsHistory;

  return (
    <FeatureDetailScreenScaffold
      onBackPress={() => {
        navigation.goBack();
      }}
      subtitle={restaurantDescription}
      title={restaurant.name}
      rightAccessory={<VisitRestaurantOptionTrailing restaurant={restaurant} selected={false} />}
      testID="restaurant-discovery-restaurant-screen"
    >
      <Card style={styles.card}>
        <View style={styles.iconTitle}>
          <Ionicons color={theme.colors.text.brand} name="flash-outline" size={18} />
          <Text variant="label">Actions</Text>
        </View>
        <Button
          disabled={!isOnline}
          label="Scan Menu Items"
          onPress={() => {
            navigation.navigate('ProcessPhotos', {
              autoStartSourcePicker: false,
              mode: 'menu_scan',
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              returnTo: 'RestaurantDiscoveryRestaurant',
              returnToRestaurantDiscoveryRestaurantParams: route.params,
            });
          }}
        />
        {!isOnline ? <Text tone="warning">Menu scanning requires internet connection.</Text> : null}
        <Button
          label="Track Visit With This Restaurant"
          onPress={() => {
            navigation.navigate('CreateVisit', {
              preselectedRestaurantId: restaurant.id,
              preselectedRestaurantName: restaurant.name,
            });
          }}
          variant="secondary"
        />
      </Card>

      {restaurantDetail.canShowAllLocations ? (
        <SegmentedControl
          onChange={setDetailScope}
          options={RESTAURANT_DETAIL_SCOPE_OPTIONS}
          value={detailScope}
        />
      ) : null}

      {detailScope === 'allLocations' && restaurantDetail.canShowAllLocations ? (
        <Card style={styles.card}>
          <Text variant="label">Ordered Across Locations</Text>
          {allLocationsHistory ? (
            <View style={styles.summaryRow}>
              <Text tone="secondary">{formatCount(allLocationsHistory.visitCount, 'ordered visit')}</Text>
              <Text tone="secondary">{formatCount(allLocationsHistory.locationCount, 'location')}</Text>
              <Text tone="secondary">{formatCount(allLocationsHistory.itemCount, 'item')}</Text>
            </View>
          ) : null}
          {restaurantDetail.allLocationsHistoryLoading ? (
            <LoadingState label="Loading orders..." />
          ) : restaurantDetail.allLocationsHistoryErrorMessage ? (
            <PageErrorToast
              actionLabel="Retry"
              errorMessage="Could not load orders across locations."
              onAction={() => {
                void restaurantDetail.refetchAllLocationsHistory();
              }}
              title="Orders unavailable"
            />
          ) : allLocationsHistory && allLocationsHistory.items.length > 0 ? (
            allLocationsHistory.items.map((item) => {
              const latestLocationLabel = buildLatestLocationLabel(item);

              return (
                <ListItem
                  description={
                    <View style={styles.itemDescription}>
                      <View style={styles.itemMetaRow}>
                        <Text tone="secondary">{formatCount(item.orderCount, 'order')}</Text>
                        {item.latestRating > 0 ? (
                          <RatingPill rating={item.latestRating} />
                        ) : (
                          <Text tone="secondary">unrated</Text>
                        )}
                      </View>
                      {latestLocationLabel ? (
                        <Text numberOfLines={1} tone="secondary" variant="bodySm">
                          {latestLocationLabel}
                        </Text>
                      ) : null}
                    </View>
                  }
                  key={item.normalizedItemName}
                  title={item.displayName}
                />
              );
            })
          ) : (
            <EmptyState
              description="Track a visit at this restaurant name to build your history."
              title="No orders across locations yet"
            />
          )}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text variant="label">Saved Menu Items</Text>
          {restaurantDetail.menuCatalogLoading ? (
            <LoadingState label="Loading menu items..." />
          ) : restaurantDetail.menuCatalogErrorMessage ? (
            <PageErrorToast
              actionLabel="Retry"
              errorMessage="Could not load menu items."
              onAction={() => {
                void restaurantDetail.refetchMenuCatalog();
              }}
              title="Menu items unavailable"
            />
          ) : restaurantDetail.menuItems.length > 0 ? (
            restaurantDetail.menuItems.map((item) => (
              <ListItem
                key={item.id}
                title={item.name}
              />
            ))
          ) : (
            <EmptyState
              description="Scan a menu photo to add items for this restaurant."
              title="No menu items yet"
            />
          )}
        </Card>
      )}
    </FeatureDetailScreenScaffold>
  );
}
