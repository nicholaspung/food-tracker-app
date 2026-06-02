import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import {
  AuthBrandMark,
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
import { APP_NAME } from '../lib/branding';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { buildBookmarkLookupIds } from './listDetail/listDetailFormatters';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
import { ListDetailRestaurantRecommendationGroupCard } from './listDetail/ListDetailRestaurantRecommendationGroupCard';
import type { GroupedBookmarkedItem, OwnerItemPhotoEntry } from './listDetail/listDetailTypes';

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
  guestHeader: {
    backgroundColor: theme.colors.background.surface,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  guestHeaderBrandButton: {
    alignSelf: 'flex-start',
  },
  guestHeaderTitle: {
    color: theme.colors.text.primary,
  },
  guestHeaderSubtitle: {
    color: theme.colors.text.muted,
  },
}));

function mapSharedBookmarkItem(item: RestaurantListBookmarkedItemRecord): GroupedBookmarkedItem {
  return {
    key: `${item.listItemId}:${item.id}`,
    bookmarkLookupIds: buildBookmarkLookupIds(item.id, item.userFoodItemId),
    foodItemId: item.id,
    foodItemRestaurantId: item.restaurantId,
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
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const [marketingLinkErrorMessage, setMarketingLinkErrorMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
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
  const viewerLists = query.data?.viewerLists ?? [];
  const defaultList = viewerLists.find((viewerList) => viewerList.isDefault);

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

  const handleOpenMarketingPage = async () => {
    setMarketingLinkErrorMessage(null);
    try {
      await Linking.openURL(env.marketingUrl);
    } catch (error) {
      setMarketingLinkErrorMessage(error instanceof Error ? error.message : 'Could not open the marketing page.');
    }
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(isAuthenticated ? 'Home' : 'Onboarding');
    }
  };

  const isItemSavedToDefaultList = (item: GroupedBookmarkedItem) => {
    const defaultListId = defaultList?.id;
    if (!defaultListId) {
      return false;
    }
    return item.bookmarkLookupIds.some((bookmarkLookupId) =>
      savedListIdsByBookmarkLookupId.get(bookmarkLookupId)?.has(defaultListId),
    );
  };

  const saveBookmarkToWantToTry = async (
    group: GroupedSharedRestaurant,
    item: GroupedBookmarkedItem,
  ) => {
    if (isSavingBookmark || isItemSavedToDefaultList(item)) {
      return;
    }

    setIsSavingBookmark(true);
    setSaveErrorMessage(null);
    try {
      const targetListIds = defaultList?.id ? [defaultList.id] : [];
      await saveSharedRestaurantListRecommendation({
        shareToken,
        restaurantId: item.foodItemRestaurantId ?? group.restaurantId,
        foodItemId: item.foodItemId,
        targetListIds,
      });
      await query.refetch();
      trackProductEvent('social.recommendation_saved', {
        source: 'SharedRestaurantListScreen',
        entryMethod: 'quick_default',
        targetListCount: 1,
        createdDefaultList: !defaultList?.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this bookmark.';
      setSaveErrorMessage(message);
    } finally {
      setIsSavingBookmark(false);
    }
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
  const guestHeader = !isAuthenticated ? (
    <View style={styles.guestHeader}>
      <Pressable
        accessibilityLabel={`Open ${APP_NAME} website`}
        accessibilityRole="link"
        onPress={() => {
          void handleOpenMarketingPage();
        }}
        style={styles.guestHeaderBrandButton}
        testID="shared-list-marketing-link"
      >
        <AuthBrandMark size="large" />
      </Pressable>
      <Text style={styles.guestHeaderTitle} variant="titleMd">
        {list?.name ?? 'Shared List'}
      </Text>
      {subtitle ? (
        <Text style={styles.guestHeaderSubtitle} tone="muted" variant="bodyMd">
          {subtitle}
        </Text>
      ) : null}
    </View>
  ) : undefined;

  return (
    <FeatureDetailScreenScaffold
      customHeader={guestHeader}
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
            <PageErrorToast errorMessage={marketingLinkErrorMessage} title="Could not open website" />
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
                      const photoEntries = buildSharedPhotoEntries(item, photosByFoodItemId);

                      return (
                        <ListDetailBookmarkedItemRow
                          canSave={isAuthenticated}
                          groupIndex={groupIndex}
                          isSaved={isItemSavedToDefaultList(item)}
                          item={item}
                          itemIndex={itemIndex}
                          key={item.key}
                          onOpenPhotos={openPhotoViewer}
                          onSave={(targetItem) => {
                            void saveBookmarkToWantToTry(group, targetItem);
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

    </FeatureDetailScreenScaffold>
  );
}
