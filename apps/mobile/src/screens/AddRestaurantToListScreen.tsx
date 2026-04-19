import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import {
  EmptyState,
  FeatureFormScreenScaffold,
  PhotoViewerModal,
  RatingPill,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  addRestaurantVisitRatingsToList,
  buildPocketBaseFileUrl,
  getRestaurantListCandidateRestaurants,
  invalidateRestaurantListContentQueries,
  listRestaurantListCandidateFoodItemPhotos,
  restaurantListQueryKeys,
  type RestaurantListVisitedRestaurantCandidate,
  type RestaurantListVisitedRestaurantFoodItem,
  type VisitPhotoRecord,
} from '../features';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useQueryListState } from '../hooks/useListQueryState';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { filterVisibleRestaurantFoodItems } from './addRestaurantToList/shared';

type AddRestaurantToListScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'AddRestaurantToList'
>;

interface GroupedFoodItemsByDate {
  dayKey: string;
  visitDate: string;
  items: RestaurantListVisitedRestaurantFoodItem[];
}

const MIN_CANDIDATE_RESTAURANT_SEARCH_LENGTH = 2;
const CANDIDATE_RESTAURANT_SEARCH_DEBOUNCE_MS = 250;

const useStyles = createThemedStyles((theme) => ({
  section: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
  },
  sectionDescription: {
    color: theme.colors.text.muted,
  },
  cardList: {
    gap: theme.spacing.sm,
  },
  restaurantCard: {
    gap: theme.spacing.xs,
  },
  restaurantHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  restaurantTitleWrap: {
    flex: 1,
    gap: 2,
    paddingRight: theme.spacing.sm,
  },
  restaurantTitle: {
    color: theme.colors.text.primary,
  },
  restaurantSubtitle: {
    color: theme.colors.text.secondary,
  },
  restaurantMeta: {
    color: theme.colors.text.muted,
  },
  disabledCard: {
    opacity: 0.55,
  },
  selectedCard: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
  },
  selectedRestaurantMeta: {
    gap: theme.spacing.xxs,
  },
  alreadyInListBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xxs,
  },
  alreadyInListText: {
    color: theme.colors.text.secondary,
    flex: 1,
  },
  dateGroupCard: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  dateGroupTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  duplicateToggleRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  duplicateToggleTextWrap: {
    flex: 1,
    gap: theme.spacing.xxs,
    paddingRight: theme.spacing.sm,
  },
  duplicateToggleTitle: {
    color: theme.colors.text.primary,
  },
  duplicateToggleSubtitle: {
    color: theme.colors.text.secondary,
  },
  foodItemRow: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  foodItemRowSelected: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
  },
  foodItemRowDisabled: {
    opacity: 0.6,
  },
  foodItemBody: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  foodItemPhotoWrap: {
    position: 'relative',
  },
  foodItemPhotoWrapLoading: {
    opacity: 0.6,
  },
  foodItemPhotoThumb: {
    backgroundColor: theme.colors.border.subtle,
    borderRadius: 8,
    height: 56,
    width: 56,
  },
  foodItemPhotoCountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.inverse,
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    left: 2,
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    top: 2,
  },
  foodItemPhotoCountText: {
    color: theme.colors.text.inverse,
    ...theme.typography.captionStrong,
  },
  foodItemContent: {
    flex: 1,
    gap: theme.spacing.xs,
    minHeight: 56,
  },
  foodItemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  foodItemTitleWrap: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  foodItemTitle: {
    color: theme.colors.text.primary,
  },
  foodItemNote: {
    color: theme.colors.text.secondary,
  },
  foodItemMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
}));

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

function matchesCandidateRestaurantSearch(
  restaurant: RestaurantListVisitedRestaurantCandidate,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    restaurant.name.toLowerCase().includes(normalizedQuery) ||
    (restaurant.location ?? '').toLowerCase().includes(normalizedQuery) ||
    (restaurant.cuisineType ?? '').toLowerCase().includes(normalizedQuery)
  );
}

function buildFoodItemPhotoThumbnailUrl(
  item: RestaurantListVisitedRestaurantFoodItem,
): string | null {
  return buildFoodItemPhotoUrl(item, '100x100');
}

function buildFoodItemPhotoUrl(
  item: RestaurantListVisitedRestaurantFoodItem,
  thumb?: string,
): string | null {
  const photoPreviewId = item.photoPreview?.id?.trim();
  const photoFilename = item.photoPreview?.photo?.trim();
  if (!photoPreviewId || !photoFilename) {
    return null;
  }

  return buildPocketBaseFileUrl({
    collectionName: 'visit_photos',
    recordId: photoPreviewId,
    filename: photoFilename,
    thumb,
  });
}

export function AddRestaurantToListScreen({
  navigation,
  route,
}: AddRestaurantToListScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const styles = useStyles();
  const writeFeature = useOfflineAwareFeatureWrite();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<KeyboardAwareScrollViewRef | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    string | null
  >(null);
  const [selectedFoodItemIds, setSelectedFoodItemIds] = useState<string[]>([]);
  const [hideDuplicateRatings, setHideDuplicateRatings] = useState(false);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingPhotoFoodItemId, setLoadingPhotoFoodItemId] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>(
    [],
  );
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const trimmedSearchQuery = searchQuery.trim();
  const debouncedTrimmedSearchQuery = useDebouncedValue(
    trimmedSearchQuery,
    CANDIDATE_RESTAURANT_SEARCH_DEBOUNCE_MS,
  );
  const shouldQueryCandidateRestaurantsBySearch =
    trimmedSearchQuery.length >= MIN_CANDIDATE_RESTAURANT_SEARCH_LENGTH &&
    debouncedTrimmedSearchQuery.length >= MIN_CANDIDATE_RESTAURANT_SEARCH_LENGTH &&
    trimmedSearchQuery === debouncedTrimmedSearchQuery;
  const activeCandidateRestaurantSearchQuery = shouldQueryCandidateRestaurantsBySearch
    ? debouncedTrimmedSearchQuery
    : '';

  const restaurantsQuery = useQuery({
    queryKey: restaurantListQueryKeys.candidateRestaurants(
      listId,
      activeCandidateRestaurantSearchQuery,
    ),
    queryFn: ({ signal }) =>
      getRestaurantListCandidateRestaurants(
        listId,
        activeCandidateRestaurantSearchQuery || undefined,
        { signal },
      ),
  });
  const restaurantsState = useQueryListState({
    data: restaurantsQuery.data?.items,
    isError: restaurantsQuery.isError,
    isFetching: restaurantsQuery.isFetching,
    isLoading: restaurantsQuery.isLoading,
    isSuccess: restaurantsQuery.isSuccess,
  });

  const visitedRestaurants = useMemo(() => {
    if (
      shouldQueryCandidateRestaurantsBySearch ||
      trimmedSearchQuery.length === 0
    ) {
      return restaurantsState.items;
    }

    return restaurantsState.items.filter((restaurant) =>
      matchesCandidateRestaurantSearch(restaurant, trimmedSearchQuery),
    );
  }, [
    restaurantsState.items,
    shouldQueryCandidateRestaurantsBySearch,
    trimmedSearchQuery,
  ]);
  const hasBlockingVisitedRestaurantsError = restaurantsState.hasBlockingError;

  const selectedRestaurant = useMemo(
    () =>
      visitedRestaurants.find(
        (restaurant) => restaurant.id === selectedRestaurantId,
      ) ?? null,
    [selectedRestaurantId, visitedRestaurants],
  );

  useEffect(() => {
    if (!selectedRestaurantId) {
      return;
    }

    const scrollResetTimeout = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 0);

    return () => {
      clearTimeout(scrollResetTimeout);
    };
  }, [selectedRestaurantId]);

  const selectedRestaurantExistingFoodItemIds = useMemo(
    () => new Set(selectedRestaurant?.linkedFoodItemIds ?? []),
    [selectedRestaurant?.linkedFoodItemIds],
  );

  const selectedRestaurantAlreadyInList = selectedRestaurant?.alreadyInList === true;

  const selectedNewFoodItemIds = useMemo(
    () =>
      selectedFoodItemIds.filter(
        (foodItemId) => !selectedRestaurantExistingFoodItemIds.has(foodItemId),
      ),
    [selectedFoodItemIds, selectedRestaurantExistingFoodItemIds],
  );

  const visibleSelectedRestaurantFoodItems = useMemo(
    () =>
      filterVisibleRestaurantFoodItems({
        foodItems: selectedRestaurant?.foodItems ?? [],
        selectedFoodItemIds,
        hideDuplicateRatings,
      }),
    [hideDuplicateRatings, selectedFoodItemIds, selectedRestaurant?.foodItems],
  );

  const groupedFoodItems = useMemo<GroupedFoodItemsByDate[]>(() => {
    if (!selectedRestaurant) {
      return [];
    }

    const groups = new Map<string, GroupedFoodItemsByDate>();

    for (const item of visibleSelectedRestaurantFoodItems) {
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
  }, [selectedRestaurant, visibleSelectedRestaurantFoodItems]);

  const handleBackToListDetail = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("ListDetail", { listId });
  };

  const handleSelectRestaurant = (restaurant: RestaurantListVisitedRestaurantCandidate) => {
    const existingFoodItemIds = new Set(restaurant.linkedFoodItemIds);
    const availableItemCount = restaurant.foodItems.filter(
      (item) => !existingFoodItemIds.has(item.id),
    ).length;
    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_RESTAURANT_SELECTED', {
      source: 'AddRestaurantToListScreen',
      listId,
      restaurantId: restaurant.id,
      alreadyInList: restaurant.alreadyInList === true,
      availableItemCount,
    });
    setErrorMessage(null);
    setSelectedRestaurantId(restaurant.id);
    setSelectedFoodItemIds([]);
    setHideDuplicateRatings(false);
    setNote(restaurant.existingNote ?? "");
    setNoteDirty(false);
  };

  const handleBackToRestaurantSearch = () => {
    setErrorMessage(null);
    setSelectedRestaurantId(null);
    setSelectedFoodItemIds([]);
    setHideDuplicateRatings(false);
    setNote("");
    setNoteDirty(false);
  };

  const handleToggleFoodItem = (foodItemId: string) => {
    if (selectedRestaurantExistingFoodItemIds.has(foodItemId)) {
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

  const handleToggleHideDuplicateRatings = (enabled: boolean) => {
    if (!selectedRestaurant) {
      return;
    }

    const visibleFoodItemCount = filterVisibleRestaurantFoodItems({
      foodItems: selectedRestaurant.foodItems,
      selectedFoodItemIds,
      hideDuplicateRatings: enabled,
    }).length;

    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_HIDE_DUPLICATE_RATINGS_TOGGLED', {
      source: 'AddRestaurantToListScreen',
      listId,
      restaurantId: selectedRestaurant.id,
      enabled,
      selectedFoodItemCount: selectedFoodItemIds.length,
      visibleFoodItemCount,
    });
    setHideDuplicateRatings(enabled);
  };

  const openPhotoViewer = (
    photos: VisitPhotoRecord[],
    item: RestaurantListVisitedRestaurantFoodItem,
  ) => {
    if (photos.length === 0) {
      return;
    }

    const urls = photos.map((photo) =>
      buildPocketBaseFileUrl({
        collectionId: photo.collectionId,
        collectionName: photo.collectionName ?? 'visit_photos',
        recordId: photo.id,
        filename: photo.photo,
      }),
    );
    const previewUrls = photos.map((photo) =>
      buildPocketBaseFileUrl({
        collectionId: photo.collectionId,
        collectionName: photo.collectionName ?? 'visit_photos',
        recordId: photo.id,
        filename: photo.photo,
        thumb: '100x100',
      }),
    );
    const previewPhotoId = item.photoPreview?.id?.trim();
    const previewIndex = previewPhotoId
      ? photos.findIndex((photo) => photo.id === previewPhotoId)
      : 0;
    const boundedIndex = Math.max(0, previewIndex);

    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_PHOTO_VIEWER_OPENED', {
      source: 'AddRestaurantToListScreen',
      listId,
      restaurantId: selectedRestaurant?.id ?? null,
      foodItemId: item.id,
      initialIndex: boundedIndex,
      photoCount: urls.length,
    });

    setPhotoViewerPreviewUrls(previewUrls);
    setPhotoViewerUrls(urls);
    setPhotoViewerInitialIndex(Math.min(boundedIndex, urls.length - 1));
    setPhotoViewerVisible(true);
  };

  const handleOpenFoodItemPhotos = async (
    item: RestaurantListVisitedRestaurantFoodItem,
  ) => {
    const photoViewerUrl = buildFoodItemPhotoUrl(item);
    if (!photoViewerUrl) {
      return;
    }
    const photoThumbnailUrl = buildFoodItemPhotoThumbnailUrl(item);

    setLoadingPhotoFoodItemId(item.id);

    try {
      const photos = await queryClient.fetchQuery({
        queryKey: restaurantListQueryKeys.candidateFoodItemPhotos(item.id),
        queryFn: ({ signal }) =>
          listRestaurantListCandidateFoodItemPhotos(item.id, { signal }),
        staleTime: 60_000,
      });

      if (photos.length > 0) {
        openPhotoViewer(photos, item);
        return;
      }

      setPhotoViewerPreviewUrls(photoThumbnailUrl ? [photoThumbnailUrl] : []);
      setPhotoViewerUrls([photoViewerUrl]);
      setPhotoViewerInitialIndex(0);
      setPhotoViewerVisible(true);
    } catch (error) {
      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_PHOTO_VIEWER_FAILED', {
        source: 'AddRestaurantToListScreen',
        listId,
        restaurantId: selectedRestaurant?.id ?? null,
        foodItemId: item.id,
        error: error instanceof Error ? error.message : 'unknown_error',
      });

      setPhotoViewerPreviewUrls(photoThumbnailUrl ? [photoThumbnailUrl] : []);
      setPhotoViewerUrls([photoViewerUrl]);
      setPhotoViewerInitialIndex(0);
      setPhotoViewerVisible(true);
    } finally {
      setLoadingPhotoFoodItemId((current) =>
        current === item.id ? null : current,
      );
    }
  };

  const closePhotoViewer = () => {
    setPhotoViewerVisible(false);
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

      const addResult = await writeFeature({
        operationName: 'list.restaurant.add',
        offline: {
          strategy: 'outbox',
          payload: addInput,
        },
        execute: () => addRestaurantVisitRatingsToList(addInput),
      });

      if (addResult.status === 'queued') {
        await invalidateRestaurantListContentQueries(queryClient, listId, {
          includeCandidateRestaurants: true,
        });
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

      await invalidateRestaurantListContentQueries(queryClient, listId, {
        includeCandidateRestaurants: true,
      });

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
    <>
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
        testID={selectedRestaurant ? "add-restaurant-to-list-detail-screen" : "add-restaurant-to-list-screen"}
        title={
          selectedRestaurant
            ? `Add ${selectedRestaurant.name}`
            : "Add Restaurant to List"
        }
        scrollViewRef={scrollViewRef}
      >
        <PageErrorToast
          errorMessage={errorMessage}
          title="Could not update list"
        />

        <PageErrorToast
          actionLabel="Retry"
          errorMessage={
            hasBlockingVisitedRestaurantsError
              ? "Could not load your visited restaurants."
              : restaurantsState.hasRefreshError
                ? "Could not refresh your visited restaurants. Showing saved data."
                : null
          }
          onAction={() => {
            void restaurantsQuery.refetch();
          }}
          title="Restaurants unavailable"
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

            {restaurantsQuery.isLoading ? (
              <View style={styles.cardList}>
                <Skeleton height={90} />
                <Skeleton height={90} />
                <Skeleton height={90} />
              </View>
            ) : null}

            {!restaurantsQuery.isLoading &&
            !hasBlockingVisitedRestaurantsError &&
            visitedRestaurants.length === 0 ? (
              <EmptyState
                description={
                  trimmedSearchQuery
                    ? "No matching visited restaurants found."
                    : "Visit a restaurant and rate items first."
                }
                title={
                  trimmedSearchQuery
                    ? "No matching restaurants"
                    : "No visited restaurants yet"
                }
              />
            ) : null}

            {!restaurantsQuery.isLoading &&
            !hasBlockingVisitedRestaurantsError &&
            visitedRestaurants.length > 0 ? (
              <View style={styles.cardList}>
                {visitedRestaurants.map((restaurant, restaurantIndex) => {
                  const existingFoodItemIds = new Set(restaurant.linkedFoodItemIds);
                  const availableItemCount = restaurant.foodItems.filter(
                    (item) => !existingFoodItemIds.has(item.id),
                  ).length;
                  const allItemsAdded =
                    restaurant.foodItems.length > 0 && availableItemCount === 0;
                  const alreadyAdded = restaurant.alreadyInList === true;

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
                        testID={`add-restaurant-option-${restaurantIndex}`}
                      >
                        <View style={styles.restaurantHeaderRow}>
                          <View style={styles.restaurantTitleWrap}>
                            <Text style={styles.restaurantTitle} variant="bodyLgTightBold">
                              {restaurant.name}
                            </Text>
                            <Text style={styles.restaurantSubtitle} variant="metaRegular">
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
                          <Text style={styles.restaurantMeta} variant="bodySmTight">
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
                <Text style={styles.restaurantTitle} variant="bodyLgTightBold">
                  {selectedRestaurant.name}
                </Text>
                <Text style={styles.restaurantSubtitle} variant="metaRegular">
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
                    <Text style={styles.alreadyInListText} variant="bodySmTight">
                      Already in this list. Add more rated items below.
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>

            <View style={styles.section}>
              <Text style={styles.sectionTitle} variant="titleXsTight">
                Recommended Items (Optional)
              </Text>
              <Text style={styles.sectionDescription} variant="metaRegular">
                Select items you have rated. Items already in this list are marked
                as added.
              </Text>

              <View style={styles.duplicateToggleRow}>
                <View style={styles.duplicateToggleTextWrap}>
                  <Text style={styles.duplicateToggleTitle} variant="label">
                    Hide duplicate ratings
                  </Text>
                  <Text style={styles.duplicateToggleSubtitle} variant="bodySmTight">
                    Show only the latest rating for each item unless you already
                    selected an older rating.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Hide duplicate ratings"
                  ios_backgroundColor={theme.colors.border.strong}
                  onValueChange={handleToggleHideDuplicateRatings}
                  testID="add-restaurant-hide-duplicate-ratings-toggle"
                  thumbColor={theme.colors.background.surface}
                  trackColor={{
                    false: theme.colors.border.strong,
                    true: theme.colors.fill.brand,
                  }}
                  value={hideDuplicateRatings}
                />
              </View>

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
                          const isAlreadyAdded = selectedRestaurantExistingFoodItemIds.has(item.id);
                          const isSelected = selectedFoodItemIds.includes(
                            item.id,
                          );
                          const photoThumbnailUrl = buildFoodItemPhotoThumbnailUrl(item);
                          const extraPhotoCount = Math.max((item.photoCount ?? 0) - 1, 0);

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
                              <View style={styles.foodItemBody}>
                                {photoThumbnailUrl ? (
                                  <Pressable
                                    accessibilityLabel={`View photos for ${item.name}`}
                                    accessibilityRole="button"
                                    disabled={loadingPhotoFoodItemId === item.id}
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      void handleOpenFoodItemPhotos(item);
                                    }}
                                    style={[
                                      styles.foodItemPhotoWrap,
                                      loadingPhotoFoodItemId === item.id
                                        ? styles.foodItemPhotoWrapLoading
                                        : null,
                                    ]}
                                  >
                                    <Image
                                      source={{ uri: photoThumbnailUrl }}
                                      style={styles.foodItemPhotoThumb}
                                    />
                                    {extraPhotoCount > 0 ? (
                                      <View style={styles.foodItemPhotoCountBadge}>
                                        <Text style={styles.foodItemPhotoCountText}>
                                          +{extraPhotoCount}
                                        </Text>
                                      </View>
                                    ) : null}
                                  </Pressable>
                                ) : null}

                                <View style={styles.foodItemContent}>
                                  <View style={styles.foodItemHeader}>
                                    <View style={styles.foodItemTitleWrap}>
                                      <Text style={styles.foodItemTitle} variant="labelMdBold">
                                        {item.name}
                                      </Text>
                                      {item.notes ? (
                                        <Text style={styles.foodItemNote} variant="bodySmTight">
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
                                </View>
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
              <View>
                <Input
                  label="General note (optional)"
                  maxLength={300}
                  multiline
                  onChangeText={(value) => {
                    setNote(value);
                    setNoteDirty(true);
                  }}
                  placeholder="Why do you recommend this restaurant?"
                  testID="add-restaurant-note-input"
                  value={note}
                />
              </View>
              <Text tone="muted">{`${note.length}/300`}</Text>
            </View>
          </>
        )}
      </FeatureFormScreenScaffold>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={photoViewerVisible}
      />
    </>
  );
}
