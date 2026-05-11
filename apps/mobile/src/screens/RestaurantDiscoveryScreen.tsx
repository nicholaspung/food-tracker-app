import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  LoadingState,
  PageErrorToast,
  PhotoSourceActionCards,
  SegmentedControl,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchHeaderToggle,
  VisitRestaurantSearchOptionDescription,
  VisitRestaurantSearchSection,
  type SegmentedControlOption,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  extractRestaurantNamesFromImage,
  formatLimitExceededMessage,
  parseLimitExceededError,
  type RestaurantNameExtractionResponse,
  type RestaurantRecord,
  useMonthlyUsage,
} from '../features';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import type { PhotoPickerPermissionSource } from '../hooks/usePhotoPickerPermissions';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { captureObservabilityError, trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, ListItem, Text } from '../ui';
import {
  createAIRequestCorrelation,
  resolveAIImageErrorProperties,
} from '../features/store/aiImageObservability';

type RestaurantDiscoveryScreenProps = NativeStackScreenProps<RootStackParamList, 'RestaurantDiscovery'>;
type ImageSource = PhotoPickerPermissionSource;
type DiscoveryTab = 'search' | 'scan';

const DISCOVERY_TAB_OPTIONS: readonly SegmentedControlOption<DiscoveryTab>[] = [
  { label: 'Search', value: 'search' },
  { label: 'Scan', value: 'scan' },
];

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  card: {
    gap: theme.spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  action: {
    flexGrow: 1,
  },
  inlineLink: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xxs,
  },
  iconTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  extractedText: {
    lineHeight: 20,
  },
  warningPanel: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.status.warningBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
}));

function resolveConfidenceTone(confidence: string): 'success' | 'info' | 'warning' {
  if (confidence === 'high') {
    return 'success';
  }

  if (confidence === 'medium') {
    return 'info';
  }

  return 'warning';
}

function getRestaurantNameOptions(response: RestaurantNameExtractionResponse | null): string[] {
  if (!response) {
    return [];
  }

  if ('found' in response && response.found) {
    return response.options.map((option) => option.name.trim()).filter(Boolean);
  }

  if ('found' in response && response.allText?.trim()) {
    return response.allText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return [];
}

function getStorefrontExtractionSuccessProperties(result: RestaurantNameExtractionResponse) {
  if ('error' in result) {
    return {
      found: false,
      language: null,
      optionCount: 0,
      resultType: 'not_restaurant',
    };
  }

  if (result.found) {
    return {
      found: true,
      language: result.language ?? null,
      optionCount: result.options.length,
      resultType: 'found',
    };
  }

  return {
    found: false,
    language: null,
    optionCount: 0,
    resultType: result.allText?.trim() ? 'all_text' : 'not_restaurant',
  };
}

export function RestaurantDiscoveryScreen({
  navigation,
}: RestaurantDiscoveryScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const { actualUser, user } = useAuth();
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({
    viewAsTier: usagePreviewTier,
  });
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;

  const [storefrontResult, setStorefrontResult] =
    useState<RestaurantNameExtractionResponse | null>(null);
  const [storefrontErrorMessage, setStorefrontErrorMessage] = useState<string | null>(null);
  const [isExtractingStorefront, setIsExtractingStorefront] = useState(false);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>('search');
  const [showStorefrontPhotoSources, setShowStorefrontPhotoSources] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload an image.',
  });

  const {
    clearPlacesSearchState,
    compactSearchLabel,
    displayedNearbyRestaurants,
    displayedSavedRestaurants,
    expandedSearchLabel,
    isGettingLocation,
    isPlacesQuotaReached,
    isSearchExpanded,
    isSearchingNearbyRestaurants,
    isSearchingRestaurants,
    locationPermissionNeedsSettings,
    manualLocation,
    placesQueriesRemaining: flowPlacesQueriesRemaining,
    savedEmptyDescription,
    savedEmptyTitle,
    savedRestaurantsErrorMessage,
    savedRestaurantsLoading,
    savedRestaurantsTitle,
    searchButtonDisabled,
    searchByText,
    searchErrorMessage,
    searchNearby,
    searchQuery,
    setIsSearchExpanded,
    setManualLocation,
    setSearchQuery,
    shouldShowPlacesUpgradePrompt,
    showNearbyPlaces,
    triggerSavedRestaurantsRefetch,
  } = useRestaurantSelectionFlow({
    autoCaptureReferenceLocation: true,
    isOnline,
    menuItemsEnabled: false,
    savedRestaurantsEnabled: true,
    selectedRestaurantId: null,
    usage: {
      enforceQuota: shouldEnforceUsageLimitsClientSide,
      isFreeTier: isDisplayFreeUser,
      placesQueriesRemaining,
    },
  });

  const isBusyWithImage = isExtractingStorefront;
  const extractedNames = useMemo(() => getRestaurantNameOptions(storefrontResult), [storefrontResult]);

  const handleSelectRestaurant = useCallback((restaurant: RestaurantRecord) => {
    trackObservabilityEvent('FOOD_DISCOVERY_RESTAURANT_SELECTED', {
      restaurantId: restaurant.id,
      isGooglePlace: restaurant.isGooglePlace === true,
      source: 'RestaurantDiscoveryScreen',
    });
    navigation.navigate('RestaurantDiscoveryRestaurant', {
      city: restaurant.city,
      cuisineType: restaurant.cuisineType,
      friendCount: restaurant.friendCount,
      hasPendingMenuReview: restaurant.hasPendingMenuReview,
      isGooglePlace: restaurant.isGooglePlace,
      latitude: restaurant.latitude,
      location: restaurant.location,
      longitude: restaurant.longitude,
      placeId: restaurant.placeId,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      userVisitCount: restaurant.userVisitCount,
      visibility: restaurant.visibility,
    });
  }, [navigation]);

  const buildRestaurantOption = useCallback(
    (
      { restaurant, distance }: VisitRestaurantWithDistance,
      index: number,
      source: 'saved' | 'search',
    ): VisitRestaurantSearchOption => {
      return {
        description: (
          <VisitRestaurantSearchOptionDescription
            distance={distance}
            restaurant={restaurant}
          />
        ),
        key: restaurant.id,
        onPress: () => {
          handleSelectRestaurant(restaurant);
        },
        selected: false,
        testID: `restaurant-discovery-${source}-restaurant-option-${index}`,
        title: restaurant.name,
        trailing: <VisitRestaurantOptionTrailing restaurant={restaurant} selected={false} />,
      };
    },
    [handleSelectRestaurant],
  );

  const copyText = useCallback(async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopyStatus('Copied.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Could not copy text.');
    }
  }, []);

  const runCandidateSearch = useCallback(
    async (name: string) => {
      setSearchQuery(name);
      setIsSearchExpanded(true);
      setActiveTab('search');
      trackObservabilityEvent('FOOD_DISCOVERY_EXTRACTED_NAME_SEARCH_STARTED', {
        source: 'RestaurantDiscoveryScreen',
      });
      await searchByText({ queryOverride: name });
    },
    [searchByText, setIsSearchExpanded, setSearchQuery],
  );

  const extractStorefrontName = useCallback(
    async (source: ImageSource) => {
      const requestCorrelation = createAIRequestCorrelation('storefront');
      const eventProperties = {
        analyticsSource: 'RestaurantDiscoveryStorefront',
        photoSource: source,
        requestCorrelation,
      };

      if (!isOnline) {
        setStorefrontErrorMessage('Restaurant name extraction requires internet connection.');
        trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_OFFLINE_BLOCKED', eventProperties);
        return;
      }

      setIsExtractingStorefront(true);
      setStorefrontErrorMessage(null);
      setStorefrontResult(null);
      setCopyStatus(null);
      trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_EXTRACTION_STARTED', eventProperties);

      let imageInput: Awaited<ReturnType<typeof stageLocalPhotoFile>> | null = null;
      try {
        const pickResult = await pickImageAssets({ source });
        if (pickResult.status === 'permission_denied') {
          trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_IMAGE_PERMISSION_DENIED', {
            ...eventProperties,
            canAskAgain: pickResult.canAskAgain,
          });
          setStorefrontErrorMessage(pickResult.message);
          return;
        }

        if (pickResult.status === 'canceled') {
          trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_IMAGE_PICK_CANCELED', eventProperties);
          return;
        }

        imageInput = await stageLocalPhotoFile(pickResult.assets[0], {
          fallbackPrefix: source === 'camera' ? 'storefront-camera' : 'storefront-image',
        });
        if (!imageInput) {
          throw new Error('Could not prepare the selected image.');
        }

        const result = await extractRestaurantNamesFromImage({
          ...imageInput,
          requestCorrelation,
        });
        setStorefrontResult(result);
        trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_EXTRACTION_SUCCEEDED', {
          ...eventProperties,
          ...getStorefrontExtractionSuccessProperties(result),
        });
      } catch (error) {
        const limitPayload = parseLimitExceededError(error);
        if (limitPayload) {
          trackObservabilityEvent('USAGE_LIMIT_REACHED', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: 'RestaurantDiscoveryStorefront',
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
        }

        const resolvedErrorProperties = resolveAIImageErrorProperties(error);
        const message = limitPayload
          ? formatLimitExceededMessage(limitPayload)
          : typeof resolvedErrorProperties.errorMessage === 'string'
            ? resolvedErrorProperties.errorMessage
            : 'Could not extract a restaurant name.';

        trackObservabilityEvent('FOOD_DISCOVERY_STOREFRONT_EXTRACTION_FAILED', {
          ...eventProperties,
          ...resolvedErrorProperties,
          errorMessage: message,
        });

        if (!limitPayload) {
          captureObservabilityError(error, {
            ...eventProperties,
            ...resolvedErrorProperties,
            source: 'RestaurantDiscoveryStorefront',
          });
        }

        setStorefrontErrorMessage(message);
      } finally {
        setIsExtractingStorefront(false);
        if (imageInput) {
          await cleanupStagedPhotoFiles([imageInput]);
        }
        void queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] });
      }
    },
    [isOnline, pickImageAssets, queryClient],
  );

  const handleManualAdd = useCallback((name?: string) => {
    navigation.navigate('CreateVisitAddRestaurant', {
      initialLocation: manualLocation.trim() || undefined,
      initialRestaurantName: name?.trim() || searchQuery.trim() || extractedNames[0],
      returnTo: 'RestaurantDiscoveryRestaurant',
    });
  }, [extractedNames, manualLocation, navigation, searchQuery]);

  const handleClearPlacesSearchState = useCallback(() => {
    clearPlacesSearchState();
  }, [clearPlacesSearchState]);

  const handleUseCurrentLocationPress = useCallback(async () => {
    await searchNearby();
  }, [searchNearby]);

  return (
    <BackHeaderScreenScaffold
      onBackPress={() => {
        navigation.goBack();
      }}
      subtitle="Search food places, read storefronts, and add menu items."
      title="Food Discovery"
      testID="restaurant-discovery-screen"
    >
      <View style={styles.body}>
        <SegmentedControl
          getOptionTestID={(value) => `restaurant-discovery-tab-${value}`}
          onChange={setActiveTab}
          options={DISCOVERY_TAB_OPTIONS}
          value={activeTab}
        />

        {activeTab === 'search' ? (
          <VisitRestaurantSearchSection
            connectivityWarningMessage={!isOnline ? 'Online search is unavailable while offline.' : null}
            footerContent={
              isSearchExpanded ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    handleManualAdd();
                  }}
                  style={styles.inlineLink}
                  testID="restaurant-discovery-add-restaurant-link"
                >
                  <Text tone="brand">Add new restaurant</Text>
                </Pressable>
              ) : null
            }
            headerAccessory={
              <VisitRestaurantSearchHeaderToggle
                expanded={isSearchExpanded}
                onPress={() => {
                  setIsSearchExpanded((current) => !current);
                }}
                testID="restaurant-discovery-search-toggle"
              />
            }
            isSearchResultsLoading={isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation}
            locationPermissionNeedsSettings={locationPermissionNeedsSettings}
            manualLocation={manualLocation}
            onClearSearchResults={handleClearPlacesSearchState}
            onManualLocationChange={setManualLocation}
            onOpenLocationSettings={() => {
              void Linking.openSettings();
            }}
            onRetrySavedResults={() => {
              void triggerSavedRestaurantsRefetch();
            }}
            onSearchPress={() => {
              void searchByText();
            }}
            onSearchQueryChange={setSearchQuery}
            onUseCurrentLocationPress={() => {
              void handleUseCurrentLocationPress();
            }}
            quotaWarningMessage={
              isOnline && isPlacesQuotaReached
                ? shouldEnforceUsageLimitsClientSide
                  ? 'Monthly food place search limit reached.'
                  : 'Monthly food place search limit reached in preview mode. Admin access is still allowed.'
                : null
            }
            savedEmptyDescription={savedEmptyDescription}
            savedEmptyTitle={savedEmptyTitle}
            savedOptions={displayedSavedRestaurants.map((restaurant, index) =>
              buildRestaurantOption(restaurant, index, 'saved'),
            )}
            savedResultsErrorMessage={savedRestaurantsErrorMessage}
            savedResultsLoading={savedRestaurantsLoading}
            savedResultsTitle={savedRestaurantsTitle}
            searchButtonDisabled={searchButtonDisabled}
            searchButtonLabel={isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
            searchButtonLoading={isSearchingRestaurants}
            searchErrorMessage={searchErrorMessage}
            searchInputsMode={isSearchExpanded ? 'full' : 'compact'}
            searchQuery={searchQuery}
            searchResultsOptions={displayedNearbyRestaurants.map((restaurant, index) =>
              buildRestaurantOption(restaurant, index, 'search'),
            )}
            showSearchResults={showNearbyPlaces}
            upgradePromptDescription={
              shouldShowPlacesUpgradePrompt
                ? isPlacesQuotaReached
                  ? "You have reached this month's free search limit. Subscriber accounts have higher limits for place search."
                  : `Only ${flowPlacesQueriesRemaining} food place searches left this month. Subscriber accounts have higher limits for place search.`
                : null
            }
            upgradePromptTitle={
              shouldShowPlacesUpgradePrompt
                ? isPlacesQuotaReached
                  ? 'Free limit reached'
                  : 'You are close to your free limit'
                : null
            }
          />
        ) : (
          <Card style={styles.card}>
            <View style={styles.iconTitle}>
              <Ionicons color={theme.colors.text.info} name="scan-outline" size={18} />
              <Text variant="label">Read a Storefront</Text>
            </View>
            <Text tone="secondary">
              Extract possible restaurant names from a sign, then search or copy the text.
            </Text>
            <Button
              disabled={!isOnline || isBusyWithImage}
              label="Read a Storefront"
              loading={isExtractingStorefront}
              onPress={() => {
                setShowStorefrontPhotoSources((visible) => !visible);
              }}
            />
            {showStorefrontPhotoSources ? (
              <PhotoSourceActionCards
                cameraSubtitle="Storefront"
                cameraTitle="Take Photo"
                disabled={!isOnline || isBusyWithImage}
                gallerySubtitle="Photo Library"
                galleryTitle="Upload"
                onCameraPress={() => {
                  void extractStorefrontName('camera');
                }}
                onGalleryPress={() => {
                  void extractStorefrontName('gallery');
                }}
              />
            ) : null}
            {!isOnline ? <Text tone="warning">Storefront extraction requires internet connection.</Text> : null}
            {isExtractingStorefront ? <LoadingState label="Reading restaurant text..." /> : null}
            <PageErrorToast
              errorMessage={storefrontErrorMessage}
              title="Could not read storefront"
            />
            {permissionNeedsSettings ? (
              <Button
                label="Open Settings"
                onPress={() => {
                  void Linking.openSettings();
                }}
                variant="secondary"
              />
            ) : null}

            {storefrontResult && 'error' in storefrontResult ? (
              <View style={styles.warningPanel}>
                <Text tone="warning" variant="label">No restaurant detected</Text>
                <Text tone="secondary">{storefrontResult.reason ?? 'Try a clearer photo of the sign or storefront.'}</Text>
              </View>
            ) : null}

            {storefrontResult && 'found' in storefrontResult && storefrontResult.found ? (
              <View style={styles.card}>
                <Text variant="label">Possible Names</Text>
                {storefrontResult.options.map((option) => (
                  <ListItem
                    description={
                      <View style={styles.card}>
                        <Text tone={resolveConfidenceTone(option.confidence)}>
                          {option.confidence} confidence
                        </Text>
                        {option.reason ? <Text tone="secondary">{option.reason}</Text> : null}
                        <View style={styles.wrapRow}>
                          <Button
                            label="Search"
                            onPress={() => {
                              void runCandidateSearch(option.name);
                            }}
                            style={styles.action}
                          />
                          <Button
                            label="Copy"
                            onPress={() => {
                              void copyText(option.name);
                            }}
                            style={styles.action}
                            variant="secondary"
                          />
                          <Button
                            label="Add Manually"
                            onPress={() => {
                              handleManualAdd(option.name);
                            }}
                            style={styles.action}
                            variant="secondary"
                          />
                        </View>
                      </View>
                    }
                    key={option.name}
                    title={option.name}
                  />
                ))}
              </View>
            ) : null}

            {storefrontResult && 'found' in storefrontResult && !storefrontResult.found ? (
              <View style={styles.card}>
                <Text variant="label">Visible Text</Text>
                <Text style={styles.extractedText}>{storefrontResult.allText?.trim() || 'No clear text found.'}</Text>
                {storefrontResult.allText?.trim() ? (
                  <View style={styles.wrapRow}>
                    <Button
                      label="Copy Text"
                      onPress={() => {
                        void copyText(storefrontResult.allText ?? '');
                      }}
                      style={styles.action}
                      variant="secondary"
                    />
                    <Button
                      label="Add Manually"
                      onPress={() => {
                        handleManualAdd(extractedNames[0]);
                      }}
                      style={styles.action}
                      variant="secondary"
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            {copyStatus ? <Text tone="secondary">{copyStatus}</Text> : null}
          </Card>
        )}
      </View>
    </BackHeaderScreenScaffold>
  );
}
