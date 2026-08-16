import { Ionicons } from "../ui/AppIcon";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";

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
import { type AllLocationsHistoryRecord } from "../features";
import { useFoodDiscoveryRestaurantDetailReadModel } from "../features/store/useFoodDiscoveryMapReadModel";
import { useRestaurantListWrites } from "../features/store/useRestaurantListWrites";
import { useWantToTryListRead } from "../features/store/useWantToTryListRead";
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
  historyBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
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

function buildHadCountLabel(orderCount: number) {
  return `Had ${formatCount(orderCount, "time")}`;
}

export function RestaurantDiscoveryRestaurantScreen({
  navigation,
  route,
}: RestaurantDiscoveryRestaurantScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
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

  const restaurantDetail = useFoodDiscoveryRestaurantDetailReadModel({
    isOnline,
    restaurant,
  });
  const { defaultListDetailQuery, defaultListId, defaultListQuery } =
    useWantToTryListRead();
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
    (restaurantDetail.groupMenuSuggestionsLoading ||
      restaurantDetail.groupMenuSuggestionsErrorMessage ||
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
        optimisticDefaultListBookmark: {
          menuItem: {
            id: menuItem.id,
            name: menuItem.name,
          },
          restaurant: {
            city: restaurant.city,
            cuisineType: restaurant.cuisineType,
            id: restaurant.id,
            latitude: restaurant.latitude,
            location: restaurant.location,
            longitude: restaurant.longitude,
            name: restaurant.name,
            visibility: restaurant.visibility,
          },
          type: "menuItem",
        },
        sourceListId: defaultListId ?? "default",
      });

      if (result.status === "completed") {
        void defaultListQuery.refetch();
        if (defaultListId) {
          void defaultListDetailQuery.refetch();
        }
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
      headerScrollMode="fixed"
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
                const orderedHistory = row.orderedHistory;
                const exactHistoryOrderCount =
                  orderedHistory?.kind === "exactLocation" &&
                  orderedHistory.orderCount > 0
                    ? orderedHistory.orderCount
                    : 0;

                return (
                  <Fragment key={item.id}>
                    <ListItem
                      description={
                        exactHistoryOrderCount > 0 ? (
                          <View style={styles.historyBadge}>
                            <Ionicons
                              color={theme.colors.text.success}
                              name="restaurant-outline"
                              size={12}
                            />
                            <Text tone="success" variant="bodySm">
                              {buildHadCountLabel(exactHistoryOrderCount)}
                            </Text>
                          </View>
                        ) : orderedHistoryLabel ? (
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
                              ? `Remove ${row.name} from Want to Try`
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
              {restaurantDetail.menuCatalogHasNextPage ? (
                <Button
                  label="Load more menu items"
                  loading={restaurantDetail.menuCatalogIsFetchingNextPage}
                  onPress={() => {
                    void restaurantDetail.fetchNextMenuCatalogPage();
                  }}
                  testID="restaurant-discovery-load-more-menu-items"
                  variant="secondary"
                />
              ) : null}
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
          {restaurantDetail.groupMenuSuggestionsLoading ? (
            <LoadingState label="Loading suggestions..." />
          ) : restaurantDetail.groupMenuSuggestionsErrorMessage ? (
            <PageErrorToast
              actionLabel="Retry"
              errorMessage="Could not load suggestions from related locations."
              onAction={() => {
                void restaurantDetail.refetchGroupMenuSuggestions();
              }}
              title="Suggestions unavailable"
            />
          ) : (
            <View style={styles.menuItemList}>
              {relatedMenuSuggestions.map((suggestion, index) => {
                const sourceRestaurantCount =
                  suggestion.sourceRestaurantCount ?? 0;

                return (
                  <Fragment key={suggestion.id}>
                    <ListItem
                      description={
                        <View style={styles.menuSuggestionDescription}>
                          <View style={styles.itemMetaRow}>
                            <Text tone="secondary" variant="bodySm">
                              Suggested from {sourceRestaurantCount}{" "}
                              {sourceRestaurantCount === 1
                                ? "related location"
                                : "related locations"}
                            </Text>
                          </View>
                        </View>
                      }
                      style={styles.menuItemListItem}
                      testID={`restaurant-discovery-related-menu-suggestion-${index}`}
                      title={suggestion.name}
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
