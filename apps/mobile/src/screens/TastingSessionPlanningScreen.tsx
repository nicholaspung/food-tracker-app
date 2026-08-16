import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  ConfirmDestructiveModal,
  EmptyState,
  FeatureDetailScreenScaffold,
  FocusedRestaurantSearchHeader,
  PageErrorToast,
  RestaurantMenuItemPicker,
  StepProgressBar,
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
  useRestaurantSelectedMenuItemsQuery,
  useTastingPlanMenuCatalog,
  useTastingPlanPlanningState,
  useTastingSessionLifecycleWrites,
} from '../features';
import {
  isCurrentLocationSearchSelection,
  isUserAddedRestaurantOption,
} from '../features/restaurants/restaurantSelection';
import { useTastingPlanRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Modal, Text } from '../ui';
import { TASTING_SESSION_LIFECYCLE_STEPS } from './tastingSessions/shared';
import { TastingSessionLifecycleShell } from './tastingSessions/TastingSessionLifecycleShell';
import { useTastingSessionLifecycleNavigation } from './tastingSessions/useTastingSessionLifecycleNavigation';
import { useTastingSessionLifecycleReadState } from './tastingSessions/useTastingSessionLifecycleReadState';

type TastingSessionPlanningScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionPlanning'>;

const useStyles = createThemedStyles((theme) => ({
  headerDescription: {
    gap: theme.spacing.xs,
  },
  stickySummary: {
    backgroundColor: theme.colors.background.app,
  },
  card: {
    gap: theme.spacing.sm,
  },
  compactPlanCard: {
    gap: theme.spacing.xs,
  },
  interactiveSummaryCard: {
    borderColor: theme.colors.border.info,
    backgroundColor: theme.colors.status.infoBg,
  },
  planHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  planHeaderContent: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  planMetricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  destructiveIconButtonPressed: {
    opacity: 0.7,
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  headerIconButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  compactRestaurantRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
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
  const theme = useTheme();
  const { sessionId } = route.params;
  const { actualUser, user } = useAuth();
  const tastingLifecycleWrites = useTastingSessionLifecycleWrites();
  const previousActiveRestaurantIdRef = useRef<string | null>(null);
  const lifecycle = useTastingSessionLifecycleReadState({
    currentUserId: user?.id,
    screen: 'planning',
    sessionId,
  });
  const sessionQuery = lifecycle.query;
  const session = sessionQuery.data;
  const isOnline = lifecycle.onlineOnly.isOnline;
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState('');
  const [isTipPopoverVisible, setIsTipPopoverVisible] = useState(false);
  const [isMissingItemsDialogVisible, setIsMissingItemsDialogVisible] = useState(false);
  const [isPlanSummaryExpanded, setIsPlanSummaryExpanded] = useState(true);
  const [isMenuSummaryExpanded, setIsMenuSummaryExpanded] = useState(true);
  const [isRestaurantSearchFocused, setIsRestaurantSearchFocused] = useState(false);
  const [focusedLocationOptionsDismissSignal, setFocusedLocationOptionsDismissSignal] = useState(0);
  const [pendingRemoveRestaurantId, setPendingRemoveRestaurantId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addingRestaurantId, setAddingRestaurantId] = useState<string | null>(null);
  const [isDeleteSessionModalVisible, setIsDeleteSessionModalVisible] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const isLeader = lifecycle.roles.isLeader;
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
  const tastingPlanPlanning = useTastingPlanPlanningState({
    isLeader,
    isOnline,
    session,
  });
  const {
    activeRestaurant,
    activeRestaurantFact,
    activeRestaurantSuggestionId,
    activeSelectedItemCount,
    missingItemConfirmation,
    onlineActions,
    phase,
    scanHandoff,
    selectedItemCount,
    selectedItemIds,
    selectedRestaurantFacts,
    selectedRestaurantIds,
    selectedRestaurants,
    setActiveRestaurantSuggestionId,
    setPhase,
    startReadiness,
  } = tastingPlanPlanning;
  const pendingRemoveRestaurant = useMemo(
    () => selectedRestaurants.find((restaurant) => restaurant.id === pendingRemoveRestaurantId) ?? null,
    [pendingRemoveRestaurantId, selectedRestaurants],
  );
  useTastingSessionLifecycleNavigation({
    navigation,
    redirectDestination: lifecycle.redirectDestination,
  });

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
  const isUsingCurrentLocation = search.isUsingCurrentLocation;
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
  const searchCurrentLocationByText = search.searchCurrentLocationByText;
  const searchErrorMessage = search.searchErrorMessage;
  const searchQuery = search.query;
  const selectCurrentLocationForSearch = search.selectCurrentLocation;
  const setIsSearchExpanded = search.setExpanded;
  const setManualLocation = search.setManualLocation;
  const setSearchQuery = search.setQuery;
  const shouldShowPlacesUpgradePrompt = quotaDisplay.shouldShowPlacesUpgradePrompt;
  const showNearbyPlaces = search.showNearbyPlaces;
  const triggerSavedRestaurantsRefetch = savedSuggestions.refetch;
  const filteredDisplayedSavedRestaurants = useMemo(
    () => displayedSavedRestaurants.filter(isUserAddedRestaurantOption),
    [displayedSavedRestaurants],
  );

  const {
    menuItemsQuery,
    menuReviewSubmitted,
    requestMenuReview,
  } = useTastingPlanMenuCatalog({
    activeRestaurantId: activeRestaurant?.restaurantId ?? null,
    enabled: phase === 'items',
    isOnline,
    searchQuery: menuItemSearchQuery,
  });
  const selectedMenuItemIdList = useMemo(() => [...selectedItemIds], [selectedItemIds]);
  const selectedMenuItemsQuery = useRestaurantSelectedMenuItemsQuery({
    enabled: phase === 'items',
    isOnline,
    itemIds: selectedMenuItemIdList,
    restaurantId: activeRestaurant?.restaurantId ?? null,
  });
  const hydratedSelectedMenuItemsById = useMemo(
    () => new Map((selectedMenuItemsQuery.data ?? []).map((item) => [item.id, item])),
    [selectedMenuItemsQuery.data],
  );
  const selectedMenuItemsForPicker = useMemo<MenuItemRecord[]>(
    () =>
      (activeRestaurant?.items ?? []).flatMap((item) =>
        item.status === 'approved' && item.menuItemId
          ? [
              hydratedSelectedMenuItemsById.get(item.menuItemId) ?? {
                id: item.menuItemId,
                name: item.name,
                restaurant: activeRestaurant?.restaurantId ?? '',
              },
            ]
          : [],
      ),
    [activeRestaurant, hydratedSelectedMenuItemsById],
  );

  useEffect(() => {
    const activeRestaurantId = activeRestaurant?.restaurantId ?? null;
    if (previousActiveRestaurantIdRef.current === activeRestaurantId) {
      return;
    }
    previousActiveRestaurantIdRef.current = activeRestaurantId;
    setMenuItemSearchQuery('');
    setIsTipPopoverVisible(false);
  }, [activeRestaurant?.restaurantId]);

  const runAction = async (
    action: () => Promise<{ message: string; status: 'blocked' } | { status: 'completed' } | { status: 'queued' }>,
  ) => {
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
      const startResult = await tastingLifecycleWrites.startTasting({ sessionId });
      if (startResult.status === 'completed') {
        navigation.replace('TastingSessionTasting', { sessionId: startResult.result.id });
      }
      return startResult;
    });
  };

  const handleStartTastingPress = () => {
    if (missingItemConfirmation.required) {
      setIsMissingItemsDialogVisible(true);
      return;
    }

    void handleStartTasting();
  };

  const handleConfirmDeleteSession = async () => {
    try {
      setErrorMessage(null);
      setIsDeletingSession(true);
      const deleteResult = await tastingLifecycleWrites.deleteSession({ sessionId });
      if (deleteResult.status === 'blocked') {
        setErrorMessage(deleteResult.message);
        return;
      }
      setIsDeleteSessionModalVisible(false);
      navigation.navigate('TastingSessions');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete tasting session.');
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleAddRestaurant = async (restaurant: RestaurantRecord) => {
    if (selectedRestaurantIds.has(restaurant.id) || addingRestaurantId) {
      return;
    }

    setAddingRestaurantId(restaurant.id);
    await runAction(async () => {
      const addResult = await tastingLifecycleWrites.addRestaurant({
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

  const handleSearchCurrentLocationByText = async () => {
    await searchCurrentLocationByText();
  };

  const handleRestaurantSearchPress = async () => {
    if (isCurrentLocationSearchSelection({ isUsingCurrentLocation, manualLocation })) {
      await handleSearchCurrentLocationByText();
      return;
    }

    await searchByText();
  };

  const dismissFocusedLocationOptions = useCallback(() => {
    if (!isRestaurantSearchFocused) {
      return;
    }

    setFocusedLocationOptionsDismissSignal((currentSignal) => currentSignal + 1);
  }, [isRestaurantSearchFocused]);

  const handleToggleRestaurantSearchExpanded = () => {
    const shouldExpand = !isSearchExpanded;
    setIsSearchExpanded(shouldExpand);
    if (shouldExpand && !manualLocation.trim()) {
      selectCurrentLocationForSearch();
    }
  };

  const handleRestaurantSearchQueryFocus = () => {
    setIsRestaurantSearchFocused(true);
    if (!manualLocation.trim()) {
      selectCurrentLocationForSearch();
    }
  };

  const handleRemoveRestaurant = async (restaurantSuggestionId: string) => {
    await runAction(async () => {
      const removeResult = await tastingLifecycleWrites.removeRestaurant({
        restaurantSuggestionId,
        sessionId,
      });
      if (removeResult.status === 'completed' && activeRestaurantSuggestionId === restaurantSuggestionId) {
        setActiveRestaurantSuggestionId(null);
      }
      return removeResult;
    });
    setPendingRemoveRestaurantId(null);
  };

  const handleToggleMenuItem = async (menuItem: MenuItemRecord) => {
    if (!activeRestaurant) {
      return;
    }

    const existingSuggestion = (activeRestaurant.items ?? []).find((item) => item.menuItemId === menuItem.id);

    if (existingSuggestion?.status === 'approved') {
      await runAction(() =>
        tastingLifecycleWrites.removeMenuItem({
          itemSuggestionId: existingSuggestion.id,
          sessionId,
        }),
      );
      return;
    }

    await runAction(() =>
      tastingLifecycleWrites.addMenuItem({
        existingSuggestionId: existingSuggestion?.id,
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
    if (scanHandoff.disabled || !scanHandoff.restaurantId || !scanHandoff.restaurantName) {
      return;
    }

    navigation.navigate('ProcessPhotos', {
      autoStartSourcePicker: false,
      mode: 'menu_scan',
      restaurantId: scanHandoff.restaurantId,
      restaurantName: scanHandoff.restaurantName,
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

  const headerDescription = isLeader ? (
    <View style={styles.headerDescription}>
      <Text tone="muted">
        {phase === 'restaurants'
          ? 'Choose one or more restaurants for this tasting, then continue to menu items.'
          : 'Choose menu items from each selected restaurant. Start tasting when the plan is ready.'}
      </Text>
    </View>
  ) : (
    'Waiting for the leader to choose restaurants and menu items for the tasting plan.'
  );
  const focusedRestaurantSearchHeader = (
    <FocusedRestaurantSearchHeader
      currentLocationDisabled={
        !isOnline ||
        isGettingLocation ||
        isSearchingNearbyRestaurants ||
        (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
      }
      currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
      isUsingCurrentLocation={isUsingCurrentLocation}
      locationOptionsDismissSignal={focusedLocationOptionsDismissSignal}
      manualLocation={manualLocation}
      onBackPress={() => {
        setIsRestaurantSearchFocused(false);
      }}
      onManualLocationChange={setManualLocation}
      onSearchPress={() => {
        void handleRestaurantSearchPress();
      }}
      onSearchQueryChange={setSearchQuery}
      onUseCurrentLocationPress={() => {
        void handleSearchCurrentLocationByText();
      }}
      searchButtonDisabled={searchButtonDisabled}
      searchButtonLabel={expandedSearchLabel}
      searchButtonLoading={isSearchingRestaurants}
      searchQuery={searchQuery}
      testID="tasting-planning-focused-restaurant-search-header"
    />
  );

  const summaryCard = phase === 'restaurants' ? (
    <View style={styles.stickySummary}>
      <Card style={[styles.compactPlanCard, styles.interactiveSummaryCard]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isPlanSummaryExpanded }}
          onPress={() => setIsPlanSummaryExpanded((expanded) => !expanded)}
          style={styles.planHeaderRow}
        >
          <View style={styles.planHeaderContent}>
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
          <Ionicons
            color={theme.colors.text.info}
            name={isPlanSummaryExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
          />
        </Pressable>
        {isPlanSummaryExpanded ? (
          selectedRestaurants.length > 0 ? (
            selectedRestaurantFacts.map((restaurant) => {
              return (
                <View key={restaurant.id} style={styles.compactRestaurantRow}>
                  <View style={styles.compactRestaurantContent}>
                    <Text variant="label">{restaurant.restaurantName}</Text>
                    <Text tone="secondary">
                      {restaurant.selectedItemCount} selected {restaurant.selectedItemCount === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                  {isLeader && session?.status === 'planning' ? (
                    <Pressable
                      accessibilityLabel={`Remove ${restaurant.restaurantName} from tasting plan`}
                      accessibilityRole="button"
                      disabled={!isOnline}
                      hitSlop={12}
                      onPress={() => setPendingRemoveRestaurantId(restaurant.id)}
                      style={({ pressed }) => [
                        styles.iconButton,
                        pressed ? styles.destructiveIconButtonPressed : null,
                        !isOnline ? styles.iconButtonDisabled : null,
                      ]}
                    >
                      <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text tone="secondary">Selected restaurants will appear here.</Text>
          )
        ) : null}
      </Card>
    </View>
  ) : (
    <View style={styles.stickySummary}>
      <Card style={[styles.card, styles.interactiveSummaryCard]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isMenuSummaryExpanded }}
          onPress={() => setIsMenuSummaryExpanded((expanded) => !expanded)}
          style={styles.planHeaderRow}
        >
          <View style={styles.planHeaderContent}>
            <Text variant="label">Select Menu Items</Text>
            <Text tone="secondary">
              {activeRestaurant
                ? `${activeRestaurant.restaurantName} (${activeRestaurantFact?.selectedItemCount ?? activeSelectedItemCount} selected)`
                : 'No restaurant selected'}
            </Text>
          </View>
          <Ionicons
            color={theme.colors.text.info}
            name={isMenuSummaryExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
          />
        </Pressable>
        {isMenuSummaryExpanded ? (
          <>
            <Text tone="secondary">Choose one restaurant, then select items for the tasting plan.</Text>
            <View style={styles.switcherRow}>
              {selectedRestaurantFacts.map((restaurant) => {
                const active = activeRestaurant?.id === restaurant.id;
                return (
                  <Button
                    key={restaurant.id}
                    label={`${restaurant.restaurantName} (${restaurant.selectedItemCount})`}
                    onPress={() => {
                      setActiveRestaurantSuggestionId(restaurant.id);
                    }}
                    variant={active ? 'primary' : 'secondary'}
                  />
                );
              })}
            </View>
          </>
        ) : null}
      </Card>
    </View>
  );

  return (
    <TastingSessionLifecycleShell
      isError={sessionQuery.isError}
      loadingTitle="Loading planning"
      onBackPress={() => navigation.navigate('TastingSessions')}
      session={session}
      title="Planning"
    >
      {(availableSession) => (
        <FeatureDetailScreenScaffold
          customHeader={isRestaurantSearchFocused ? focusedRestaurantSearchHeader : undefined}
          headerBottomCompact
          headerBottomContent={
            isRestaurantSearchFocused ? undefined : (
              <StepProgressBar
                compact
                currentStep={lifecycle.step.currentStep}
                steps={TASTING_SESSION_LIFECYCLE_STEPS}
              />
            )
          }
          headerScrollMode="fixed"
          stickyHeaderIndices={isLeader ? [0] : undefined}
          onBackPress={() => {
            if (isRestaurantSearchFocused) {
              setIsRestaurantSearchFocused(false);
              return;
            }

            navigation.navigate('TastingSessions');
          }}
          rightAccessory={
            isLeader ? (
              <Pressable
                accessibilityLabel="Delete tasting session"
                accessibilityRole="button"
                disabled={!isOnline || isDeletingSession}
                hitSlop={12}
                onPress={() => setIsDeleteSessionModalVisible(true)}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed ? styles.destructiveIconButtonPressed : null,
                  !isOnline || isDeletingSession ? styles.iconButtonDisabled : null,
                ]}
                testID="delete-tasting-session-header-button"
              >
                <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
              </Pressable>
            ) : undefined
          }
          primaryAction={
            isRestaurantSearchFocused
              ? undefined
              : isLeader
              ? phase === 'restaurants'
                ? {
                    disabled: selectedRestaurants.length === 0,
                    label: 'Next',
                    onPress: () => {
                      setPhase('items');
                    },
                  }
                : {
                    disabled: !startReadiness.canStart,
                    label: 'Start Tasting',
                    onPress: handleStartTastingPress,
                  }
              : undefined
          }
          secondaryAction={
            isRestaurantSearchFocused
              ? undefined
              : isLeader && phase === 'items'
              ? {
                  label: 'Back',
                  onPress: () => {
                    setPhase('restaurants');
                  },
                }
              : undefined
          }
          subtitle={headerDescription}
          title={availableSession.name}
        >
          {isRestaurantSearchFocused ? null : summaryCard}
          {lifecycle.onlineOnly.warningMessage ? (
            <Text tone="warning">{lifecycle.onlineOnly.warningMessage}</Text>
          ) : onlineActions.message ? (
            <Text tone="warning">{onlineActions.message}</Text>
          ) : null}
          <PageErrorToast errorMessage={errorMessage} title="Planning failed" />

      {isLeader && phase === 'restaurants' ? (
        <View onTouchStart={isRestaurantSearchFocused ? dismissFocusedLocationOptions : undefined}>
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
                onPress={handleToggleRestaurantSearchExpanded}
                testID="tasting-planning-search-toggle"
              />
            }
            hideSearchCard={isRestaurantSearchFocused}
            isSearchResultsLoading={isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation}
            isUsingCurrentLocation={isUsingCurrentLocation}
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
              void handleRestaurantSearchPress();
            }}
            onSearchQueryChange={setSearchQuery}
            onSearchQueryFocus={handleRestaurantSearchQueryFocus}
            onUseCurrentLocationPress={() => {
              void handleSearchCurrentLocationByText();
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
            savedOptions={filteredDisplayedSavedRestaurants.map((restaurant, index) =>
              buildRestaurantOption(restaurant, index, 'saved'),
            )}
            savedResultsErrorMessage={savedRestaurantsErrorMessage}
            savedResultsLoading={savedRestaurantsLoading}
            savedResultsTitle={savedRestaurantsTitle}
            searchButtonDisabled={searchButtonDisabled}
            searchButtonLabel={isRestaurantSearchFocused || isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
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
        </View>
      ) : null}

      {isLeader && phase === 'items' ? (
        <>
          {activeRestaurant ? (
            <>
              <RestaurantMenuItemPicker
                addManualDisabled={!isOnline}
                currentUserId={user?.id ?? ''}
                hasError={menuItemsQuery.isError}
                isItemSelected={(item) => selectedItemIds.has(item.id)}
                isLoading={menuItemsQuery.isLoading}
                isLoadingMore={menuItemsQuery.isFetchingNextPage}
                isOnline={isOnline}
                isReviewDisabled={!isOnline || menuReviewSubmitted}
                isReviewSubmitted={menuReviewSubmitted}
                isTipVisible={isTipPopoverVisible}
                items={menuItemsQuery.data ?? []}
                hasMore={menuItemsQuery.hasNextPage}
                label={
                  menuItemSearchQuery.trim()
                    ? `Search results (${menuItemsQuery.totalItems})`
                    : `All menu items (${menuItemsQuery.totalItems})`
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
                onLoadMore={() => {
                  void menuItemsQuery.fetchNextPage();
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
                scanDisabled={scanHandoff.disabled}
                searchQuery={menuItemSearchQuery}
                selectedItems={selectedMenuItemsForPicker}
                selectionScopeKey={activeRestaurant.restaurantId}
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
      <ConfirmDestructiveModal
        cancelLabel="Keep"
        confirmLabel="Remove"
        description={
          pendingRemoveRestaurant
            ? `Remove ${pendingRemoveRestaurant.restaurantName} and its selected menu items from this tasting plan?`
            : 'Remove this restaurant and its selected menu items from this tasting plan?'
        }
        onCancel={() => setPendingRemoveRestaurantId(null)}
        onConfirm={() => {
          if (pendingRemoveRestaurant) {
            void handleRemoveRestaurant(pendingRemoveRestaurant.id);
          }
        }}
        title="Remove Restaurant?"
        visible={Boolean(pendingRemoveRestaurant)}
      />
      <ConfirmDestructiveModal
        cancelLabel="Keep Session"
        confirmLabel="Delete Session"
        confirmLoadingLabel="Deleting..."
        description={`Delete "${availableSession.name}"? This removes the lobby, invites, participants, tasting plan, and ratings.`}
        disabled={isDeletingSession}
        loading={isDeletingSession}
        onCancel={() => {
          if (!isDeletingSession) {
            setIsDeleteSessionModalVisible(false);
          }
        }}
        onConfirm={() => {
          void handleConfirmDeleteSession();
        }}
        title="Delete Tasting Session?"
        visible={isDeleteSessionModalVisible}
      />
      <Modal
        description={missingItemConfirmation.description}
        onRequestClose={() => {
          setIsMissingItemsDialogVisible(false);
        }}
        primaryAction={{
          label: 'Continue',
          onPress: () => {
            setIsMissingItemsDialogVisible(false);
            void handleStartTasting();
          },
          testID: 'tasting-missing-items-continue-button',
        }}
        secondaryAction={{
          label: 'Go Back',
          onPress: () => {
            setIsMissingItemsDialogVisible(false);
          },
          testID: 'tasting-missing-items-cancel-button',
        }}
        testID="tasting-missing-items-dialog"
        title="Continue without menu items?"
        visible={isMissingItemsDialogVisible}
      />
        </FeatureDetailScreenScaffold>
      )}
    </TastingSessionLifecycleShell>
  );
}
