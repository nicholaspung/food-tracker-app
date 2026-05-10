import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  LoadingState,
  PageErrorToast,
  PhotoSourceActionCards,
  VisitRestaurantOptionTrailing,
} from '../components/shared';
import { type MenuItemRecord, useMenuScanFlow } from '../features';
import { menuItemsQueryKeys } from '../features/store/menuItemsQuery';
import { listMenuItemsForRestaurant } from '../features/store/restaurantsStore';
import { buildVisitRestaurantDescription } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';

type RestaurantDiscoveryRestaurantScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RestaurantDiscoveryRestaurant'
>;

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  iconTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  warningPanel: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.status.warningBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  successPanel: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
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

export function RestaurantDiscoveryRestaurantScreen({
  navigation,
  route,
}: RestaurantDiscoveryRestaurantScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const restaurant = useMemo(() => buildRestaurantFromRoute(route.params), [route.params]);
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
  const [showPhotoSources, setShowPhotoSources] = useState(false);
  const menuScanFlow = useMenuScanFlow({
    analyticsSource: 'FoodDiscoveryRestaurant',
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    onSuccess: () => {
      setShowPhotoSources(false);
    },
  });

  const menuItemsQuery = useQuery({
    queryKey: menuItemsQueryKeys.restaurant(restaurant.id),
    queryFn: ({ signal }) => {
      if (!isOnline) {
        return Promise.resolve(
          queryClient.getQueryData<MenuItemRecord[]>(menuItemsQueryKeys.restaurant(restaurant.id)) ?? [],
        );
      }

      return listMenuItemsForRestaurant(restaurant.id, { signal });
    },
    enabled: Boolean(restaurant.id),
  });

  const verificationNeedsAttention =
    menuScanFlow.verification?.matched === false ||
    (menuScanFlow.verification?.checked === true &&
      (menuScanFlow.verification.matched === null ||
        menuScanFlow.verification.confidence === 'low' ||
        menuScanFlow.verification.confidence === 'unknown'));

  const isMenuScanProcessing =
    menuScanFlow.status === 'selecting' || menuScanFlow.status === 'processing';

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
          <Ionicons color={theme.colors.text.brand} name="document-text-outline" size={18} />
          <Text variant="label">Menu Items</Text>
        </View>
        <Button
          disabled={!isOnline || isMenuScanProcessing}
          label="Scan Menu Items"
          loading={isMenuScanProcessing}
          onPress={() => {
            setShowPhotoSources((visible) => !visible);
          }}
        />
        {!isOnline ? <Text tone="warning">Menu scanning requires internet connection.</Text> : null}
        {showPhotoSources ? (
          <PhotoSourceActionCards
            cameraSubtitle="Menu"
            cameraTitle="Take Photo"
            disabled={!isOnline || isMenuScanProcessing}
            gallerySubtitle="Photo Library"
            galleryTitle="Upload"
            onCameraPress={() => {
              void menuScanFlow.scanMenu('camera');
            }}
            onGalleryPress={() => {
              void menuScanFlow.scanMenu('gallery');
            }}
          />
        ) : null}
        {menuScanFlow.permissionNeedsSettings ? (
          <Button
            label="Open Settings"
            onPress={() => {
              void Linking.openSettings();
            }}
            variant="secondary"
          />
        ) : null}
        <PageErrorToast
          errorMessage={menuScanFlow.status === 'error' ? menuScanFlow.errorMessage : null}
          title="Menu scan failed"
        />

        {verificationNeedsAttention ? (
          <View style={styles.warningPanel}>
            <Text tone="warning" variant="label">Check the restaurant match</Text>
            <Text tone="secondary">
              {menuScanFlow.verification?.reason ?? 'The menu photo did not clearly match the selected restaurant.'}
            </Text>
            {menuScanFlow.verification?.observedRestaurantNames.length ? (
              <Text tone="secondary">
                Seen: {menuScanFlow.verification.observedRestaurantNames.join(', ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {menuScanFlow.status === 'success' ? (
          <View style={styles.successPanel}>
            <Text tone="success" variant="label">Menu items processed</Text>
            {menuScanFlow.createdItemNames.length > 0 ? (
              <>
                <Text tone="secondary">Added items:</Text>
                {menuScanFlow.createdItemNames.map((itemName) => (
                  <View key={itemName} style={styles.itemRow}>
                    <Ionicons color={theme.colors.text.success} name="checkmark-outline" size={14} />
                    <Text>{itemName}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {menuScanFlow.existingItemNames.length > 0 ? (
              <>
                <Text tone="secondary">
                  {menuScanFlow.createdItemNames.length > 0 ? 'Already on this menu:' : 'Matched items:'}
                </Text>
                {menuScanFlow.existingItemNames.map((itemName) => (
                  <View key={itemName} style={styles.itemRow}>
                    <Ionicons color={theme.colors.text.info} name="checkmark-done-outline" size={14} />
                    <Text>{itemName}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text variant="label">Saved Menu Items</Text>
        {menuItemsQuery.isLoading ? (
          <LoadingState label="Loading menu items..." />
        ) : menuItemsQuery.isError ? (
          <PageErrorToast
            actionLabel="Retry"
            errorMessage="Could not load menu items."
            onAction={() => {
              void menuItemsQuery.refetch();
            }}
            title="Menu items unavailable"
          />
        ) : menuItemsQuery.data && menuItemsQuery.data.length > 0 ? (
          menuItemsQuery.data.map((item) => (
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
    </FeatureDetailScreenScaffold>
  );
}
