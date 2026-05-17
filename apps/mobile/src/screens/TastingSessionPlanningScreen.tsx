import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  PageErrorToast,
  StatusPill,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchHeaderToggle,
  VisitRestaurantSearchOptionDescription,
  VisitRestaurantSearchSection,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  setTastingMenuItemSuggestionStatus,
  setTastingRestaurantSuggestionStatus,
  startTastingSession,
  suggestTastingMenuItem,
  suggestTastingRestaurant,
  tastingSessionsQueryKeys,
  type RestaurantRecord,
  type TastingSuggestionStatus,
  useMonthlyUsage,
} from '../features';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import type { VisitRestaurantWithDistance } from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, ListItem, Text } from '../ui';
import { getApprovedItemCount, hasPendingSuggestions } from './tastingSessions/shared';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionPlanningScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionPlanning'>;

const useStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
}));

function statusTone(status: TastingSuggestionStatus): 'info' | 'success' | 'danger' {
  return status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'info';
}

export function TastingSessionPlanningScreen({ navigation, route }: TastingSessionPlanningScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { actualUser, user } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const sessionQuery = useTastingSessionDetail(sessionId, true);
  const session = sessionQuery.data;
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantRecord | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    selectedRestaurantId: selectedRestaurant?.id ?? null,
    usage: {
      enforceQuota: shouldEnforceUsageLimitsClientSide,
      isFreeTier: isDisplayFreeUser,
      placesQueriesRemaining,
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
  };

  const runAction = async (action: () => Promise<unknown>) => {
    if (!isOnline) {
      setErrorMessage('Planning actions require a connection.');
      return;
    }
    try {
      setErrorMessage(null);
      await action();
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Planning action failed.');
    }
  };

  const buildRestaurantOption = (
    { restaurant, distance }: VisitRestaurantWithDistance,
    index: number,
    source: 'saved' | 'search',
  ): VisitRestaurantSearchOption => {
    const selected = selectedRestaurant?.id === restaurant.id;

    return {
      description: (
        <VisitRestaurantSearchOptionDescription
          distance={distance}
          restaurant={restaurant}
        />
      ),
      key: restaurant.id,
      onPress: () => {
        setSelectedRestaurant(restaurant);
        setIsSearchExpanded(true);
        setErrorMessage(null);
      },
      selected,
      testID: `tasting-planning-${source}-restaurant-option-${index}`,
      title: restaurant.name,
      trailing: (
        <VisitRestaurantOptionTrailing
          restaurant={restaurant}
          selected={selected}
        />
      ),
    };
  };

  const handleSuggestSelectedRestaurant = async () => {
    if (!selectedRestaurant) {
      return;
    }

    await runAction(async () => {
      await suggestTastingRestaurant(sessionId, {
        restaurantId: selectedRestaurant.id,
        restaurantName: selectedRestaurant.name,
      });

      setSelectedRestaurant(null);
      setSearchQuery('');
      clearPlacesSearchState();
    });
  };

  if (!session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Planning">
        <EmptyState title="Loading planning" />
      </FeatureDetailScreenScaffold>
    );
  }

  const approvedItems = getApprovedItemCount(session);
  const canStart = isLeader && !hasPendingSuggestions(session) && approvedItems > 0;

  return (
    <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} subtitle="Suggest and finalize the plan." title={session.name}>
      {!isOnline ? <Text tone="warning">Planning actions require a connection.</Text> : null}
      <PageErrorToast errorMessage={errorMessage} title="Planning failed" />

      <Card>
        <Text variant="label">Readiness</Text>
        <Text tone={hasPendingSuggestions(session) ? 'warning' : 'success'}>
          {hasPendingSuggestions(session) ? 'Resolve all pending suggestions.' : 'All suggestions resolved.'}
        </Text>
        <Text tone={approvedItems > 0 ? 'success' : 'warning'}>{approvedItems} approved items</Text>
        {isLeader ? (
          <Button
            disabled={!canStart || !isOnline}
            label="Start Tasting"
            onPress={() =>
              void runAction(async () => {
                const nextSession = await startTastingSession(sessionId);
                navigation.replace('TastingSessionTasting', { sessionId: nextSession.id });
              })
            }
          />
        ) : (
          <Text tone="secondary">The leader starts tasting when the plan is finalized.</Text>
        )}
      </Card>

      <VisitRestaurantSearchSection
        connectivityWarningMessage={!isOnline ? 'Restaurant search requires internet connection.' : null}
        currentLocationDisabled={
          !isOnline ||
          isGettingLocation ||
          isSearchingNearbyRestaurants ||
          (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
        }
        currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
        footerContent={
          selectedRestaurant ? (
            <Button
              disabled={!isOnline}
              label="Suggest Restaurant"
              onPress={() => {
                void handleSuggestSelectedRestaurant();
              }}
              variant="secondary"
            />
          ) : null
        }
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
          setSelectedRestaurant(null);
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
        onSearchQueryChange={(value) => {
          setSearchQuery(value);
          setSelectedRestaurant(null);
        }}
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

      {session.restaurants.length === 0 ? <EmptyState description="Suggest restaurants to build the tasting plan." title="No suggestions" /> : null}

      {session.restaurants.map((restaurant) => {
        const restaurantItems = restaurant.items ?? [];

        return (
          <Card key={restaurant.id}>
            <ListItem
              description={`${restaurantItems.length} suggested items`}
              title={restaurant.restaurantName}
              trailing={<StatusPill label={restaurant.status} tone={statusTone(restaurant.status)} />}
            />
            {isLeader && restaurant.status === 'pending' ? (
              <View style={styles.row}>
                <Button
                  disabled={!isOnline}
                  label="Approve"
                  onPress={() => void runAction(() => setTastingRestaurantSuggestionStatus(sessionId, restaurant.id, 'approved'))}
                  style={styles.action}
                />
                <Button
                  disabled={!isOnline}
                  label="Reject"
                  onPress={() => void runAction(() => setTastingRestaurantSuggestionStatus(sessionId, restaurant.id, 'rejected'))}
                  style={styles.action}
                  variant="secondary"
                />
              </View>
            ) : null}
            {restaurant.status !== 'rejected' ? (
              <>
                <Input
                  label="Suggest menu item"
                  onChangeText={(value) => setItemDrafts((current) => ({ ...current, [restaurant.id]: value }))}
                  placeholder="Menu item"
                  value={itemDrafts[restaurant.id] ?? ''}
                />
                <Button
                  disabled={!itemDrafts[restaurant.id]?.trim() || !isOnline}
                  label="Suggest Item"
                  onPress={() =>
                    void runAction(async () => {
                      await suggestTastingMenuItem(sessionId, restaurant.id, { name: itemDrafts[restaurant.id] ?? '' });
                      setItemDrafts((current) => ({ ...current, [restaurant.id]: '' }));
                    })
                  }
                  variant="secondary"
                />
              </>
            ) : null}
            {restaurantItems.map((item) => (
              <ListItem
                key={item.id}
                description={item.status}
                title={item.name}
                trailing={
                  isLeader && item.status === 'pending' ? (
                    <View style={styles.row}>
                      <Button
                        disabled={!isOnline}
                        label="Approve"
                        onPress={() => void runAction(() => setTastingMenuItemSuggestionStatus(sessionId, item.id, 'approved'))}
                        variant="secondary"
                      />
                      <Button
                        disabled={!isOnline}
                        label="Reject"
                        onPress={() => void runAction(() => setTastingMenuItemSuggestionStatus(sessionId, item.id, 'rejected'))}
                        variant="secondary"
                      />
                    </View>
                  ) : null
                }
              />
            ))}
          </Card>
        );
      })}
    </FeatureDetailScreenScaffold>
  );
}
