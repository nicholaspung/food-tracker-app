import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PhotoViewerModal,
  Skeleton,
} from '../components/shared';
import {
  getSharedRestaurantList,
  restaurantListQueryKeys,
  saveSharedRestaurantListRecommendation,
} from '../features';
import type {
  RestaurantListBookmarkedItemRecord,
  RestaurantListItemRecord,
  SharedRestaurantListPhotoPreviewRecord,
} from '../features';
import { buildPhotoFileUrl, buildPhotoThumbnailUrl } from '../lib/photoUrls';
import { savePendingAuthRedirect } from '../lib/pendingAuthRedirect';
import { env } from '../config/env';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { buildBookmarkLookupIds } from './listDetail/listDetailFormatters';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
import { ListDetailRestaurantRecommendationGroupCard } from './listDetail/ListDetailRestaurantRecommendationGroupCard';
import { SaveRecommendationToListModal } from './listDetail/SaveRecommendationToListModal';
import type { GroupedBookmarkedItem, OwnerItemPhotoEntry, SaveBookmarkTarget } from './listDetail/listDetailTypes';

type SharedRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'SharedRestaurantList'>;

interface GroupedSharedRestaurant {
  restaurantId: string;
  restaurantName: string;
  restaurantLocation?: string;
  restaurantCity?: string;
  restaurantCuisineType?: string;
  notes: string[];
  firstPosition: number;
  items: GroupedBookmarkedItem[];
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: theme.spacing.md,
  },
}));

function mapSharedBookmarkItem(item: RestaurantListBookmarkedItemRecord): GroupedBookmarkedItem {
  return {
    key: `${item.listItemId}:${item.id}`,
    bookmarkLookupIds: buildBookmarkLookupIds(item.id, item.userFoodItemId),
    foodItemId: item.id,
    listItemId: item.listItemId,
    name: item.name,
    rating: item.rating,
    visitedAt: item.visitedAt,
    userFoodItemId: item.userFoodItemId,
    userFoodItemRating: item.userFoodItemRating,
    userFoodItemVisitedAt: item.userFoodItemVisitedAt,
  };
}

function groupSharedListItems(items: RestaurantListItemRecord[]): GroupedSharedRestaurant[] {
  const groups = new Map<string, GroupedSharedRestaurant>();

  for (const item of items) {
    const group =
      groups.get(item.restaurantId) ??
      {
        restaurantId: item.restaurantId,
        restaurantName: item.restaurantName,
        restaurantLocation: item.restaurantLocation,
        restaurantCity: item.restaurantCity,
        restaurantCuisineType: item.restaurantCuisineType,
        notes: [],
        firstPosition: item.position,
        items: [],
      };

    group.firstPosition = Math.min(group.firstPosition, item.position);
    group.restaurantName = item.restaurantName;
    group.restaurantLocation = item.restaurantLocation;
    group.restaurantCity = item.restaurantCity;
    group.restaurantCuisineType = item.restaurantCuisineType;

    if (item.note && !group.notes.includes(item.note)) {
      group.notes.push(item.note);
    }

    group.items.push(...item.bookmarkedItems.map(mapSharedBookmarkItem));
    groups.set(item.restaurantId, group);
  }

  return Array.from(groups.values()).sort((left, right) => left.firstPosition - right.firstPosition);
}

function groupSharedPhotosByFoodItemId(
  photos: SharedRestaurantListPhotoPreviewRecord[],
): Map<string, SharedRestaurantListPhotoPreviewRecord[]> {
  const lookup = new Map<string, SharedRestaurantListPhotoPreviewRecord[]>();
  for (const photo of photos) {
    const foodItemId = photo.food_item?.trim();
    if (!foodItemId) {
      continue;
    }
    const existing = lookup.get(foodItemId) ?? [];
    existing.push(photo);
    lookup.set(foodItemId, existing);
  }
  return lookup;
}

function buildSharedPhotoEntries(
  item: GroupedBookmarkedItem,
  photosByFoodItemId: Map<string, SharedRestaurantListPhotoPreviewRecord[]>,
): OwnerItemPhotoEntry[] {
  const entriesById = new Map<string, OwnerItemPhotoEntry>();

  for (const foodItemId of [item.foodItemId, item.userFoodItemId]) {
    if (!foodItemId) {
      continue;
    }
    for (const photo of photosByFoodItemId.get(foodItemId) ?? []) {
      entriesById.set(photo.id, {
        id: photo.id,
        previewUrl: buildPhotoThumbnailUrl(photo),
        url: buildPhotoFileUrl(photo),
        ownerLabel: 'Shared list',
      });
    }
  }

  return Array.from(entriesById.values());
}

export function SharedRestaurantListScreen({ navigation, route }: SharedRestaurantListScreenProps) {
  const { shareToken } = route.params;
  const { status } = useAuth();
  const styles = useStyles();
  const [saveBookmarkTarget, setSaveBookmarkTarget] = useState<SaveBookmarkTarget | null>(null);
  const [selectedSaveListIds, setSelectedSaveListIds] = useState<Set<string>>(new Set());
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [saveModalError, setSaveModalError] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerOwnerLabels, setPhotoViewerOwnerLabels] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const isAuthenticated = status === 'authenticated';

  const query = useQuery({
    queryKey: restaurantListQueryKeys.shared(shareToken),
    queryFn: ({ signal }) => getSharedRestaurantList(shareToken, { signal }),
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const groupedRestaurants = useMemo(
    () => groupSharedListItems(query.data?.items ?? []),
    [query.data?.items],
  );
  const photosByFoodItemId = useMemo(
    () => groupSharedPhotosByFoodItemId(query.data?.photoPreviews ?? []),
    [query.data?.photoPreviews],
  );
  const savedListIdsByBookmarkLookupId = useMemo(() => {
    const mapping = new Map<string, Set<string>>();
    for (const [bookmarkLookupId, rawListIds] of Object.entries(
      query.data?.bookmarkState.savedListIdsByBookmarkLookupId ?? {},
    )) {
      const listIds = mapping.get(bookmarkLookupId) ?? new Set<string>();
      for (const listId of rawListIds) {
        if (listId.trim()) {
          listIds.add(listId.trim());
        }
      }
      mapping.set(bookmarkLookupId, listIds);
    }
    return mapping;
  }, [query.data?.bookmarkState.savedListIdsByBookmarkLookupId]);
  const savedBookmarkLookupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bookmarkLookupId of savedListIdsByBookmarkLookupId.keys()) {
      ids.add(bookmarkLookupId);
    }
    return ids;
  }, [savedListIdsByBookmarkLookupId]);
  const viewerLists = query.data?.viewerLists ?? [];
  const defaultList = viewerLists.find((viewerList) => viewerList.isDefault);
  const nonDefaultLists = viewerLists.filter((viewerList) => !viewerList.isDefault);
  const alreadySavedListIdsForTarget = useMemo(() => {
    const listIds = new Set<string>();
    if (!saveBookmarkTarget) {
      return listIds;
    }
    for (const bookmarkLookupId of saveBookmarkTarget.bookmarkLookupIds) {
      const existingListIds = savedListIdsByBookmarkLookupId.get(bookmarkLookupId);
      if (!existingListIds) {
        continue;
      }
      for (const listId of existingListIds) {
        listIds.add(listId);
      }
    }
    return listIds;
  }, [saveBookmarkTarget, savedListIdsByBookmarkLookupId]);

  const saveReturnTarget = async () => {
    await savePendingAuthRedirect({
      route: 'SharedRestaurantList',
      shareToken,
    });
  };

  const navigateToLogin = async () => {
    await saveReturnTarget();
    navigation.navigate('Login', {
      source: 'shared_list',
      sharedListToken: shareToken,
    });
  };

  const handleDownloadApp = async () => {
    setDownloadErrorMessage(null);
    trackProductEvent('social.invite_shared', {
      source: 'SharedRestaurantListScreen',
      shareMethod: 'shared_list_download_app',
    });

    try {
      await Linking.openURL(env.iosAppStoreUrl);
    } catch (error) {
      setDownloadErrorMessage(error instanceof Error ? error.message : 'Could not open the app download link.');
    }
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(isAuthenticated ? 'Home' : 'Onboarding');
    }
  };

  const closeSaveModal = () => {
    if (isSavingBookmark) {
      return;
    }
    setSaveBookmarkTarget(null);
    setSelectedSaveListIds(new Set());
    setSaveModalError(null);
  };

  const openSaveModal = (group: GroupedSharedRestaurant, item: GroupedBookmarkedItem) => {
    setSaveErrorMessage(null);
    setSaveModalError(null);
    setSelectedSaveListIds(new Set());
    setSaveBookmarkTarget({
      bookmarkLookupIds: item.bookmarkLookupIds,
      restaurantId: group.restaurantId,
      restaurantName: group.restaurantName,
      foodItemId: item.foodItemId,
      foodItemName: item.name,
      foodItemRating: item.rating,
      visitedAt: item.visitedAt,
      sourceNote: item.sourceNote,
    });
  };

  const toggleSaveListSelection = (listId: string) => {
    setSelectedSaveListIds((current) => {
      const next = new Set(current);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  };

  const saveBookmark = async (targetListIds: string[], trackingContext: { entryMethod: 'quick_default' | 'selected_lists'; createdDefaultList: boolean }) => {
    if (!saveBookmarkTarget) {
      return;
    }

    setIsSavingBookmark(true);
    setSaveModalError(null);
    setSaveErrorMessage(null);
    try {
      await saveSharedRestaurantListRecommendation({
        shareToken,
        restaurantId: saveBookmarkTarget.restaurantId,
        foodItemId: saveBookmarkTarget.foodItemId,
        targetListIds,
      });
      await query.refetch();
      trackProductEvent('social.recommendation_saved', {
        source: 'SharedRestaurantListScreen',
        entryMethod: trackingContext.entryMethod,
        targetListCount: Math.max(1, targetListIds.length),
        createdDefaultList: trackingContext.createdDefaultList,
      });
      setSaveBookmarkTarget(null);
      setSelectedSaveListIds(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this bookmark.';
      setSaveModalError(message);
      setSaveErrorMessage(message);
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleQuickSaveToDefaultList = async () => {
    if (!saveBookmarkTarget) {
      return;
    }
    if (defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id)) {
      setSaveModalError('This item is already in your Want to Try list.');
      return;
    }
    await saveBookmark(defaultList?.id ? [defaultList.id] : [], {
      entryMethod: 'quick_default',
      createdDefaultList: !defaultList?.id,
    });
  };

  const handleSaveToSelectedLists = async () => {
    const targetListIds = Array.from(selectedSaveListIds).filter((listId) => !alreadySavedListIdsForTarget.has(listId));
    if (targetListIds.length === 0) {
      setSaveModalError('Select at least one list.');
      return;
    }
    await saveBookmark(targetListIds, {
      entryMethod: 'selected_lists',
      createdDefaultList: false,
    });
  };

  const openPhotoViewer = (entries: OwnerItemPhotoEntry[]) => {
    if (entries.length === 0) {
      return;
    }
    setPhotoViewerPreviewUrls(entries.map((entry) => entry.previewUrl));
    setPhotoViewerUrls(entries.map((entry) => entry.url));
    setPhotoViewerOwnerLabels(entries.map((entry) => entry.ownerLabel));
    setPhotoViewerInitialIndex(0);
    setPhotoViewerVisible(true);
  };

  const list = query.data?.list ?? null;
  const restaurantCount = list?.restaurantCount ?? groupedRestaurants.length;
  const subtitle = list
    ? `${list.ownerName ? `${list.ownerName}'s list · ` : ''}${restaurantCount} ${
        restaurantCount === 1 ? 'restaurant' : 'restaurants'
      }`
    : undefined;

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      onBackPress={handleBack}
      primaryAction={
        !isAuthenticated
          ? {
              label: 'Download App',
              onPress: () => {
                void handleDownloadApp();
              },
              testID: 'shared-list-download-app-button',
            }
          : undefined
      }
      secondaryAction={
        !isAuthenticated
          ? {
              label: 'Sign In',
              onPress: () => {
                void navigateToLogin();
              },
              testID: 'shared-list-login-button',
            }
          : undefined
      }
      subtitle={subtitle}
      testID="shared-restaurant-list-screen"
      title={list?.name ?? 'Shared List'}
    >
      <View style={styles.container}>
        {query.isLoading ? (
          <>
            <Skeleton height={110} />
            <Skeleton height={160} />
            <Skeleton height={160} />
          </>
        ) : query.isError ? (
          <ErrorState
            description="Try refreshing the link."
            onRetry={() => {
              void query.refetch();
            }}
            title="This shared list is unavailable"
          />
        ) : !list ? (
          <ErrorState
            description="The owner may have disabled or regenerated this shared link."
            title="This shared list is unavailable"
          />
        ) : (
          <>
            {list.description ? <Text tone="secondary">{list.description}</Text> : null}

            <PageErrorToast errorMessage={downloadErrorMessage} title="Could not open download link" />
            <PageErrorToast errorMessage={saveErrorMessage} title="Could not save recommendation" />

            {groupedRestaurants.length === 0 ? (
              <EmptyState
                description="There are no restaurants in this shared list yet."
                title="No recommendations yet"
              />
            ) : (
              groupedRestaurants.map((group, groupIndex) => {
                const primaryMetaLabel = group.restaurantCity || group.restaurantCuisineType || 'Location not set';
                const secondaryMetaLabel =
                  group.restaurantCity && group.restaurantCuisineType ? group.restaurantCuisineType : null;

                return (
                  <ListDetailRestaurantRecommendationGroupCard
                    groupIndex={groupIndex}
                    items={group.items}
                    key={group.restaurantId}
                    mode="viewer"
                    notes={group.notes}
                    primaryMetaLabel={primaryMetaLabel}
                    renderItem={(item, itemIndex) => {
                      const isSaved = item.bookmarkLookupIds.some((bookmarkLookupId) =>
                        savedBookmarkLookupIds.has(bookmarkLookupId),
                      );
                      const photoEntries = buildSharedPhotoEntries(item, photosByFoodItemId);

                      return (
                        <ListDetailBookmarkedItemRow
                          canSave={isAuthenticated}
                          groupIndex={groupIndex}
                          isSaved={isSaved}
                          item={item}
                          itemIndex={itemIndex}
                          key={item.key}
                          onOpenPhotos={openPhotoViewer}
                          onSave={(targetItem) => {
                            openSaveModal(group, targetItem);
                          }}
                          photoEntries={photoEntries}
                        />
                      );
                    }}
                    restaurantId={group.restaurantId}
                    restaurantName={group.restaurantName}
                    secondaryMetaLabel={secondaryMetaLabel}
                  />
                );
              })
            )}
          </>
        )}
      </View>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={() => {
          setPhotoViewerVisible(false);
        }}
        ownerLabels={photoViewerOwnerLabels}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={photoViewerVisible}
      />

      <SaveRecommendationToListModal
        alreadySavedListIds={alreadySavedListIdsForTarget}
        defaultList={defaultList}
        errorMessage={saveModalError}
        isSaving={isSavingBookmark}
        onClose={closeSaveModal}
        onQuickSave={() => {
          void handleQuickSaveToDefaultList();
        }}
        onSaveSelectedLists={() => {
          void handleSaveToSelectedLists();
        }}
        onToggleList={toggleSaveListSelection}
        selectedListIds={selectedSaveListIds}
        target={saveBookmarkTarget}
        targetLists={nonDefaultLists}
      />
    </FeatureDetailScreenScaffold>
  );
}
