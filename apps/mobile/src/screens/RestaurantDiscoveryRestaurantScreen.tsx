import { Ionicons } from "../ui/AppIcon";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  LoadingState,
  PageErrorToast,
  RatingPill,
  SegmentedControl,
  type SegmentedControlOption,
  VisitRestaurantOptionTrailing,
  WantToTryBookmarkButton,
} from "../components/shared";
import {
  type AllLocationsHistoryRecord,
  type GroupMenuSuggestionsRecord,
} from "../features";
import { restaurantListQueryKeys } from "../features/store/restaurantListQuery";
import {
  getDefaultRestaurantList,
  getRestaurantListDetail,
  type RestaurantListDetailRecord,
} from "../features/store/restaurantListsStore";
import { restaurantsQueryKeys } from "../features/store/restaurantsQuery";
import { getGroupMenuSuggestionsForRestaurant } from "../features/store/restaurantsStore";
import { useFoodDiscoveryRestaurantDetailReadModel } from "../features/store/useFoodDiscoveryMapReadModel";
import { useRestaurantListWrites } from "../features/store/useRestaurantListWrites";
import type { MenuItemRecord } from "../features/store/featureStore";
import { buildVisitRestaurantDescription } from "../lib/visitRestaurantSearch";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useConnectivity } from "../providers/ConnectivityProvider";
import { createThemedStyles, useTheme } from "../theme";
import { Button, Card, ListItem, Text } from "../ui";

type RestaurantDiscoveryRestaurantScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "RestaurantDiscoveryRestaurant"
>;
type RestaurantDetailScope = "location" | "allLocations";

const RESTAURANT_DETAIL_SCOPE_OPTIONS: readonly SegmentedControlOption<RestaurantDetailScope>[] =
  [
    { label: "This Location", value: "location" },
    { label: "All Locations", value: "allLocations" },
  ];

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  iconTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  itemDescription: {
    gap: theme.spacing.xxs,
  },
  itemMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  menuItemListItem: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 0,
  },
  menuItemList: {
    gap: 0,
  },
  menuSuggestionDescription: {
    gap: theme.spacing.xxs,
  },
  menuSuggestionRow: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
  },
  menuItemSeparator: {
    backgroundColor: theme.colors.border.subtle,
    height: 1,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
}));

function addQueuedMenuItemBookmarkToDefaultListDetail(
  currentDetail: RestaurantListDetailRecord | null | undefined,
  input: {
    listId: string;
    menuItem: MenuItemRecord;
    restaurant: ReturnType<typeof buildRestaurantFromRoute>;
  },
): RestaurantListDetailRecord {
  const currentItems = currentDetail?.items ?? [];
  const existingRestaurantItem = currentItems.find(
    (item) => item.restaurantId === input.restaurant.id,
  );
  if (
    existingRestaurantItem?.bookmarkedItems.some(
      (bookmarkedItem) => bookmarkedItem.userFoodItemId === input.menuItem.id,
    )
  ) {
    return (
      currentDetail ?? {
        list: null,
        items: currentItems,
        bookmarkState: { savedListIdsByBookmarkLookupId: {} },
        photoPreviews: [],
        viewerLists: [],
      }
    );
  }

  const createdAt = new Date().toISOString();
  const listItemId =
    existingRestaurantItem?.id ??
    `queued:want-to-try-restaurant:${input.restaurant.id}`;
  const queuedBookmarkedItem = {
    id: `queued:want-to-try-menu-item:${input.menuItem.id}`,
    listItemId,
    menuItemId: input.menuItem.id,
    name: input.menuItem.name,
    rating: 0,
  };

  const nextItems = existingRestaurantItem
    ? currentItems.map((item) =>
        item.id === existingRestaurantItem.id
          ? {
              ...item,
              bookmarkedItems: [queuedBookmarkedItem, ...item.bookmarkedItems],
            }
          : item,
      )
    : [
        {
          id: listItemId,
          listId: input.listId,
          restaurantId: input.restaurant.id,
          restaurantName: input.restaurant.name,
          restaurantLocation: input.restaurant.location,
          restaurantCity: input.restaurant.city,
          restaurantCuisineType: input.restaurant.cuisineType,
          restaurantVisibility: input.restaurant.visibility,
          latitude: input.restaurant.latitude,
          longitude: input.restaurant.longitude,
          position: currentItems.length,
          bookmarkedItems: [queuedBookmarkedItem],
          createdAt,
        },
        ...currentItems,
      ];

  return {
    list: currentDetail?.list ?? null,
    items: nextItems,
    bookmarkState: currentDetail?.bookmarkState ?? {
      savedListIdsByBookmarkLookupId: {},
    },
    photoPreviews: currentDetail?.photoPreviews ?? [],
    viewerLists: currentDetail?.viewerLists ?? [],
  };
}

function buildRestaurantFromRoute(
  params: RootStackParamList["RestaurantDiscoveryRestaurant"],
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

function buildLatestLocationLabel(
  item: AllLocationsHistoryRecord["items"][number],
) {
  const parts = [
    item.latestRestaurantName,
    item.latestRestaurantLocation,
  ].filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  return `Latest at ${parts.join(" • ")}`;
}

function buildEmptyGroupMenuSuggestions(
  restaurantId: string,
): GroupMenuSuggestionsRecord {
  return {
    restaurantId,
    suggestions: [],
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
  const restaurantListWrites = useRestaurantListWrites();
  const restaurant = useMemo(
    () => buildRestaurantFromRoute(route.params),
    [route.params],
  );
  const [detailScope, setDetailScope] =
    useState<RestaurantDetailScope>("location");
  const [locallySavedMenuItemIds, setLocallySavedMenuItemIds] = useState<
    Set<string>
  >(() => new Set());
  const [locallyRemovedMenuItemIds, setLocallyRemovedMenuItemIds] = useState<
    Set<string>
  >(() => new Set());
  const [bookmarkErrorMessage, setBookmarkErrorMessage] = useState<
    string | null
  >(null);
  const [isBookmarkSubmitting, setIsBookmarkSubmitting] = useState(false);
  const restaurantDescription = useMemo(() => {
    const parts = [buildVisitRestaurantDescription(restaurant, null)];
    if (restaurant.userVisitCount && restaurant.userVisitCount > 0) {
      parts.push(
        `You: ${restaurant.userVisitCount} ${restaurant.userVisitCount === 1 ? "visit" : "visits"}`,
      );
    }
    if (restaurant.friendCount && restaurant.friendCount > 0) {
      parts.push(
        `Friends: ${restaurant.friendCount} ${restaurant.friendCount === 1 ? "friend" : "friends"}`,
      );
    }
    if (restaurant.isGooglePlace) {
      parts.push("Google place");
    } else if (restaurant.visibility) {
      parts.push(restaurant.visibility);
    }
    return parts.filter(Boolean).join(" • ");
  }, [restaurant]);

  const groupMenuSuggestionsQuery = useQuery({
    enabled: Boolean(restaurant.id),
    queryKey: restaurantsQueryKeys.groupMenuSuggestions(restaurant.id),
    queryFn: ({ signal }): Promise<GroupMenuSuggestionsRecord> => {
      const emptySuggestions = buildEmptyGroupMenuSuggestions(restaurant.id);
      if (!restaurant.id) {
        return Promise.resolve(emptySuggestions);
      }

      if (!isOnline) {
        return Promise.resolve(
          queryClient.getQueryData<GroupMenuSuggestionsRecord>(
            restaurantsQueryKeys.groupMenuSuggestions(restaurant.id),
          ) ?? emptySuggestions,
        );
      }

      return getGroupMenuSuggestionsForRestaurant(restaurant.id, { signal });
    },
  });
  const restaurantDetail = useFoodDiscoveryRestaurantDetailReadModel({
    groupMenuSuggestions: groupMenuSuggestionsQuery.data,
    isOnline,
    restaurant,
  });
  const defaultListQuery = useQuery({
    queryKey: restaurantListQueryKeys.defaultList,
    queryFn: ({ signal }) => getDefaultRestaurantList({ signal }),
  });
  const defaultListId = defaultListQuery.data?.id;
  const defaultListDetailQuery = useQuery({
    enabled: Boolean(defaultListId),
    queryKey: defaultListId
      ? restaurantListQueryKeys.detail(defaultListId)
      : restaurantListQueryKeys.detail("__default_list_pending__"),
    queryFn: ({ signal }) =>
      defaultListId ? getRestaurantListDetail(defaultListId, { signal }) : null,
  });
  const savedMenuItemIds = useMemo(() => {
    const ids = new Set(locallySavedMenuItemIds);
    for (const item of defaultListDetailQuery.data?.items ?? []) {
      if (item.restaurantId !== restaurant.id) {
        continue;
      }
      for (const bookmarkedItem of item.bookmarkedItems) {
        if (bookmarkedItem.menuItemId) {
          ids.add(bookmarkedItem.menuItemId);
        }
        if (bookmarkedItem.userFoodItemId) {
          ids.add(bookmarkedItem.userFoodItemId);
        }
      }
    }
    for (const menuItemId of locallyRemovedMenuItemIds) {
      ids.delete(menuItemId);
    }
    return ids;
  }, [
    defaultListDetailQuery.data?.items,
    locallyRemovedMenuItemIds,
    locallySavedMenuItemIds,
    restaurant.id,
  ]);

  const allLocationsHistory = restaurantDetail.allLocationsHistory;
  const relatedMenuSuggestions = restaurantDetail.relatedMenuSuggestions;
  const menuItemById = useMemo(
    () => new Map(restaurantDetail.menuItems.map((item) => [item.id, item])),
    [restaurantDetail.menuItems],
  );
  const showRelatedMenuSuggestions =
    detailScope === "location" &&
    !restaurantDetail.menuCatalogLoading &&
    !restaurantDetail.menuCatalogErrorMessage &&
    (groupMenuSuggestionsQuery.isLoading ||
      groupMenuSuggestionsQuery.isError ||
      relatedMenuSuggestions.length > 0);

  async function handleToggleMenuItemWantToTry(menuItem: MenuItemRecord) {
    if (savedMenuItemIds.has(menuItem.id)) {
      if (!defaultListId) {
        return;
      }

      setBookmarkErrorMessage(null);
      setIsBookmarkSubmitting(true);
      setLocallyRemovedMenuItemIds((current) =>
        new Set(current).add(menuItem.id),
      );
      setLocallySavedMenuItemIds((current) => {
        const next = new Set(current);
        next.delete(menuItem.id);
        return next;
      });

      try {
        const result = await restaurantListWrites.removeBookmarkFromDefaultList(
          {
            bookmark: {
              restaurantId: restaurant.id,
              menuItemId: menuItem.id,
            },
            defaultListId,
            sourceListId: defaultListId,
          },
        );

        if (result.status === "completed") {
          void defaultListQuery.refetch();
          void defaultListDetailQuery.refetch();
        }
      } catch (error) {
        setLocallyRemovedMenuItemIds((current) => {
          const next = new Set(current);
          next.delete(menuItem.id);
          return next;
        });
        setBookmarkErrorMessage(
          error instanceof Error ? error.message : "Could not remove bookmark.",
        );
      } finally {
        setIsBookmarkSubmitting(false);
      }
      return;
    }

    setBookmarkErrorMessage(null);
    setIsBookmarkSubmitting(true);
    setLocallySavedMenuItemIds((current) => new Set(current).add(menuItem.id));
    setLocallyRemovedMenuItemIds((current) => {
      const next = new Set(current);
      next.delete(menuItem.id);
      return next;
    });

    try {
      const result = await restaurantListWrites.saveBookmarkToDefaultList({
        bookmark: {
          restaurantId: restaurant.id,
          menuItemId: menuItem.id,
        },
        defaultListId,
        sourceListId: defaultListId ?? "default",
      });

      if (result.status === "completed") {
        void defaultListQuery.refetch();
        if (defaultListId) {
          void defaultListDetailQuery.refetch();
        }
      } else if (defaultListId) {
        queryClient.setQueryData<RestaurantListDetailRecord | null | undefined>(
          restaurantListQueryKeys.detail(defaultListId),
          (currentDetail) =>
            addQueuedMenuItemBookmarkToDefaultListDetail(currentDetail, {
              listId: defaultListId,
              menuItem,
              restaurant,
            }),
        );
      }
    } catch (error) {
      setLocallySavedMenuItemIds((current) => {
        const next = new Set(current);
        next.delete(menuItem.id);
        return next;
      });
      setBookmarkErrorMessage(
        error instanceof Error ? error.message : "Could not save bookmark.",
      );
    } finally {
      setIsBookmarkSubmitting(false);
    }
  }

  return (
    <FeatureDetailScreenScaffold
      onBackPress={() => {
        navigation.goBack();
      }}
      subtitle={restaurantDescription}
      title={restaurant.name}
      rightAccessory={
        <VisitRestaurantOptionTrailing
          restaurant={restaurant}
          selected={false}
        />
      }
      testID="restaurant-discovery-restaurant-screen"
    >
      <Card style={styles.card}>
        <View style={styles.iconTitle}>
          <Ionicons
            color={theme.colors.text.brand}
            name="flash-outline"
            size={18}
          />
          <Text variant="label">Actions</Text>
        </View>
        <Button
          disabled={!isOnline}
          label="Scan Menu Items"
          onPress={() => {
            navigation.navigate("ProcessPhotos", {
              autoStartSourcePicker: false,
              mode: "menu_scan",
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              returnTo: "RestaurantDiscoveryRestaurant",
              returnToRestaurantDiscoveryRestaurantParams: route.params,
            });
          }}
        />
        {!isOnline ? (
          <Text tone="warning">
            Menu scanning requires internet connection.
          </Text>
        ) : null}
        <Button
          label="Track Visit With This Restaurant"
          onPress={() => {
            navigation.navigate("CreateVisit", {
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

      {detailScope === "allLocations" &&
      restaurantDetail.canShowAllLocations ? (
        <Card style={styles.card}>
          <Text variant="label">Ordered Across Locations</Text>
          {allLocationsHistory ? (
            <View style={styles.summaryRow}>
              <Text tone="secondary">
                {formatCount(allLocationsHistory.visitCount, "ordered visit")}
              </Text>
              <Text tone="secondary">
                {formatCount(allLocationsHistory.locationCount, "location")}
              </Text>
              <Text tone="secondary">
                {formatCount(allLocationsHistory.itemCount, "item")}
              </Text>
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
                        <Text tone="secondary">
                          {formatCount(item.orderCount, "order")}
                        </Text>
                        {item.latestRating > 0 ? (
                          <RatingPill rating={item.latestRating} />
                        ) : (
                          <Text tone="secondary">unrated</Text>
                        )}
                      </View>
                      {latestLocationLabel ? (
                        <Text
                          numberOfLines={1}
                          tone="secondary"
                          variant="bodySm"
                        >
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
            <View style={styles.menuItemList}>
              {restaurantDetail.menuCatalogRows.map((row, index) => {
                const item = menuItemById.get(row.id);
                if (!item) {
                  return null;
                }
                const isSaved = savedMenuItemIds.has(item.id);
                const orderedHistoryLabel = row.meta.find(
                  (meta) => meta.label,
                )?.label;

                return (
                  <Fragment key={item.id}>
                    <ListItem
                      description={
                        orderedHistoryLabel ? (
                          <Text tone="secondary" variant="bodySm">
                            {orderedHistoryLabel}
                          </Text>
                        ) : undefined
                      }
                      style={styles.menuItemListItem}
                      title={row.name}
                      trailing={
                        <WantToTryBookmarkButton
                          accessibilityLabel={
                            isSaved
                              ? `${row.name} is saved to Want to Try`
                              : `Save ${row.name} to Want to Try`
                          }
                          loading={isBookmarkSubmitting}
                          onPress={() => {
                            void handleToggleMenuItemWantToTry(item);
                          }}
                          saved={isSaved}
                          testID={`restaurant-discovery-menu-item-bookmark-${index}`}
                          variant="inline"
                        />
                      }
                    />
                    {index < restaurantDetail.menuItems.length - 1 ? (
                      <View style={styles.menuItemSeparator} />
                    ) : null}
                  </Fragment>
                );
              })}
            </View>
          ) : (
            <EmptyState
              description="Scan a menu photo to add items for this restaurant."
              title="No menu items yet"
            />
          )}
          <PageErrorToast
            errorMessage={bookmarkErrorMessage}
            title="Could not save bookmark"
          />
        </Card>
      )}

      {showRelatedMenuSuggestions ? (
        <Card style={styles.card}>
          <Text variant="label">Suggested From Related Locations</Text>
          {groupMenuSuggestionsQuery.isLoading ? (
            <LoadingState label="Loading suggestions..." />
          ) : groupMenuSuggestionsQuery.isError ? (
            <PageErrorToast
              actionLabel="Retry"
              errorMessage="Could not load suggestions from related locations."
              onAction={() => {
                void groupMenuSuggestionsQuery.refetch();
              }}
              title="Suggestions unavailable"
            />
          ) : (
            <View style={styles.menuItemList}>
              {relatedMenuSuggestions.map((suggestion, index) => {
                const sourceRestaurantCount =
                  suggestion.sourceRestaurantCount ?? 0;
                const sourceItemCount = suggestion.sourceItemCount ?? 0;

                return (
                  <Fragment key={suggestion.id}>
                    <ListItem
                      description={
                        <View style={styles.menuSuggestionDescription}>
                          {suggestion.orderedHistory ? (
                            <Text tone="secondary" variant="bodySm">
                              {suggestion.orderedHistory.label}
                            </Text>
                          ) : null}
                          <View style={styles.itemMetaRow}>
                            <Text tone="secondary" variant="bodySm">
                              Suggested from {sourceRestaurantCount}{" "}
                              {sourceRestaurantCount === 1
                                ? "related location"
                                : "related locations"}
                            </Text>
                          </View>
                          <Text tone="secondary" variant="bodySm">
                            Starts a visit here with this item preselected.
                          </Text>
                        </View>
                      }
                      onPress={() => {
                        navigation.navigate("CreateVisit", {
                          preselectedRestaurantId: restaurant.id,
                          preselectedRestaurantName: restaurant.name,
                          preselectedMenuItemId: suggestion.id,
                          preselectedMenuItemName: suggestion.name,
                          preselectedMenuItemSuggestionSource:
                            suggestion.suggestionSource,
                        });
                      }}
                      style={styles.menuSuggestionRow}
                      testID={`restaurant-discovery-related-menu-suggestion-${index}`}
                      title={suggestion.name}
                      trailing={
                        <Ionicons
                          color={theme.colors.text.brand}
                          name="chevron-forward"
                          size={18}
                        />
                      }
                    />
                    {index < relatedMenuSuggestions.length - 1 ? (
                      <View style={styles.menuItemSeparator} />
                    ) : null}
                  </Fragment>
                );
              })}
            </View>
          )}
        </Card>
      ) : null}
    </FeatureDetailScreenScaffold>
  );
}
