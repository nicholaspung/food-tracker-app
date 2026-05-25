import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  PageErrorToast,
  RestaurantMenuItemPicker,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchHeaderToggle,
  VisitRestaurantSearchOptionDescription,
  VisitRestaurantSearchSection,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  type MenuItemRecord,
  type RestaurantRecord,
  useMonthlyUsage,
  useTastingPlanMenuCatalog,
  useTastingPlanWrites,
} from '../features';
import { useTastingPlanRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Text } from '../ui';
import { getApprovedItemCount } from './tastingSessions/shared';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionPlanningScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionPlanning'>;
type PlanningPhase = 'restaurants' | 'items';

const useStyles = createThemedStyles((theme) => ({
  headerDescription: {
    gap: theme.spacing.xs,
  },
  card: {
    gap: theme.spacing.sm,
  },
  compactPlanCard: {
    gap: theme.spacing.xs,
  },
  planHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  planMetricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  compactRestaurantRow: {
    alignItems: 'center',
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  compactRestaurantContent: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  compactRemoveButton: {
    borderColor: theme.colors.button.secondaryBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  grow: {
    flex: 1,
  },
  switcherRow: {
    gap: theme.spacing.xs,
  },
}));

export function TastingSessionPlanningScreen({ navigation, route }: TastingSessionPlanningScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { actualUser, user } = useAuth();
  const { isOnline } = useConnectivity();
  const tastingPlanWrites = useTastingPlanWrites();
  const previousActiveRestaurantIdRef = useRef<string | null>(null);
  const sessionQuery = useTastingSessionDetail(sessionId, true);
  const session = sessionQuery.data;
  const currentSessionId = session?.id;
  const currentSessionStatus = session?.status;
  const [phase, setPhase] = useState<PlanningPhase>('restaurants');
  const [activeRestaurantSuggestionId, setActiveRestaurantSuggestionId] = useState<string | null>(null);
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState('');
  const [isTipPopoverVisible, setIsTipPopoverVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addingRestaurantId, setAddingRestaurantId] = useState<string | null>(null);
  const isLeader = Boolean(session && user?.id === session.leaderUserId);
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({ viewAsTier: usagePreviewTier });
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;

  const selectedRestaurants = useMemo(
    () => session?.restaurants.filter((restaurant) => restaurant.status === 'approved') ?? [],
    [session?.restaurants],
  );
  const selectedRestaurantIds = useMemo(
    () => new Set(selectedRestaurants.map((restaurant) => restaurant.restaurantId)),
    [selectedRestaurants],
  );
  const activeRestaurant = useMemo(
    () =>
      selectedRestaurants.find((restaurant) => restaurant.id === activeRestaurantSuggestionId) ??
      selectedRestaurants[0] ??
      null,
    [activeRestaurantSuggestionId, selectedRestaurants],
  );
  const selectedItemIds = useMemo(
    () => new Set((activeRestaurant?.items ?? []).filter((item) => item.status === 'approved').map((item) => item.menuItemId)),
    [activeRestaurant?.items],
  );
  const selectedItemCount = session ? getApprovedItemCount(session) : 0;
  const canStart = isLeader && selectedRestaurants.length > 0 && selectedItemCount > 0;
  const activeSelectedItemCount = (activeRestaurant?.items ?? []).filter((item) => item.status === 'approved').length;

  useEffect(() => {
    if (!currentSessionId) {
      return;
    }

    if (currentSessionStatus === 'tasting' || currentSessionStatus === 'rating') {
      navigation.replace('TastingSessionTasting', { sessionId: currentSessionId });
      return;
    }

    if (currentSessionStatus === 'completed') {
      navigation.replace('TastingSessionResults', { sessionId: currentSessionId });
    }
  }, [currentSessionId, currentSessionStatus, navigation]);

  useEffect(() => {
    if (selectedRestaurants.length === 0 && phase === 'items') {
      setPhase('restaurants');
    }
  }, [phase, selectedRestaurants.length]);

  useEffect(() => {
    if (!activeRestaurant && selectedRestaurants[0]) {
      setActiveRestaurantSuggestionId(selectedRestaurants[0].id);
      return;
    }
    if (activeRestaurant && activeRestaurant.id !== activeRestaurantSuggestionId) {
      setActiveRestaurantSuggestionId(activeRestaurant.id);
    }
  }, [activeRestaurant, activeRestaurantSuggestionId, selectedRestaurants]);

  const restaurantSelection = useTastingPlanRestaurantSelectionFlow({
    autoCaptureReferenceLocation: true,
    isOnline,
    menuItemsEnabled: false,
    savedRestaurantsEnabled: isLeader,
    selectedRestaurantId: null,
    usage: {
      enforceQuota: shouldEnforceUsageLimitsClientSide,
      isFreeTier: isDisplayFreeUser,
      placesQueriesRemaining,
    },
  });
  const { quotaDisplay, savedSuggestions, search } = restaurantSelection;
  const clearPlacesSearchState = search.clearPlacesState;
  const compactSearchLabel = search.compactLabel;
  const displayedNearbyRestaurants = search.displayedNearbyRestaurants;
  const displayedSavedRestaurants = savedSuggestions.displayedSavedRestaurants;
  const expandedSearchLabel = search.expandedLabel;
  const isGettingLocation = search.isGettingLocation;
  const isPlacesQuotaReached = quotaDisplay.isPlacesQuotaReached;
  const isSearchExpanded = search.isExpanded;
  const isSearchingNearbyRestaurants = search.isSearchingNearby;
  const isSearchingRestaurants = search.isSearchingText;
  const locationPermissionNeedsSettings = search.locationPermissionNeedsSettings;
  const manualLocation = search.manualLocation;
  const flowPlacesQueriesRemaining = quotaDisplay.placesQueriesRemaining;
  const savedEmptyDescription = savedSuggestions.emptyDescription;
  const savedEmptyTitle = savedSuggestions.emptyTitle;
  const savedRestaurantsErrorMessage = savedSuggestions.errorMessage;
  const savedRestaurantsLoading = savedSuggestions.isLoading;
  const savedRestaurantsTitle = savedSuggestions.title;
  const searchButtonDisabled = search.searchButtonDisabled;
  const searchByText = search.searchByText;
  const searchErrorMessage = search.searchErrorMessage;
  const searchNearby = search.nearby;
  const searchQuery = search.query;
  const setIsSearchExpanded = search.setExpanded;
  const setManualLocation = search.setManualLocation;
  const setSearchQuery = search.setQuery;
  const shouldShowPlacesUpgradePrompt = quotaDisplay.shouldShowPlacesUpgradePrompt;
  const showNearbyPlaces = search.showNearbyPlaces;
  const triggerSavedRestaurantsRefetch = savedSuggestions.refetch;

  const {
    menuItemsQuery,
    menuReviewSubmitted,
    requestMenuReview,
  } = useTastingPlanMenuCatalog({
    activeRestaurantId: activeRestaurant?.restaurantId ?? null,
    enabled: phase === 'items',
    isOnline,
  });

  useEffect(() => {
    const activeRestaurantId = activeRestaurant?.restaurantId ?? null;
    if (previousActiveRestaurantIdRef.current === activeRestaurantId) {
      return;
    }
    previousActiveRestaurantIdRef.current = activeRestaurantId;
    setMenuItemSearchQuery('');
    setIsTipPopoverVisible(false);
  }, [activeRestaurant?.restaurantId]);

  const runAction = async (action: () => Promise<{ message: string; status: 'blocked' } | { status: 'completed' }>) => {
    try {
      setErrorMessage(null);
      const result = await action();
      if (result.status === 'blocked') {
        setErrorMessage(result.message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Planning action failed.');
    }
  };

  const handleStartTasting = async () => {
    await runAction(async () => {
      const startResult = await tastingPlanWrites.startTasting({ isOnline, sessionId });
      if (startResult.status === 'completed') {
        navigation.replace('TastingSessionTasting', { sessionId: startResult.result.id });
      }
      return startResult;
    });
  };

  const handleAddRestaurant = async (restaurant: RestaurantRecord) => {
    if (selectedRestaurantIds.has(restaurant.id) || addingRestaurantId) {
      return;
    }

    setAddingRestaurantId(restaurant.id);
    await runAction(async () => {
      const addResult = await tastingPlanWrites.addRestaurant({
        isOnline,
        restaurant,
        sessionId,
      });
      if (addResult.status === 'completed') {
        setSearchQuery('');
        clearPlacesSearchState();
      }
      return addResult;
    });
    setAddingRestaurantId(null);
  };

  const handleRemoveRestaurant = async (restaurantSuggestionId: string) => {
    await runAction(async () => {
      const removeResult = await tastingPlanWrites.removeRestaurant({
        isOnline,
        restaurantSuggestionId,
        sessionId,
      });
      if (removeResult.status === 'completed' && activeRestaurantSuggestionId === restaurantSuggestionId) {
        setActiveRestaurantSuggestionId(null);
      }
      return removeResult;
    });
  };

  const handleToggleMenuItem = async (menuItem: MenuItemRecord) => {
    if (!activeRestaurant) {
      return;
    }

    const existingSuggestion = (activeRestaurant.items ?? []).find((item) => item.menuItemId === menuItem.id);

    if (existingSuggestion?.status === 'approved') {
      await runAction(() =>
        tastingPlanWrites.removeMenuItem({
          isOnline,
          itemSuggestionId: existingSuggestion.id,
          sessionId,
        }),
      );
      return;
    }

    await runAction(() =>
      tastingPlanWrites.addMenuItem({
        existingSuggestionId: existingSuggestion?.id,
        isOnline,
        menuItem,
        restaurantSuggestionId: activeRestaurant.id,
        sessionId,
      }),
    );
  };

  const handleRequestMenuReview = async () => {
    try {
      setErrorMessage(null);
      await requestMenuReview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit review request.');
    }
  };

  const handleScanMenuPhoto = () => {
    if (!activeRestaurant || !isOnline) {
      return;
    }

    navigation.navigate('ProcessPhotos', {
      autoStartSourcePicker: false,
      mode: 'menu_scan',
      restaurantId: activeRestaurant.restaurantId,
      restaurantName: activeRestaurant.restaurantName,
      returnTo: 'TastingSessionPlanning',
      tastingSessionId: sessionId,
    });
  };

  const buildRestaurantOption = (
    { restaurant, distance }: VisitRestaurantWithDistance,
    index: number,
    source: 'saved' | 'search',
  ): VisitRestaurantSearchOption => {
    const selected = selectedRestaurantIds.has(restaurant.id);
    const isAdding = addingRestaurantId === restaurant.id;

    return {
      description: (
        <VisitRestaurantSearchOptionDescription
          distance={distance}
          restaurant={restaurant}
        />
      ),
      key: restaurant.id,
      onPress: () => {
        void handleAddRestaurant(restaurant);
      },
      selected: selected || isAdding,
      testID: `tasting-planning-${source}-restaurant-option-${index}`,
      title: restaurant.name,
      trailing: (
        <VisitRestaurantOptionTrailing
          restaurant={restaurant}
          selected={selected || isAdding}
        />
      ),
    };
  };

  if (!session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Planning">
        <EmptyState title="Loading planning" />
      </FeatureDetailScreenScaffold>
    );
  }

  const headerDescription = isLeader ? (
    <View style={styles.headerDescription}>
      <Text tone="muted">
        {phase === 'restaurants'
          ? selectedRestaurants.length > 0
            ? `${selectedRestaurants.length} selected. Add menu items to start.`
            : 'Select restaurants for this tasting.'
          : `${selectedRestaurants.length} selected restaurants, ${selectedItemCount} selected items.`}
      </Text>
    </View>
  ) : (
    'Waiting for the leader to finalize the tasting plan.'
  );

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      onBackPress={() => navigation.navigate('TastingSessions')}
      primaryAction={
        isLeader
          ? phase === 'restaurants'
            ? {
                disabled: selectedRestaurants.length === 0,
                label: 'Next',
                onPress: () => {
                  setPhase('items');
                },
              }
            : {
                disabled: !canStart || !isOnline,
                label: 'Start Tasting',
                onPress: () => {
                  void handleStartTasting();
                },
              }
          : undefined
      }
      secondaryAction={
        isLeader && phase === 'items'
          ? {
              label: 'Back',
              onPress: () => {
                setPhase('restaurants');
              },
            }
          : undefined
      }
      subtitle={headerDescription}
      title={session.name}
    >
      {!isOnline ? <Text tone="warning">Planning actions require a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Planning failed" />

      {phase === 'restaurants' ? (
        <Card style={styles.compactPlanCard}>
          <View style={styles.planHeaderRow}>
            <Text variant="label">Tasting Plan</Text>
            <View style={styles.planMetricsRow}>
              <Text tone={selectedRestaurants.length > 0 ? 'success' : 'warning'}>
                {selectedRestaurants.length} {selectedRestaurants.length === 1 ? 'restaurant' : 'restaurants'}
              </Text>
              <Text tone={selectedItemCount > 0 ? 'success' : 'warning'}>
                {selectedItemCount} {selectedItemCount === 1 ? 'item' : 'items'}
              </Text>
            </View>
          </View>
          {selectedRestaurants.length > 0 ? (
            selectedRestaurants.map((restaurant) => {
              const restaurantSelectedItems = (restaurant.items ?? []).filter((item) => item.status === 'approved').length;

              return (
                <View key={restaurant.id} style={styles.compactRestaurantRow}>
                  <View style={styles.compactRestaurantContent}>
                    <Text variant="label">{restaurant.restaurantName}</Text>
                    <Text tone="secondary">
                      {restaurantSelectedItems} selected {restaurantSelectedItems === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                  {isLeader && session.status === 'planning' ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!isOnline}
                      onPress={() => {
                        void handleRemoveRestaurant(restaurant.id);
                      }}
                      style={styles.compactRemoveButton}
                    >
                      <Text variant="button">Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text tone="secondary">Selected restaurants will appear here.</Text>
          )}
        </Card>
      ) : null}

      {isLeader && phase === 'restaurants' ? (
        <>
          <VisitRestaurantSearchSection
            connectivityWarningMessage={!isOnline ? 'Restaurant search requires internet connection.' : null}
            currentLocationDisabled={
              !isOnline ||
              isGettingLocation ||
              isSearchingNearbyRestaurants ||
              (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
            }
            currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
            headerAccessory={
              <VisitRestaurantSearchHeaderToggle
                expanded={isSearchExpanded}
                onPress={() => {
                  setIsSearchExpanded((current) => !current);
                }}
                testID="tasting-planning-search-toggle"
              />
            }
            isSearchResultsLoading={isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation}
            locationPermissionNeedsSettings={locationPermissionNeedsSettings}
            manualLocation={manualLocation}
            onClearSearchResults={() => {
              clearPlacesSearchState();
            }}
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
              void searchNearby();
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
        </>
      ) : null}

      {isLeader && phase === 'items' ? (
        <>
          <Card style={styles.card}>
            <Text variant="label">Select menu items</Text>
            <Text tone="secondary">Choose one restaurant, then select items for the tasting plan.</Text>
            <View style={styles.switcherRow}>
              {selectedRestaurants.map((restaurant) => {
                const itemCount = (restaurant.items ?? []).filter((item) => item.status === 'approved').length;
                const active = activeRestaurant?.id === restaurant.id;
                return (
                  <Button
                    key={restaurant.id}
                    label={`${restaurant.restaurantName} (${itemCount})`}
                    onPress={() => {
                      setActiveRestaurantSuggestionId(restaurant.id);
                    }}
                    variant={active ? 'primary' : 'secondary'}
                  />
                );
              })}
            </View>
          </Card>

          {activeRestaurant ? (
            <>
              <RestaurantMenuItemPicker
                addManualDisabled={!isOnline}
                currentUserId={user?.id ?? ''}
                hasError={menuItemsQuery.isError}
                isItemSelected={(item) => selectedItemIds.has(item.id)}
                isLoading={menuItemsQuery.isLoading}
                isOnline={isOnline}
                isReviewDisabled={!isOnline || menuReviewSubmitted}
                isReviewSubmitted={menuReviewSubmitted}
                isTipVisible={isTipPopoverVisible}
                items={menuItemsQuery.data ?? []}
                label={
                  menuItemSearchQuery.trim()
                    ? `Search results (${menuItemsQuery.data?.length ?? 0})`
                    : `All menu items (${menuItemsQuery.data?.length ?? 0})`
                }
                onAddManual={() => {
                  navigation.navigate('CreateVisitAddMenuItem', {
                    restaurantId: activeRestaurant.restaurantId,
                    restaurantName: activeRestaurant.restaurantName,
                    returnTo: 'TastingSessionPlanning',
                    tastingRestaurantSuggestionId: activeRestaurant.id,
                    tastingSessionId: sessionId,
                  });
                }}
                onEditItem={(item) => {
                  navigation.navigate('CreateVisitEditMenuItem', {
                    initialName: item.name,
                    initialVisibility: item.visibility,
                    menuItemId: item.id,
                    restaurantId: item.restaurant,
                  });
                }}
                onRequestMenuReview={() => {
                  void handleRequestMenuReview();
                }}
                onRetry={() => {
                  void menuItemsQuery.refetch();
                }}
                onScanMenuPhoto={handleScanMenuPhoto}
                onSearchQueryChange={setMenuItemSearchQuery}
                onTipVisibilityChange={setIsTipPopoverVisible}
                onToggleItem={(item) => {
                  void handleToggleMenuItem(item);
                }}
                scanDisabled={!isOnline}
                searchQuery={menuItemSearchQuery}
                selectedCount={activeSelectedItemCount}
                testIDPrefix="tasting-planning"
              />
            </>
          ) : (
            <EmptyState description="Go back and select at least one restaurant first." title="No restaurant selected" />
          )}
        </>
      ) : null}

      {!isLeader ? (
        <Card>
          <Text tone="secondary">The leader is building the tasting plan.</Text>
        </Card>
      ) : null}
    </FeatureDetailScreenScaffold>
  );
}
