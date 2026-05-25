import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PhotoViewerModal,
  RatingPill,
  SectionHeader,
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
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Modal, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { formatMonthYearLabel, buildBookmarkLookupIds } from './listDetail/listDetailFormatters';
import { ListDetailBookmarkedItemRow } from './listDetail/ListDetailBookmarkedItemRow';
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
  listCard: {
    gap: theme.spacing.sm,
  },
  restaurantHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  restaurantTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  restaurantIndex: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyLgMedium,
  },
  restaurantTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLgBold,
  },
  locationRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  locationIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  locationPrimaryText: {
    color: theme.colors.text.secondary,
    flex: 1,
    minWidth: 0,
    ...theme.typography.bodyMd,
  },
  section: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  emptyItemsText: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyMd,
  },
  noteText: {
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    ...theme.typography.bodyMd,
  },
  metaDot: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  bookmarkedDate: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  saveModalItemCard: {
    gap: theme.spacing.xs,
  },
  saveModalCaption: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySmTightBold,
  },
  saveModalItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  saveModalItemName: {
    color: theme.colors.text.primary,
    flexShrink: 1,
    ...theme.typography.bodyLgTightMedium,
  },
  saveListHeader: {
    marginTop: theme.spacing.xs,
  },
  saveListRows: {
    gap: theme.spacing.xs,
  },
  saveListRow: {
    alignItems: 'flex-start',
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  saveListRowSelected: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
  saveListRowDisabled: {
    opacity: 0.72,
  },
  saveListLabelWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  saveListLabelTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  saveListName: {
    color: theme.colors.text.primary,
    flexShrink: 1,
    ...theme.typography.bodyMdMedium,
  },
  saveListDescription: {
    color: theme.colors.text.secondary,
    ...theme.typography.bodySm,
  },
  saveListAlreadyLabel: {
    color: theme.colors.text.success,
    ...theme.typography.bodySmTightBold,
  },
  saveModalError: {
    color: theme.colors.text.danger,
    ...theme.typography.bodySm,
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
  const theme = useTheme();
  const styles = useStyles();
  const [ctaModalVisible, setCtaModalVisible] = useState(false);
  const [saveBookmarkTarget, setSaveBookmarkTarget] = useState<SaveBookmarkTarget | null>(null);
  const [selectedSaveListIds, setSelectedSaveListIds] = useState<Set<string>>(new Set());
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
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

  const navigateToSignUp = async () => {
    await saveReturnTarget();
    setCtaModalVisible(false);
    navigation.navigate('SignUp', {
      mode: 'join_waitlist',
      source: 'shared_list',
      sharedListToken: shareToken,
    });
  };

  const navigateToLogin = async () => {
    await saveReturnTarget();
    setCtaModalVisible(false);
    navigation.navigate('Login', {
      source: 'shared_list',
      sharedListToken: shareToken,
    });
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
      setSaveModalError('This item is already in your Saved list.');
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

  const isDefaultListAlreadySaved = Boolean(defaultList?.id && alreadySavedListIdsForTarget.has(defaultList.id));
  const saveModalPrimaryLabel =
    selectedSaveListIds.size === 1
      ? 'Save to 1 list'
      : `Save to ${selectedSaveListIds.size} lists`;

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      onBackPress={handleBack}
      primaryAction={
        !isAuthenticated
          ? {
              label: 'Save Recommendations',
              onPress: () => {
                trackObservabilityEvent('SHARED_LIST_SAVE_RECOMMENDATIONS_TAPPED', {
                  source: 'SharedRestaurantListScreen',
                });
                setCtaModalVisible(true);
              },
              testID: 'shared-list-save-recommendations-button',
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
                  <Card key={group.restaurantId} style={styles.listCard} tone="default">
                    <View style={styles.restaurantHeaderRow}>
                      <View style={styles.restaurantTitleRow}>
                        <Text style={styles.restaurantIndex}>{`${groupIndex + 1}.`}</Text>
                        <Text style={styles.restaurantTitle}>{group.restaurantName}</Text>
                      </View>
                    </View>

                    <View style={styles.locationRow}>
                      <Ionicons
                        color={theme.colors.text.muted}
                        name="location-outline"
                        size={14}
                        style={styles.locationIcon}
                      />
                      <Text style={styles.locationPrimaryText}>
                        {secondaryMetaLabel ? `${primaryMetaLabel} • ${secondaryMetaLabel}` : primaryMetaLabel}
                      </Text>
                    </View>

                    <View style={styles.section}>
                      <SectionHeader title="Recommended Items" titleTone="secondary" />
                      {group.items.length === 0 ? (
                        <Text style={styles.emptyItemsText}>No items added yet.</Text>
                      ) : (
                        group.items.map((item, itemIndex) => {
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
                        })
                      )}
                    </View>

                    {group.notes.length > 0 ? (
                      <View style={styles.section}>
                        <SectionHeader title="Notes" titleTone="secondary" />
                        {group.notes.map((note, noteIndex) => (
                          <Text key={`${group.restaurantId}-note-${noteIndex}`} style={styles.noteText}>
                            "{note}"
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </Card>
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

      <Modal
        description="Create an account or sign in to save recommendations from this list to your own lists."
        onRequestClose={() => {
          setCtaModalVisible(false);
        }}
        primaryAction={{
          label: 'Join Waitlist',
          onPress: () => {
            void navigateToSignUp();
          },
          testID: 'shared-list-cta-signup-button',
        }}
        secondaryAction={{
          label: 'Sign In',
          onPress: () => {
            void navigateToLogin();
          },
          testID: 'shared-list-cta-login-button',
        }}
        testID="shared-list-auth-cta-modal"
        title="Save recommendations"
        visible={ctaModalVisible}
      />

      <Modal
        description="Choose where to save this bookmarked item."
        onRequestClose={closeSaveModal}
        primaryAction={{
          disabled: isSavingBookmark || selectedSaveListIds.size === 0,
          label: saveModalPrimaryLabel,
          loading: isSavingBookmark,
          onPress: () => {
            void handleSaveToSelectedLists();
          },
        }}
        secondaryAction={{
          disabled: isSavingBookmark,
          label: 'Cancel',
          onPress: closeSaveModal,
        }}
        title={saveBookmarkTarget ? `Save from "${saveBookmarkTarget.restaurantName}"` : undefined}
        visible={Boolean(saveBookmarkTarget)}
      >
        {saveBookmarkTarget ? (
          <Card style={styles.saveModalItemCard} tone="info">
            <Text style={styles.saveModalCaption}>Selected item</Text>
            <View style={styles.saveModalItemRow}>
              <Text style={styles.saveModalItemName}>{saveBookmarkTarget.foodItemName}</Text>
              <Text style={styles.metaDot}>•</Text>
              <RatingPill rating={saveBookmarkTarget.foodItemRating} />
              {formatMonthYearLabel(saveBookmarkTarget.visitedAt) ? (
                <>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.bookmarkedDate}>{formatMonthYearLabel(saveBookmarkTarget.visitedAt)}</Text>
                </>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Button
          disabled={isSavingBookmark || !saveBookmarkTarget || isDefaultListAlreadySaved}
          label={
            isDefaultListAlreadySaved
              ? 'Already in "Saved" list'
              : defaultList
                ? 'Quick Save to "Saved" list'
                : 'Create & Save to "Saved" list'
          }
          onPress={() => {
            void handleQuickSaveToDefaultList();
          }}
          variant="secondary"
        />

        {nonDefaultLists.length > 0 ? (
          <>
            <SectionHeader style={styles.saveListHeader} title="Or choose lists" titleTone="secondary" />
            <View style={styles.saveListRows}>
              {nonDefaultLists.map((targetList) => {
                const alreadySavedInList = alreadySavedListIdsForTarget.has(targetList.id);
                const isSelected = selectedSaveListIds.has(targetList.id);
                const visibilityIconName =
                  targetList.visibility === 'friends' ? 'people-outline' : 'lock-closed-outline';

                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={alreadySavedInList}
                    key={targetList.id}
                    onPress={() => {
                      toggleSaveListSelection(targetList.id);
                    }}
                    style={[
                      styles.saveListRow,
                      isSelected ? styles.saveListRowSelected : null,
                      alreadySavedInList ? styles.saveListRowDisabled : null,
                    ]}
                  >
                    <Ionicons
                      color={alreadySavedInList ? theme.colors.text.success : theme.colors.text.muted}
                      name={alreadySavedInList || isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                    />
                    <View style={styles.saveListLabelWrap}>
                      <View style={styles.saveListLabelTop}>
                        <Text style={styles.saveListName}>{targetList.name}</Text>
                        <Ionicons color={theme.colors.text.muted} name={visibilityIconName} size={13} />
                      </View>
                      {targetList.description ? (
                        <Text numberOfLines={1} style={styles.saveListDescription}>
                          {targetList.description}
                        </Text>
                      ) : null}
                      {alreadySavedInList ? <Text style={styles.saveListAlreadyLabel}>Already saved in this list</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <SectionHeader
            style={styles.saveListHeader}
            title="No additional lists yet. Use quick save or create a list."
            titleTone="secondary"
          />
        )}

        {saveModalError ? <Text style={styles.saveModalError}>{saveModalError}</Text> : null}
      </Modal>
    </FeatureDetailScreenScaffold>
  );
}
