import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, View } from 'react-native';

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
  invalidateRestaurantListContentQueries,
  restaurantListQueryKeys,
  saveSharedRestaurantListRecommendation,
} from '../features';
import { buildRestaurantListDetailReadModel } from '../features/restaurantLists/restaurantListDetailReadModel';
import type {
  GroupedBookmarkedItem,
  GroupedRestaurant,
  OwnerItemPhotoEntry,
} from '../features/restaurantLists/listDetailTypes';
import {
  createRecommendationSourceHandoff,
  resolveSharedRecommendationSourceListItemId,
} from '../features/recommendationSourceHandoff';
import { savePendingAuthRedirect } from '../lib/pendingAuthRedirect';
import { env } from '../config/env';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { APP_NAME } from '../lib/branding';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
import { ListDetailRestaurantRecommendationGroupCard } from './listDetail/ListDetailRestaurantRecommendationGroupCard';

type SharedRestaurantListScreenProps = NativeStackScreenProps<RootStackParamList, 'SharedRestaurantList'>;
const SHARED_LIST_PAGE_SIZE = 20;

const useStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    gap: theme.spacing.md,
  },
  screenBody: {
    flex: 1,
    paddingBottom: 0,
    paddingTop: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  listItemSeparator: {
    height: theme.spacing.sm,
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

export function SharedRestaurantListScreen({ navigation, route }: SharedRestaurantListScreenProps) {
  const { shareToken } = route.params;
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [locallySavedDefaultBookmarkLookupIds, setLocallySavedDefaultBookmarkLookupIds] = useState<Set<string>>(
    new Set(),
  );
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const [marketingLinkErrorMessage, setMarketingLinkErrorMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerOwnerLabels, setPhotoViewerOwnerLabels] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const isAuthenticated = status === 'authenticated';

  const query = useInfiniteQuery({
    queryKey: restaurantListQueryKeys.sharedPages(shareToken),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getSharedRestaurantList(shareToken, {
        page: pageParam,
        pageSize: SHARED_LIST_PAGE_SIZE,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? (lastPage.page ?? 1) + 1 : undefined,
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

  const loadedSharedList = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const firstPage = pages[0];
    if (!firstPage) {
      return undefined;
    }
    const lastPage = pages[pages.length - 1] ?? firstPage;

    return {
      ...firstPage,
      items: pages.flatMap((page) => page.items),
      photoPreviews: pages.flatMap((page) => page.photoPreviews),
      page: lastPage.page ?? pages.length,
      pageSize: lastPage.pageSize,
      totalItems: lastPage.totalItems,
      totalPages: lastPage.totalPages,
      hasNextPage: lastPage.hasNextPage,
    };
  }, [query.data?.pages]);
  const readModel = useMemo(
    () => buildRestaurantListDetailReadModel({
      variant: 'shared',
      detail: loadedSharedList,
      locallySavedDefaultBookmarkLookupIds,
    }),
    [loadedSharedList, locallySavedDefaultBookmarkLookupIds],
  );
  const { defaultList, restaurantRows } = readModel;

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

  const saveBookmarkToWantToTry = async (
    group: GroupedRestaurant,
    item: GroupedBookmarkedItem,
  ) => {
    const row = restaurantRows.find((candidate) => candidate.group.restaurantId === group.restaurantId);
    const isSaved = row?.bookmarkedItems.find((candidate) => candidate.key === item.key)?.isSaved === true;
    if (isSavingBookmark || group.restaurantVisibility === 'private' || isSaved) {
      return;
    }

    setIsSavingBookmark(true);
    setSaveErrorMessage(null);
    try {
      const targetListIds = defaultList?.id ? [defaultList.id] : [];
      const recommendationSource = createRecommendationSourceHandoff({
        discoverySurface: 'shared_restaurant_list',
        sourceFoodItemId: item.foodItemId,
        sourceListItemId: item.listItemId,
        sourceUserId: item.sourceUserId,
      });
      await saveSharedRestaurantListRecommendation({
        shareToken,
        restaurantId: item.foodItemRestaurantId ?? group.restaurantId,
        foodItemId: item.foodItemId,
        sourceListItemId: resolveSharedRecommendationSourceListItemId(recommendationSource),
        targetListIds,
      });
      setLocallySavedDefaultBookmarkLookupIds((current) => {
        const next = new Set(current);
        for (const bookmarkLookupId of item.bookmarkLookupIds) {
          next.add(bookmarkLookupId);
        }
        return next;
      });
      await Promise.all([
        query.refetch(),
        ...targetListIds.map((targetListId) => invalidateRestaurantListContentQueries(queryClient, targetListId)),
      ]);
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

  const { list, subtitle } = readModel;
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
      scroll={false}
      screenBackgroundTone="surface"
      onBackPress={handleBack}
      bodyStyle={styles.screenBody}
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
            <PageErrorToast errorMessage={downloadErrorMessage} title="Could not open download link" />
            <PageErrorToast errorMessage={marketingLinkErrorMessage} title="Could not open website" />
            <PageErrorToast errorMessage={saveErrorMessage} title="Could not save recommendation" />

            <FlatList
              contentContainerStyle={styles.listContent}
              data={restaurantRows}
              style={styles.list}
              testID="shared-list-rows"
              ItemSeparatorComponent={() => <View style={styles.listItemSeparator} />}
              keyExtractor={(row) => row.group.restaurantId}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <EmptyState
                  description="There are no restaurants in this shared list yet."
                  title="No recommendations yet"
                />
              }
              onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage) {
                  void query.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.4}
              renderItem={({ item: row }) => {
                const { group, groupIndex } = row;
                return (
                  <ListDetailRestaurantRecommendationGroupCard
                    groupIndex={groupIndex}
                    isLocked={row.isRestaurantLocked}
                    items={row.bookmarkedItems}
                    key={group.restaurantId}
                    lockTestID={`shared-list-locked-restaurant-${group.restaurantId}`}
                    mode="viewer"
                    notes={group.notes}
                    primaryMetaLabel={row.primaryMetaLabel}
                    renderItem={(item, itemIndex) => (
                        <ListDetailBookmarkedItemRow
                          canSave={isAuthenticated && !row.isRestaurantLocked}
                          groupIndex={groupIndex}
                          isSaved={item.isSaved}
                          item={item}
                          itemIndex={itemIndex}
                          key={item.key}
                          onOpenPhotos={openPhotoViewer}
                          onSave={(targetItem) => {
                            void saveBookmarkToWantToTry(group, targetItem);
                          }}
                          photoEntries={item.photoEntries}
                        />
                    )}
                    restaurantId={group.restaurantId}
                    restaurantName={group.restaurantName}
                    secondaryMetaLabel={row.secondaryMetaLabel}
                  />
                );
              }}
            />
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
