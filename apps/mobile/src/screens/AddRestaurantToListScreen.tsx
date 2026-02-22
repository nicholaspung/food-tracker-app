import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FeatureFormScreenScaffold,
  RatingPill,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  addRestaurantVisitRatingsToList,
  listRestaurantListItems,
  listRestaurantListItemLinks,
  listVisits,
  type VisitRecord,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type AddRestaurantToListScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'AddRestaurantToList'
>;

interface RestaurantFoodItemOption {
  id: string;
  name: string;
  rating: number;
  notes?: string;
  visitedAt: string;
}

interface VisitedRestaurantOption {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  itemCount: number;
  visitDates: string[];
  foodItems: RestaurantFoodItemOption[];
}

interface GroupedFoodItemsByDate {
  dayKey: string;
  visitDate: string;
  items: RestaurantFoodItemOption[];
}

function toTimestamp(value: string): number {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function toDayKey(value: string): string {
  const trimmed = value.trim();
  const datePartMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePartMatch?.[1]) {
    return datePartMatch[1];
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildVisitedRestaurants(
  visits: VisitRecord[],
  currentUserId: string | undefined,
): VisitedRestaurantOption[] {
  if (!currentUserId) {
    return [];
  }

  const restaurants = new Map<
    string,
    {
      id: string;
      name: string;
      location?: string;
      cuisineType?: string;
      itemCount: number;
      visitDates: Set<string>;
      foodItems: Map<string, RestaurantFoodItemOption>;
      latestVisitAt: string;
    }
  >();

  for (const visit of visits) {
    if (!visit.restaurantId || visit.userId !== currentUserId) {
      continue;
    }

    const visitTimestamp = visit.visitedAt || visit.createdAt;
    if (!visitTimestamp) {
      continue;
    }

    const existing = restaurants.get(visit.restaurantId);
    const nextLatestVisit =
      !existing ||
      toTimestamp(visitTimestamp) > toTimestamp(existing.latestVisitAt)
        ? visitTimestamp
        : existing.latestVisitAt;

    const nextRestaurant = existing ?? {
      id: visit.restaurantId,
      name: visit.restaurantName,
      location: visit.restaurantLocation,
      cuisineType: visit.restaurantCuisineType,
      itemCount: 0,
      visitDates: new Set<string>(),
      foodItems: new Map<string, RestaurantFoodItemOption>(),
      latestVisitAt: visitTimestamp,
    };

    nextRestaurant.latestVisitAt = nextLatestVisit;
    nextRestaurant.visitDates.add(visitTimestamp);
    nextRestaurant.itemCount += visit.items.length;

    for (const item of visit.items) {
      if (!item.id) {
        continue;
      }

      if (!nextRestaurant.foodItems.has(item.id)) {
        nextRestaurant.foodItems.set(item.id, {
          id: item.id,
          name: item.name,
          notes: item.notes,
          rating: item.rating,
          visitedAt: visitTimestamp,
        });
      }
    }

    restaurants.set(visit.restaurantId, nextRestaurant);
  }

  return Array.from(restaurants.values())
    .map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      location: restaurant.location,
      cuisineType: restaurant.cuisineType,
      itemCount: restaurant.itemCount,
      visitDates: Array.from(restaurant.visitDates).sort(
        (left, right) => toTimestamp(right) - toTimestamp(left),
      ),
      foodItems: Array.from(restaurant.foodItems.values()).sort(
        (left, right) =>
          toTimestamp(right.visitedAt) - toTimestamp(left.visitedAt),
      ),
    }))
    .sort(
      (left, right) =>
        toTimestamp(right.visitDates[0] ?? "") -
        toTimestamp(left.visitDates[0] ?? ""),
    );
}

export function AddRestaurantToListScreen({
  navigation,
  route,
}: AddRestaurantToListScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    string | null
  >(null);
  const [selectedFoodItemIds, setSelectedFoodItemIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visitsQuery = useQuery({
    queryKey: ["feature", "visits"],
    queryFn: listVisits,
  });

  const listItemLinksQuery = useQuery({
    queryKey: ["feature", "restaurantListItemLinks", listId],
    queryFn: () => listRestaurantListItemLinks(listId),
  });

  const listItemsQuery = useQuery({
    queryKey: ["feature", "restaurantListItems", listId],
    queryFn: () => listRestaurantListItems(listId),
  });

  const visitedRestaurants = useMemo(
    () => buildVisitedRestaurants(visitsQuery.data ?? [], user?.id),
    [user?.id, visitsQuery.data],
  );

  const existingRestaurantIds = useMemo(() => {
    return new Set(
      (listItemLinksQuery.data ?? []).map((item) => item.restaurantId),
    );
  }, [listItemLinksQuery.data]);

  const existingFoodItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of listItemLinksQuery.data ?? []) {
      if (item.foodItemId) {
        ids.add(item.foodItemId);
      }
      if (item.userFoodItemId) {
        ids.add(item.userFoodItemId);
      }
      for (const recommendedItemId of item.recommendedItemIds ?? []) {
        ids.add(recommendedItemId);
      }
    }
    return ids;
  }, [listItemLinksQuery.data]);

  const filteredRestaurants = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return visitedRestaurants;
    }

    return visitedRestaurants.filter((restaurant) => {
      return (
        restaurant.name.toLowerCase().includes(normalizedQuery) ||
        (restaurant.location?.toLowerCase().includes(normalizedQuery) ??
          false) ||
        (restaurant.cuisineType?.toLowerCase().includes(normalizedQuery) ??
          false)
      );
    });
  }, [searchQuery, visitedRestaurants]);

  const selectedRestaurant = useMemo(
    () =>
      visitedRestaurants.find(
        (restaurant) => restaurant.id === selectedRestaurantId,
      ) ?? null,
    [selectedRestaurantId, visitedRestaurants],
  );

  const selectedRestaurantAlreadyInList = Boolean(
    selectedRestaurant?.id && existingRestaurantIds.has(selectedRestaurant.id),
  );

  const selectedNewFoodItemIds = useMemo(
    () =>
      selectedFoodItemIds.filter(
        (foodItemId) => !existingFoodItemIds.has(foodItemId),
      ),
    [existingFoodItemIds, selectedFoodItemIds],
  );

  const groupedFoodItems = useMemo<GroupedFoodItemsByDate[]>(() => {
    if (!selectedRestaurant) {
      return [];
    }

    const groups = new Map<string, GroupedFoodItemsByDate>();

    for (const item of selectedRestaurant.foodItems) {
      const dayKey = toDayKey(item.visitedAt);
      const existingGroup = groups.get(dayKey);
      if (existingGroup) {
        existingGroup.items.push(item);
        continue;
      }

      groups.set(dayKey, {
        dayKey,
        visitDate: item.visitedAt,
        items: [item],
      });
    }

    return Array.from(groups.values())
      .sort(
        (left, right) =>
          toTimestamp(right.visitDate) - toTimestamp(left.visitDate),
      )
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => {
          if (left.rating !== right.rating) {
            return right.rating - left.rating;
          }
          return left.name.localeCompare(right.name);
        }),
      }));
  }, [selectedRestaurant]);

  const existingRestaurantNoteById = useMemo(() => {
    const noteByRestaurantId = new Map<string, string>();
    for (const listItem of listItemsQuery.data ?? []) {
      const trimmedNote = listItem.note?.trim();
      if (!trimmedNote || noteByRestaurantId.has(listItem.restaurantId)) {
        continue;
      }
      noteByRestaurantId.set(listItem.restaurantId, trimmedNote);
    }
    return noteByRestaurantId;
  }, [listItemsQuery.data]);

  const styles = StyleSheet.create({
    section: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 19,
    },
    sectionDescription: {
      color: theme.colors.text.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    cardList: {
      gap: theme.spacing.sm,
    },
    restaurantCard: {
      gap: theme.spacing.xs,
    },
    restaurantHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    restaurantTitleWrap: {
      flex: 1,
      gap: 2,
      paddingRight: theme.spacing.sm,
    },
    restaurantTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 20,
    },
    restaurantSubtitle: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    restaurantMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    disabledCard: {
      opacity: 0.55,
    },
    selectedCard: {
      borderColor: theme.colors.border.warning,
      backgroundColor: theme.colors.status.warningBg,
    },
    selectedRestaurantMeta: {
      gap: theme.spacing.xxs,
    },
    alreadyInListBanner: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xxs,
    },
    alreadyInListText: {
      color: theme.colors.text.secondary,
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
    },
    dateGroupCard: {
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    },
    dateGroupTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    foodItemRow: {
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.background.surface,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    foodItemRowSelected: {
      borderColor: theme.colors.border.warning,
      backgroundColor: theme.colors.status.warningBg,
    },
    foodItemRowDisabled: {
      opacity: 0.6,
    },
    foodItemHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    foodItemTitleWrap: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    foodItemTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 18,
    },
    foodItemNote: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      lineHeight: 16,
    },
    foodItemMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
  });

  const handleBackToListDetail = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("ListDetail", { listId });
  };

  const handleSelectRestaurant = (restaurant: VisitedRestaurantOption) => {
    const availableItemCount = restaurant.foodItems.filter(
      (item) => !existingFoodItemIds.has(item.id),
    ).length;
    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_RESTAURANT_SELECTED', {
      source: 'AddRestaurantToListScreen',
      listId,
      restaurantId: restaurant.id,
      alreadyInList: existingRestaurantIds.has(restaurant.id),
      availableItemCount,
    });
    setErrorMessage(null);
    setSelectedRestaurantId(restaurant.id);
    setSelectedFoodItemIds([]);
    setNote(existingRestaurantNoteById.get(restaurant.id) ?? "");
    setNoteDirty(false);
  };

  const handleBackToRestaurantSearch = () => {
    setErrorMessage(null);
    setSelectedRestaurantId(null);
    setSelectedFoodItemIds([]);
    setNote("");
    setNoteDirty(false);
  };

  const handleToggleFoodItem = (foodItemId: string) => {
    if (existingFoodItemIds.has(foodItemId)) {
      return;
    }

    setSelectedFoodItemIds((previous) => {
      const isSelected = previous.includes(foodItemId);
      const nextIds = isSelected
        ? previous.filter((id) => id !== foodItemId)
        : [...previous, foodItemId];
      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_FOOD_ITEM_TOGGLED', {
        source: 'AddRestaurantToListScreen',
        listId,
        foodItemId,
        selected: !isSelected,
        selectedFoodItemCount: nextIds.length,
      });
      return nextIds;
    });
  };

  const handleSubmit = async () => {
    if (!selectedRestaurant) {
      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_VALIDATION_FAILED', {
        source: 'AddRestaurantToListScreen',
        listId,
        reason: 'missing_restaurant',
      });
      setErrorMessage("Please choose a restaurant.");
      return;
    }

    if (
      selectedRestaurantAlreadyInList &&
      selectedNewFoodItemIds.length === 0 &&
      !note.trim()
    ) {
      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_VALIDATION_FAILED', {
        source: 'AddRestaurantToListScreen',
        listId,
        restaurantId: selectedRestaurant.id,
        reason: 'missing_items_or_note',
      });
      setErrorMessage("Select at least one new item or add a note.");
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_STARTED', {
      source: 'AddRestaurantToListScreen',
      listId,
      restaurantId: selectedRestaurant.id,
      selectedFoodItemCount: selectedNewFoodItemIds.length,
      includesNote: note.trim().length > 0,
      isOnline,
    });
    setIsSubmitting(true);

    try {
      const addInput = {
        listId,
        restaurantId: selectedRestaurant.id,
        foodItemIds: selectedNewFoodItemIds,
        note: noteDirty ? note : undefined,
      };

      if (!isOnline) {
        await queueFeatureOutbox("list.restaurant.add", addInput);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["feature", "restaurantList", listId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["feature", "restaurantListItems", listId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["feature", "restaurantListItemLinks", listId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["feature", "restaurantLists"],
          }),
        ]);
        trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_SUCCEEDED', {
          source: 'AddRestaurantToListScreen',
          listId,
          restaurantId: selectedRestaurant.id,
          selectedFoodItemCount: selectedNewFoodItemIds.length,
          queued: true,
        });
        showQueuedOfflineAlert("List updates");
        handleBackToListDetail();
        return;
      }

      await queueWrite("list.restaurant.add");
      await addRestaurantVisitRatingsToList(addInput);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["feature", "restaurantList", listId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["feature", "restaurantListItems", listId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["feature", "restaurantListItemLinks", listId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["feature", "restaurantLists"],
        }),
      ]);

      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_SUCCEEDED', {
        source: 'AddRestaurantToListScreen',
        listId,
        restaurantId: selectedRestaurant.id,
        selectedFoodItemCount: selectedNewFoodItemIds.length,
        queued: false,
      });
      handleBackToListDetail();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not add items to this list.";
      setErrorMessage(message);
      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_FAILED', {
        source: 'AddRestaurantToListScreen',
        listId,
        restaurantId: selectedRestaurant.id,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedRestaurantAddDisabled =
    isSubmitting ||
    (selectedRestaurantAlreadyInList &&
      selectedNewFoodItemIds.length === 0 &&
      !note.trim());

  return (
    <FeatureFormScreenScaffold
      onBackPress={
        selectedRestaurant
          ? handleBackToRestaurantSearch
          : handleBackToListDetail
      }
      primaryAction={
        selectedRestaurant
          ? {
              disabled: selectedRestaurantAddDisabled,
              label: isSubmitting
                ? "Saving..."
                : selectedRestaurantAlreadyInList
                  ? "Add Items"
                  : "Add to List",
              onPress: () => {
                void handleSubmit();
              },
            }
          : {
              disabled: false,
              label: "Cancel",
              onPress: handleBackToListDetail,
              variant: "secondary",
            }
      }
      secondaryAction={
        selectedRestaurant
          ? {
              disabled: isSubmitting,
              label: "Back",
              onPress: handleBackToRestaurantSearch,
              variant: "secondary",
            }
          : undefined
      }
      subtitle={
        selectedRestaurant
          ? "Select menu items you recommend and add an optional note."
          : "Search for a restaurant you've visited."
      }
      title={
        selectedRestaurant
          ? `Add ${selectedRestaurant.name}`
          : "Add Restaurant to List"
      }
    >
      <PageErrorToast
        errorMessage={errorMessage}
        title="Could not update list"
      />

      <PageErrorToast
        actionLabel="Retry"
        errorMessage={
          visitsQuery.isError ? "Could not load your visits." : null
        }
        onAction={() => {
          void visitsQuery.refetch();
        }}
        title="Visits unavailable"
      />

      <PageErrorToast
        actionLabel="Retry"
        errorMessage={
          listItemLinksQuery.isError ? "Could not load list item state." : null
        }
        onAction={() => {
          void listItemLinksQuery.refetch();
        }}
        title="List state unavailable"
      />

      <PageErrorToast
        actionLabel="Retry"
        errorMessage={
          listItemsQuery.isError ? "Could not load current notes for this list." : null
        }
        onAction={() => {
          void listItemsQuery.refetch();
        }}
        title="Notes unavailable"
      />

      {!selectedRestaurant ? (
        <>
          <Input
            autoCapitalize="none"
            autoFocus
            label="Search restaurants"
            onChangeText={setSearchQuery}
            placeholder="Search restaurants..."
            value={searchQuery}
          />

          {visitsQuery.isLoading || listItemLinksQuery.isLoading || listItemsQuery.isLoading ? (
            <View style={styles.cardList}>
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
            </View>
          ) : null}

          {!visitsQuery.isLoading &&
          !listItemLinksQuery.isLoading &&
          !listItemsQuery.isLoading &&
          !visitsQuery.isError &&
          !listItemLinksQuery.isError &&
          !listItemsQuery.isError &&
          filteredRestaurants.length === 0 ? (
            <EmptyState
              description={
                searchQuery.trim()
                  ? "No matching visited restaurants found."
                  : "Visit a restaurant and rate items first."
              }
              title={
                searchQuery.trim()
                  ? "No matching restaurants"
                  : "No visited restaurants yet"
              }
            />
          ) : null}

          {!visitsQuery.isLoading &&
          !listItemLinksQuery.isLoading &&
          !listItemsQuery.isLoading &&
          !visitsQuery.isError &&
          !listItemLinksQuery.isError &&
          !listItemsQuery.isError &&
          filteredRestaurants.length > 0 ? (
            <View style={styles.cardList}>
              {filteredRestaurants.map((restaurant) => {
                const availableItemCount = restaurant.foodItems.filter(
                  (item) => !existingFoodItemIds.has(item.id),
                ).length;
                const allItemsAdded =
                  restaurant.foodItems.length > 0 && availableItemCount === 0;
                const alreadyAdded = existingRestaurantIds.has(restaurant.id);

                const metadataLabel = `${restaurant.itemCount} ${restaurant.itemCount === 1 ? "rated item" : "rated items"}`;

                return (
                  <Card
                    key={restaurant.id}
                    style={[
                      styles.restaurantCard,
                      allItemsAdded ? styles.disabledCard : null,
                    ]}
                    tone="default"
                  >
                    <Pressable
                      accessibilityRole="button"
                      disabled={allItemsAdded}
                      onPress={() => {
                        handleSelectRestaurant(restaurant);
                      }}
                    >
                      <View style={styles.restaurantHeaderRow}>
                        <View style={styles.restaurantTitleWrap}>
                          <Text style={styles.restaurantTitle}>
                            {restaurant.name}
                          </Text>
                          <Text style={styles.restaurantSubtitle}>
                            {[restaurant.location, restaurant.cuisineType]
                              .filter(Boolean)
                              .join(" • ") || metadataLabel}
                          </Text>
                        </View>
                        {allItemsAdded ? (
                          <StatusPill label="All items added" tone="success" />
                        ) : alreadyAdded ? (
                          <StatusPill
                            label={`${availableItemCount} left`}
                            tone="warning"
                          />
                        ) : (
                          <StatusPill label={metadataLabel} tone="muted" />
                        )}
                      </View>
                      {restaurant.visitDates[0] ? (
                        <Text style={styles.restaurantMeta}>
                          Latest visit{" "}
                          {formatDisplayDate(restaurant.visitDates[0])}
                        </Text>
                      ) : null}
                    </Pressable>
                  </Card>
                );
              })}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Card style={styles.selectedCard} tone="default">
            <View style={styles.selectedRestaurantMeta}>
              <Text style={styles.restaurantTitle}>
                {selectedRestaurant.name}
              </Text>
              <Text style={styles.restaurantSubtitle}>
                {[selectedRestaurant.location, selectedRestaurant.cuisineType]
                  .filter(Boolean)
                  .join(" • ") || `${selectedRestaurant.itemCount} rated items`}
              </Text>
              {selectedRestaurantAlreadyInList ? (
                <View style={styles.alreadyInListBanner}>
                  <Ionicons
                    color={theme.colors.text.warning}
                    name="checkmark-circle-outline"
                    size={14}
                  />
                  <Text style={styles.alreadyInListText}>
                    Already in this list. Add more rated items below.
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Recommended Items (Optional)
            </Text>
            <Text style={styles.sectionDescription}>
              Select items you have rated. Items already in this list are marked
              as added.
            </Text>

            {groupedFoodItems.length === 0 ? (
              <EmptyState
                description="No rated items found for this restaurant."
                title="No items available"
              />
            ) : (
              <View style={styles.cardList}>
                {groupedFoodItems.map((group) => (
                  <Card
                    key={group.dayKey}
                    style={styles.dateGroupCard}
                    tone="default"
                  >
                    <View style={styles.dateGroupTitleRow}>
                      <Ionicons
                        color={theme.colors.text.muted}
                        name="calendar-outline"
                        size={15}
                      />
                      <Text variant="label">
                        {formatDisplayDate(group.visitDate)}
                      </Text>
                      <Text tone="muted">{`(${group.items.length})`}</Text>
                    </View>

                    <View style={styles.cardList}>
                      {group.items.map((item) => {
                        const isAlreadyAdded = existingFoodItemIds.has(item.id);
                        const isSelected = selectedFoodItemIds.includes(
                          item.id,
                        );

                        return (
                          <Pressable
                            accessibilityRole="button"
                            disabled={isAlreadyAdded}
                            key={item.id}
                            onPress={() => {
                              handleToggleFoodItem(item.id);
                            }}
                            style={[
                              styles.foodItemRow,
                              isSelected ? styles.foodItemRowSelected : null,
                              isAlreadyAdded
                                ? styles.foodItemRowDisabled
                                : null,
                            ]}
                          >
                            <View style={styles.foodItemHeader}>
                              <View style={styles.foodItemTitleWrap}>
                                <Text style={styles.foodItemTitle}>
                                  {item.name}
                                </Text>
                                {item.notes ? (
                                  <Text style={styles.foodItemNote}>
                                    {item.notes}
                                  </Text>
                                ) : null}
                              </View>
                              {isAlreadyAdded ? (
                                <StatusPill label="Added" tone="success" />
                              ) : isSelected ? (
                                <Ionicons
                                  color={theme.colors.text.warning}
                                  name="checkmark-circle"
                                  size={18}
                                />
                              ) : (
                                <Ionicons
                                  color={theme.colors.text.muted}
                                  name="ellipse-outline"
                                  size={18}
                                />
                              )}
                            </View>
                            <View style={styles.foodItemMetaRow}>
                              <RatingPill rating={item.rating} />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Input
              label="General note (optional)"
              maxLength={300}
              multiline
              onChangeText={(value) => {
                setNote(value);
                setNoteDirty(true);
              }}
              placeholder="Why do you recommend this restaurant?"
              value={note}
            />
            <Text tone="muted">{`${note.length}/300`}</Text>
          </View>
        </>
      )}
    </FeatureFormScreenScaffold>
  );
}
