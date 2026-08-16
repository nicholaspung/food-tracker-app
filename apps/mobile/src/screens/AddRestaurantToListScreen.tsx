import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Switch, View, type ListRenderItem } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import {
	  CachedRemoteImage,
	  EmptyState,
	  ErrorState,
	  FeatureFormScreenScaffold,
  PhotoViewerModal,
  RatingPill,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  getRestaurantListCandidateRestaurants,
  getRestaurantListVisitedRestaurantFoodItemsPage,
  listRestaurantListCandidateFoodItemPhotos,
  restaurantListQueryKeys,
  type RestaurantListVisitedRestaurantCandidate,
  type RestaurantListVisitedRestaurantFoodItem,
  type VisitPhotoRecord,
} from '../features';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useQueryListState } from '../hooks/useListQueryState';
import { useRestaurantListWrites } from '../features/store/useRestaurantListWrites';
import { formatDisplayDate } from '../lib/dateFormatting';
import { buildPhotoFileUrl, buildPhotoViewerState } from '../lib/photoUrls';
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

const CANDIDATE_RESTAURANT_SEARCH_DEBOUNCE_MS = 250;
const CANDIDATE_RESTAURANT_PAGE_SIZE = 20;
const CANDIDATE_FOOD_ITEM_PAGE_SIZE = 20;

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
  restaurantList: {
    flex: 1,
  },
  restaurantListContent: {
    paddingBottom: theme.spacing.md,
  },
  restaurantListSeparator: {
    height: theme.spacing.sm,
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
  restaurantTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  restaurantTitle: {
    color: theme.colors.text.primary,
    flexShrink: 1,
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

  return buildPhotoFileUrl({
    id: photoPreviewId,
    collectionName: 'visit_photos',
    photo: photoFilename,
  }, thumb);
}

export function AddRestaurantToListScreen({
  navigation,
  route,
}: AddRestaurantToListScreenProps) {
  const { listId } = route.params;
  const theme = useTheme();
  const styles = useStyles();
  const listWrites = useRestaurantListWrites();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

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
    trimmedSearchQuery.length > 0 &&
    debouncedTrimmedSearchQuery.length > 0 &&
    trimmedSearchQuery === debouncedTrimmedSearchQuery;
  const activeCandidateRestaurantSearchQuery = shouldQueryCandidateRestaurantsBySearch
    ? debouncedTrimmedSearchQuery
    : '';

  const restaurantsQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.candidateRestaurantPages(
      listId,
      activeCandidateRestaurantSearchQuery,
    ),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getRestaurantListCandidateRestaurants(
        listId,
        activeCandidateRestaurantSearchQuery || undefined,
        {
          page: pageParam,
          pageSize: CANDIDATE_RESTAURANT_PAGE_SIZE,
          signal,
        },
      ),
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? lastPage.page + 1 : undefined,
  });
	  const loadedCandidateRestaurants = useMemo(() => {
	    return restaurantsQuery.data?.pages.flatMap((page) => page.items);
	  }, [restaurantsQuery.data?.pages]);
	  const hasLoadedCandidateRestaurants = (loadedCandidateRestaurants?.length ?? 0) > 0;
  const isInitialCandidateLoading =
    restaurantsQuery.isLoading && !hasLoadedCandidateRestaurants;
  const handleFetchNextCandidatePage = () => {
    if (restaurantsQuery.hasNextPage && !restaurantsQuery.isFetchingNextPage) {
      void restaurantsQuery.fetchNextPage();
    }
  };
  const restaurantsState = useQueryListState({
    data: loadedCandidateRestaurants,
    isError: restaurantsQuery.isError,
    isFetching: restaurantsQuery.isFetching,
    isLoading: isInitialCandidateLoading,
    isSuccess: restaurantsQuery.isSuccess,
  });

  const visitedRestaurants = restaurantsState.items;
  const hasBlockingVisitedRestaurantsError = restaurantsState.hasBlockingError;

  const selectedRestaurant = useMemo(
    () =>
      visitedRestaurants.find(
        (restaurant) => restaurant.id === selectedRestaurantId,
      ) ?? null,
    [selectedRestaurantId, visitedRestaurants],
  );

  const selectedFoodItemsQuery = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.candidateRestaurantFoodItemPages(
      listId,
      selectedRestaurantId ?? '',
    ),
    initialPageParam: 1,
    enabled: selectedRestaurantId !== null,
    queryFn: ({ pageParam, signal }) =>
      getRestaurantListVisitedRestaurantFoodItemsPage(
        listId,
        selectedRestaurantId ?? '',
        {
          page: pageParam,
          pageSize: CANDIDATE_FOOD_ITEM_PAGE_SIZE,
          signal,
        },
      ),
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? lastPage.page + 1 : undefined,
  });
  const loadedSelectedRestaurantFoodItems = useMemo(
    () => selectedFoodItemsQuery.data?.pages.flatMap((page) => page.items),
    [selectedFoodItemsQuery.data?.pages],
  );
  const hasLoadedSelectedRestaurantFoodItems =
    (loadedSelectedRestaurantFoodItems?.length ?? 0) > 0;
  const isInitialSelectedFoodItemsLoading =
    selectedFoodItemsQuery.isLoading && !hasLoadedSelectedRestaurantFoodItems;
  const selectedFoodItemsState = useQueryListState({
    data: loadedSelectedRestaurantFoodItems,
    isError: selectedFoodItemsQuery.isError,
    isFetching: selectedFoodItemsQuery.isFetching,
    isLoading: isInitialSelectedFoodItemsLoading,
    isSuccess: selectedFoodItemsQuery.isSuccess,
  });
  const selectedRestaurantFoodItems = selectedFoodItemsState.items;

  const selectedRestaurantExistingFoodItemIds = useMemo(
    () => new Set(
      selectedRestaurantFoodItems
        .filter((foodItem) => foodItem.alreadyAdded)
        .map((foodItem) => foodItem.id),
    ),
    [selectedRestaurantFoodItems],
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
        foodItems: selectedRestaurantFoodItems,
        selectedFoodItemIds,
        hideDuplicateRatings,
      }),
    [hideDuplicateRatings, selectedFoodItemIds, selectedRestaurantFoodItems],
  );
  const handleBackToListDetail = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("ListDetail", { listId });
  };

  const handleSelectRestaurant = (restaurant: RestaurantListVisitedRestaurantCandidate) => {
    const availableItemCount = Math.max(restaurant.itemCount - restaurant.linkedItemCount, 0);
    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_RESTAURANT_SELECTED', {
      source: 'AddRestaurantToListScreen',
      alreadyInList: restaurant.alreadyInList === true,
      availableItemCount,
      hasListContext: listId.trim().length > 0,
      hasRestaurantSelection: restaurant.id.trim().length > 0,
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
        hasFoodItemSelection: foodItemId.trim().length > 0,
        hasListContext: listId.trim().length > 0,
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
      foodItems: selectedRestaurantFoodItems,
      selectedFoodItemIds,
      hideDuplicateRatings: enabled,
    }).length;

    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_HIDE_DUPLICATE_RATINGS_TOGGLED', {
      source: 'AddRestaurantToListScreen',
      enabled,
      hasListContext: listId.trim().length > 0,
      hasRestaurantSelection: selectedRestaurant.id.trim().length > 0,
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

    const previewPhotoId = item.photoPreview?.id?.trim();
    const viewerState = buildPhotoViewerState(photos, previewPhotoId || 0);

    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_PHOTO_VIEWER_OPENED', {
      source: 'AddRestaurantToListScreen',
      hasFoodItemSelection: item.id.trim().length > 0,
      hasListContext: listId.trim().length > 0,
      hasRestaurantSelection: Boolean(selectedRestaurant?.id?.trim()),
      initialIndex: viewerState.initialIndex,
      photoCount: viewerState.urls.length,
    });

    setPhotoViewerPreviewUrls(viewerState.previewUrls);
    setPhotoViewerUrls(viewerState.urls);
    setPhotoViewerInitialIndex(viewerState.initialIndex);
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
      const photos: VisitPhotoRecord[] =
        (await queryClient.fetchQuery({
          queryKey: restaurantListQueryKeys.candidateFoodItemPhotos(item.id),
          queryFn: ({ signal }) =>
            listRestaurantListCandidateFoodItemPhotos(item.id, { signal }),
          staleTime: 60_000,
        })) ?? [];

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
        hasFoodItemSelection: item.id.trim().length > 0,
        hasListContext: listId.trim().length > 0,
        hasRestaurantSelection: Boolean(selectedRestaurant?.id?.trim()),
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
        hasListContext: listId.trim().length > 0,
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
        hasListContext: listId.trim().length > 0,
        hasRestaurantSelection: selectedRestaurant.id.trim().length > 0,
        reason: 'missing_items_or_note',
      });
      setErrorMessage("Select at least one new item or add a note.");
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_STARTED', {
      source: 'AddRestaurantToListScreen',
      hasListContext: listId.trim().length > 0,
      hasRestaurantSelection: selectedRestaurant.id.trim().length > 0,
      isOnline,
      includesNote: note.trim().length > 0,
      selectedFoodItemCount: selectedNewFoodItemIds.length,
    });
    setIsSubmitting(true);

    try {
      const addInput = {
        listId,
        restaurantId: selectedRestaurant.id,
        foodItemIds: selectedNewFoodItemIds,
        note: noteDirty ? note : undefined,
      };

      const addResult = await listWrites.addRestaurant(addInput);

      if (addResult.status === 'queued') {
        trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_SUCCEEDED', {
          source: 'AddRestaurantToListScreen',
          hasListContext: listId.trim().length > 0,
          hasRestaurantSelection: selectedRestaurant.id.trim().length > 0,
          queued: true,
          selectedFoodItemCount: selectedNewFoodItemIds.length,
        });
        handleBackToListDetail();
        return;
      }

      trackObservabilityEvent('ADD_RESTAURANT_TO_LIST_SUBMIT_SUCCEEDED', {
        source: 'AddRestaurantToListScreen',
        hasListContext: listId.trim().length > 0,
        hasRestaurantSelection: selectedRestaurant.id.trim().length > 0,
        queued: false,
        selectedFoodItemCount: selectedNewFoodItemIds.length,
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
        hasListContext: listId.trim().length > 0,
        hasRestaurantSelection: selectedRestaurant.id.trim().length > 0,
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

  const renderRestaurantCandidate: ListRenderItem<RestaurantListVisitedRestaurantCandidate> = ({
    item: restaurant,
    index: restaurantIndex,
  }) => {
    const availableItemCount = Math.max(restaurant.itemCount - restaurant.linkedItemCount, 0);
    const allItemsAdded =
      restaurant.itemCount > 0 && availableItemCount === 0;
    const alreadyAdded = restaurant.alreadyInList === true;
    const isRestaurantLocked = restaurant.visibility === 'private';

    const metadataLabel = `${restaurant.itemCount} ${restaurant.itemCount === 1 ? "rated item" : "rated items"}`;

    return (
      <Card
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
              <View style={styles.restaurantTitleRow}>
                {isRestaurantLocked ? (
                  <Ionicons
                    accessibilityLabel="Private restaurant"
                    color={theme.colors.text.muted}
                    name="lock-closed-outline"
                    size={14}
                    testID={`locked-candidate-restaurant-${restaurant.id}`}
                  />
                ) : null}
                <Text style={styles.restaurantTitle} variant="bodyLgTightBold">
                  {restaurant.name}
                </Text>
              </View>
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
          {restaurant.latestVisitDate ? (
            <Text style={styles.restaurantMeta} variant="bodySmTight">
              Latest visit {formatDisplayDate(restaurant.latestVisitDate)}
            </Text>
          ) : null}
        </Pressable>
      </Card>
    );
  };

  const handleFetchNextSelectedFoodItemPage = () => {
    if (selectedFoodItemsQuery.hasNextPage && !selectedFoodItemsQuery.isFetchingNextPage) {
      void selectedFoodItemsQuery.fetchNextPage();
    }
  };

  const renderSelectedFoodItem: ListRenderItem<RestaurantListVisitedRestaurantFoodItem> = ({
    item,
    index,
  }) => {
    const previousItem = visibleSelectedRestaurantFoodItems[index - 1];
    const startsVisitDate = !previousItem || toDayKey(previousItem.visitedAt) !== toDayKey(item.visitedAt);
    const isAlreadyAdded = item.alreadyAdded;
    const isSelected = selectedFoodItemIds.includes(item.id);
    const photoThumbnailUrl = buildFoodItemPhotoThumbnailUrl(item);
    const extraPhotoCount = Math.max((item.photoCount ?? 0) - 1, 0);

    return (
      <Card style={styles.dateGroupCard} tone="default">
        {startsVisitDate ? (
          <View style={styles.dateGroupTitleRow}>
            <Ionicons
              color={theme.colors.text.muted}
              name="calendar-outline"
              size={15}
            />
            <Text variant="label">{formatDisplayDate(item.visitedAt)}</Text>
          </View>
        ) : null}
        <View
          style={[
            styles.foodItemRow,
            isSelected ? styles.foodItemRowSelected : null,
            isAlreadyAdded ? styles.foodItemRowDisabled : null,
          ]}
        >
          <View style={styles.foodItemBody}>
            {photoThumbnailUrl ? (
              <Pressable
                accessibilityLabel={`View photos for ${item.name}`}
                accessibilityRole="button"
                disabled={loadingPhotoFoodItemId === item.id}
                onPress={() => {
                  void handleOpenFoodItemPhotos(item);
                }}
                style={[
                  styles.foodItemPhotoWrap,
                  loadingPhotoFoodItemId === item.id
                    ? styles.foodItemPhotoWrapLoading
                    : null,
                ]}
              >
                <CachedRemoteImage
                  uri={photoThumbnailUrl}
                  style={styles.foodItemPhotoThumb}
                />
                {extraPhotoCount > 0 ? (
                  <View style={styles.foodItemPhotoCountBadge}>
                    <Text style={styles.foodItemPhotoCountText}>+{extraPhotoCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            <Pressable
              accessibilityHint={
                isAlreadyAdded ? 'Already in this Restaurant List.' : undefined
              }
              accessibilityLabel={item.name}
              accessibilityRole="button"
              accessibilityState={{ disabled: isAlreadyAdded, selected: isSelected }}
              disabled={isAlreadyAdded}
              onPress={() => {
                handleToggleFoodItem(item.id);
              }}
              style={styles.foodItemContent}
              testID={`add-restaurant-food-item-${item.id}`}
            >
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
            </Pressable>
          </View>
        </View>
      </Card>
    );
  };

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
        bodyScrollable={false}
      >
        <PageErrorToast
          errorMessage={errorMessage}
          title="Could not update list"
        />

	        <PageErrorToast
	          actionLabel="Retry"
	          errorMessage={
	            restaurantsState.hasRefreshError
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

            {isInitialCandidateLoading ? (
              <View style={styles.cardList}>
                <Skeleton height={90} />
                <Skeleton height={90} />
                <Skeleton height={90} />
              </View>
            ) : null}

	            {hasBlockingVisitedRestaurantsError ? (
	              <ErrorState
	                description="Could not load your visited restaurants."
	                onRetry={() => {
	                  void restaurantsQuery.refetch();
	                }}
	                retryLabel="Retry"
	                title="Restaurants unavailable"
	              />
	            ) : null}

	            {!isInitialCandidateLoading && !hasBlockingVisitedRestaurantsError ? (
              <FlatList
                contentContainerStyle={styles.restaurantListContent}
                data={visitedRestaurants}
                ItemSeparatorComponent={() => <View style={styles.restaurantListSeparator} />}
                keyExtractor={(restaurant) => restaurant.id}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
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
                }
                ListFooterComponent={
                  restaurantsQuery.isFetchingNextPage ? (
                    <View style={styles.cardList}>
                      <Skeleton height={90} />
                    </View>
                  ) : null
                }
                onEndReached={handleFetchNextCandidatePage}
                onEndReachedThreshold={0.4}
                renderItem={renderRestaurantCandidate}
                style={styles.restaurantList}
                testID="add-restaurant-candidate-list"
              />
            ) : null}
          </>
        ) : (
          <KeyboardAvoidingView
            automaticOffset
            behavior="height"
            style={styles.restaurantList}
            testID="add-restaurant-food-items-keyboard-avoiding-view"
          >
            <FlatList
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.restaurantListContent}
              data={visibleSelectedRestaurantFoodItems}
              ItemSeparatorComponent={() => <View style={styles.restaurantListSeparator} />}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View style={styles.cardList}>
                <PageErrorToast
                  actionLabel="Retry"
                  errorMessage={
                    selectedFoodItemsState.hasRefreshError
                      ? "Could not refresh rated items. Showing saved data."
                      : null
                  }
                  onAction={() => {
                    void selectedFoodItemsQuery.refetch();
                  }}
                  title="Rated items unavailable"
                />

                <Card style={styles.selectedCard} tone="default">
                  <View style={styles.selectedRestaurantMeta}>
                    <View style={styles.restaurantTitleRow}>
                      {selectedRestaurant.visibility === 'private' ? (
                        <Ionicons
                          accessibilityLabel="Private restaurant"
                          color={theme.colors.text.muted}
                          name="lock-closed-outline"
                          size={14}
                          testID={`locked-selected-restaurant-${selectedRestaurant.id}`}
                        />
                      ) : null}
                      <Text style={styles.restaurantTitle} variant="bodyLgTightBold">
                        {selectedRestaurant.name}
                      </Text>
                    </View>
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
                        Show only the latest loaded rating for each item unless you
                        already selected an older rating.
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
                </View>
              </View>
            }
            ListEmptyComponent={
              isInitialSelectedFoodItemsLoading ? (
                <View style={styles.cardList}>
                  <Skeleton height={110} />
                  <Skeleton height={110} />
                </View>
              ) : selectedFoodItemsState.hasBlockingError ? (
                <ErrorState
                  description="Could not load rated items for this restaurant."
                  onRetry={() => {
                    void selectedFoodItemsQuery.refetch();
                  }}
                  retryLabel="Retry"
                  title="Rated items unavailable"
                />
              ) : (
                <EmptyState
                  description="No rated items found for this restaurant."
                  title="No items available"
                />
              )
            }
            ListFooterComponent={
              <View style={styles.cardList}>
                {selectedFoodItemsQuery.isFetchingNextPage ? (
                  <Skeleton height={110} />
                ) : null}
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
                    testID="add-restaurant-note-input"
                    value={note}
                  />
                  <Text tone="muted">{`${note.length}/300`}</Text>
                </View>
              </View>
            }
            onEndReached={handleFetchNextSelectedFoodItemPage}
            onEndReachedThreshold={0.4}
            renderItem={renderSelectedFoodItem}
            style={styles.restaurantList}
              testID="add-restaurant-food-item-list"
            />
          </KeyboardAvoidingView>
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
