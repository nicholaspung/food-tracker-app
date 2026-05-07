import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
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
import {
  createMenuItemsFromScan,
  formatLimitExceededMessage,
  parseLimitExceededError,
  parseMenuImage,
  type MenuItemRecord,
} from '../features';
import { menuItemsQueryKeys } from '../features/store/menuItemsQuery';
import { listMenuItemsForRestaurant } from '../features/store/restaurantsStore';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import type { PhotoPickerPermissionSource } from '../hooks/usePhotoPickerPermissions';
import { buildVisitRestaurantDescription } from '../lib/visitRestaurantSearch';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';
import { parseMenuItemNamesFromCsv } from './photoProcessing/shared';

type RestaurantDiscoveryRestaurantScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RestaurantDiscoveryRestaurant'
>;
type ImageSource = PhotoPickerPermissionSource;
type MenuScanPhase = 'idle' | 'processing' | 'success' | 'error';

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
  const [menuScanPhase, setMenuScanPhase] = useState<MenuScanPhase>('idle');
  const [menuScanErrorMessage, setMenuScanErrorMessage] = useState<string | null>(null);
  const [createdItemNames, setCreatedItemNames] = useState<string[]>([]);
  const [existingItemNames, setExistingItemNames] = useState<string[]>([]);
  const [menuVerification, setMenuVerification] =
    useState<Awaited<ReturnType<typeof parseMenuImage>>['verification'] | null>(null);

  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload an image.',
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

  const pickAndStageImage = useCallback(
    async (source: ImageSource) => {
      const result = await pickImageAssets({ source });
      if (result.status === 'permission_denied') {
        throw new Error(result.message);
      }

      if (result.status === 'canceled') {
        return null;
      }

      const imageInput = await stageLocalPhotoFile(result.assets[0], {
        fallbackPrefix: source === 'camera' ? 'menu-camera' : 'menu-image',
      });
      if (!imageInput) {
        throw new Error('Could not prepare the selected image.');
      }

      return imageInput;
    },
    [pickImageAssets],
  );

  const scanMenu = useCallback(
    async (source: ImageSource) => {
      if (!isOnline) {
        setMenuScanErrorMessage('Menu scanning requires internet connection.');
        return;
      }

      setMenuScanPhase('processing');
      setMenuScanErrorMessage(null);
      setCreatedItemNames([]);
      setExistingItemNames([]);
      setMenuVerification(null);

      let imageInput: Awaited<ReturnType<typeof stageLocalPhotoFile>> | null = null;
      try {
        imageInput = await pickAndStageImage(source);
        if (!imageInput) {
          setMenuScanPhase('idle');
          return;
        }

        const parseResult = await parseMenuImage({
          ...imageInput,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
        });
        const itemNames = parseMenuItemNamesFromCsv(parseResult.csv);
        const result = await createMenuItemsFromScan({
          restaurantId: restaurant.id,
          itemNames,
          fallbackLabel: imageInput.name,
        });
        const returnedRecords = [...result.createdItems, ...result.existingItems];

        queryClient.setQueryData(
          menuItemsQueryKeys.restaurant(restaurant.id),
          (currentItems: MenuItemRecord[] | undefined) => {
            const nextItems = [...(currentItems ?? [])];
            for (const record of returnedRecords) {
              if (!nextItems.some((item) => item.id === record.id)) {
                nextItems.unshift(record);
              }
            }
            return nextItems;
          },
        );
        await queryClient.invalidateQueries({
          queryKey: menuItemsQueryKeys.restaurant(restaurant.id),
        });

        setMenuVerification(parseResult.verification ?? null);
        setCreatedItemNames(result.createdItems.map((item) => item.name));
        setExistingItemNames(result.existingItems.map((item) => item.name));
        setMenuScanPhase('success');
        setShowPhotoSources(false);
        trackObservabilityEvent('FOOD_DISCOVERY_MENU_SCAN_SUCCEEDED', {
          source: 'RestaurantDiscoveryRestaurantScreen',
          restaurantId: restaurant.id,
          createdCount: result.createdItems.length,
          existingCount: result.existingItems.length,
          verificationMatched: parseResult.verification?.matched ?? null,
        });
      } catch (error) {
        const limitPayload = parseLimitExceededError(error);
        const message = limitPayload
          ? formatLimitExceededMessage(limitPayload)
          : error instanceof Error
            ? error.message
            : 'Could not scan this menu.';
        setMenuScanErrorMessage(message);
        setMenuScanPhase('error');
      } finally {
        if (imageInput) {
          await cleanupStagedPhotoFiles([imageInput]);
        }
        void queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] });
      }
    },
    [isOnline, pickAndStageImage, queryClient, restaurant.id, restaurant.name],
  );

  const verificationNeedsAttention =
    menuVerification?.matched === false ||
    (menuVerification?.checked === true &&
      (menuVerification.matched === null ||
        menuVerification.confidence === 'low' ||
        menuVerification.confidence === 'unknown'));

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
          disabled={!isOnline || menuScanPhase === 'processing'}
          label="Scan Menu Items"
          loading={menuScanPhase === 'processing'}
          onPress={() => {
            setShowPhotoSources((visible) => !visible);
          }}
        />
        {!isOnline ? <Text tone="warning">Menu scanning requires internet connection.</Text> : null}
        {showPhotoSources ? (
          <PhotoSourceActionCards
            cameraSubtitle="Menu"
            cameraTitle="Take Photo"
            disabled={!isOnline || menuScanPhase === 'processing'}
            gallerySubtitle="Photo Library"
            galleryTitle="Upload"
            onCameraPress={() => {
              void scanMenu('camera');
            }}
            onGalleryPress={() => {
              void scanMenu('gallery');
            }}
          />
        ) : null}
        {permissionNeedsSettings ? (
          <Button
            label="Open Settings"
            onPress={() => {
              void Linking.openSettings();
            }}
            variant="secondary"
          />
        ) : null}
        <PageErrorToast
          errorMessage={menuScanPhase === 'error' ? menuScanErrorMessage : null}
          title="Menu scan failed"
        />

        {verificationNeedsAttention ? (
          <View style={styles.warningPanel}>
            <Text tone="warning" variant="label">Check the restaurant match</Text>
            <Text tone="secondary">
              {menuVerification?.reason ?? 'The menu photo did not clearly match the selected restaurant.'}
            </Text>
            {menuVerification?.observedRestaurantNames.length ? (
              <Text tone="secondary">
                Seen: {menuVerification.observedRestaurantNames.join(', ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {menuScanPhase === 'success' ? (
          <View style={styles.successPanel}>
            <Text tone="success" variant="label">Menu items processed</Text>
            {createdItemNames.length > 0 ? (
              <>
                <Text tone="secondary">Added items:</Text>
                {createdItemNames.map((itemName) => (
                  <View key={itemName} style={styles.itemRow}>
                    <Ionicons color={theme.colors.text.success} name="checkmark-outline" size={14} />
                    <Text>{itemName}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {existingItemNames.length > 0 ? (
              <>
                <Text tone="secondary">
                  {createdItemNames.length > 0 ? 'Already on this menu:' : 'Matched items:'}
                </Text>
                {existingItemNames.map((itemName) => (
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
