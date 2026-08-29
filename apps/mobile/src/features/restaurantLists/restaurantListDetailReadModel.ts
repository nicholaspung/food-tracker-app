import type { RestaurantMapGroup } from '../../components/maps';
import type {
  RestaurantListRecord,
  SharedRestaurantListDetailRecord,
  SharedRestaurantListRecord,
} from '../models';
import type { RestaurantListDetailRecord } from '../store/featureStore';
import { buildBookmarkLookupIds, formatFullDateLabel, formatMonthYearLabel } from './listDetailFormatters';
import { buildOwnerDisplayItems, buildViewerDisplayItems } from './listDetailDisplayItems';
import {
  buildBookmarkedItemPhotoEntries,
  buildOwnerItemPhotoEntries,
  buildSharedBookmarkedItemPhotoEntries,
  groupListDetailPhotosByFoodItemId,
  groupSharedListPhotosByFoodItemId,
} from './listDetailPhotoEntries';
import type {
  GroupedBookmarkedItem,
  GroupedRestaurant,
  OwnerDisplayItem,
  OwnerItemPhotoEntry,
} from './listDetailTypes';

export interface AuthenticatedListDetailReadModelInput {
  variant: 'authenticated';
  detail: RestaurantListDetailRecord | undefined;
  userId: string | undefined;
  saveBookmarkTarget: { bookmarkLookupIds: readonly string[] } | null;
  isError: boolean;
  isLoading: boolean;
}

export interface SharedListDetailReadModelInput {
  variant: 'shared';
  detail: SharedRestaurantListDetailRecord | undefined;
  locallySavedDefaultBookmarkLookupIds: ReadonlySet<string>;
}

export interface ListDetailRestaurantRow {
  group: GroupedRestaurant;
  groupIndex: number;
  primaryMetaLabel: string;
  secondaryMetaLabel: string | null;
  isRestaurantLocked: boolean;
  ownerDisplayItems: OwnerDisplayItem[];
  bookmarkedItems: (GroupedBookmarkedItem & {
    isSaved: boolean;
    photoEntries: OwnerItemPhotoEntry[];
  })[];
  ownerItems: (OwnerDisplayItem & {
    photoEntries: OwnerItemPhotoEntry[];
  })[];
}

export interface ListDetailMapItemRow {
  id: string;
  meta: RestaurantMapGroup['items'][number]['meta'];
  name: string;
  notes?: string;
  photoCount: number;
  photoEntries: OwnerItemPhotoEntry[];
  photoThumbnailUrl: string | null;
}

export interface ListDetailMapGroupRow {
  id: string;
  items: ListDetailMapItemRow[];
  latitude: number;
  longitude: number;
  notes: string[];
  restaurantLocation?: string;
  restaurantName: string;
  summary: string;
}

export interface ListDetailReadModel {
  list: RestaurantListRecord | null;
  listItems: RestaurantListDetailRecord['items'];
  isOwner: boolean;
  isDefaultList: boolean;
  groupedRestaurants: GroupedRestaurant[];
  restaurantRows: ListDetailRestaurantRow[];
  savedListIdsByBookmarkLookupId: Map<string, Set<string>>;
  savedBookmarkLookupIds: Set<string>;
  myLists: RestaurantListRecord[];
  defaultList: RestaurantListRecord | undefined;
  nonDefaultLists: RestaurantListRecord[];
  alreadySavedListIdsForTarget: Set<string>;
  isLoadingMyLists: boolean;
  hasBlockingListItemsError: boolean;
  hasListItemsRefreshError: boolean;
  hasListsRefreshError: boolean;
  subtitle: string;
  emptyRestaurantsDescription: string;
  analyticsContext: {
    source: 'ListDetailScreen';
    isDefaultList: boolean;
    restaurantCount: number;
  };
}

export interface SharedListDetailReadModel {
  list: SharedRestaurantListRecord | null;
  groupedRestaurants: GroupedRestaurant[];
  restaurantRows: ListDetailRestaurantRow[];
  savedListIdsByBookmarkLookupId: Map<string, Set<string>>;
  defaultList: RestaurantListRecord | undefined;
  subtitle: string | undefined;
}

function hasUsableCoordinates(group: GroupedRestaurant): group is GroupedRestaurant & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof group.latitude === 'number' &&
    typeof group.longitude === 'number' &&
    Number.isFinite(group.latitude) &&
    Number.isFinite(group.longitude) &&
    group.latitude >= -90 &&
    group.latitude <= 90 &&
    group.longitude >= -180 &&
    group.longitude <= 180 &&
    !(group.latitude === 0 && group.longitude === 0)
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildGroupedRestaurants(
  listItems: RestaurantListDetailRecord['items'],
  variant: 'authenticated' | 'shared',
): GroupedRestaurant[] {
  const groups = new Map<string, GroupedRestaurant>();
  const proofKeysByRestaurant = new Map<string, Set<string>>();

  for (const listItem of listItems) {
    const normalizedBookmarkedItems = Array.isArray(listItem.bookmarkedItems)
      ? listItem.bookmarkedItems
      : [];
    const existingGroup = groups.get(listItem.restaurantId);
    const group: GroupedRestaurant =
      existingGroup ??
      {
        restaurantId: listItem.restaurantId,
        restaurantName: listItem.restaurantName,
        restaurantLocation: listItem.restaurantLocation,
        restaurantCity: listItem.restaurantCity,
        restaurantCuisineType: listItem.restaurantCuisineType,
        restaurantVisibility: listItem.restaurantVisibility,
        latitude: listItem.latitude,
        longitude: listItem.longitude,
        notes: [],
        firstPosition: listItem.position,
        items: [],
      };

    group.firstPosition = Math.min(group.firstPosition, listItem.position);
    group.restaurantName = listItem.restaurantName;
    group.restaurantLocation = listItem.restaurantLocation;
    group.restaurantCity = listItem.restaurantCity;
    group.restaurantCuisineType = listItem.restaurantCuisineType;
    group.restaurantVisibility = listItem.restaurantVisibility;
    group.latitude = listItem.latitude;
    group.longitude = listItem.longitude;

    if (listItem.note && !group.notes.includes(listItem.note)) {
      group.notes.push(listItem.note);
    }

    if ((listItem.friendMatches?.length ?? 0) > 0 && (group.friendMatches?.length ?? 0) === 0) {
      group.friendMatches = listItem.friendMatches;
      group.friendOverlapCount = listItem.friendOverlapCount;
    }
    if ((listItem.recommendationUsageProofs?.length ?? 0) > 0) {
      const proofKeys = proofKeysByRestaurant.get(listItem.restaurantId) ?? new Set<string>();
      const nextProofs = [...(group.recommendationUsageProofs ?? [])];
      for (const proof of listItem.recommendationUsageProofs ?? []) {
        const proofKey = `${proof.actorId}:${proof.kind}:${proof.action}:${proof.actedAt}`;
        if (proofKeys.has(proofKey)) {
          continue;
        }
        proofKeys.add(proofKey);
        nextProofs.push(proof);
      }
      proofKeysByRestaurant.set(listItem.restaurantId, proofKeys);
      group.recommendationUsageProofs = nextProofs;
    }

    if (normalizedBookmarkedItems.length === 0 && !group.restaurantBookmarkListItemId) {
      group.restaurantBookmarkListItemId = listItem.id;
      if ((group.friendMatches?.length ?? 0) === 0) {
        group.friendOverlapCount = listItem.friendOverlapCount;
        group.friendMatches = listItem.friendMatches;
      }
    }

    for (const item of normalizedBookmarkedItems) {
      const sourceListItemId = variant === 'shared' ? item.listItemId || listItem.id : listItem.id;
      group.items.push({
        key: `${sourceListItemId}:${item.id}`,
        bookmarkLookupIds: buildBookmarkLookupIds(item.id, item.userFoodItemId),
        foodItemId: item.id,
        foodItemRestaurantId: item.restaurantId,
        menuItemId: item.menuItemId,
        listItemId: sourceListItemId,
        name: item.name,
        rating: item.rating,
        visitedAt: item.visitedAt,
        sourceUserId: item.sourceUserId ?? listItem.sourceUserId,
        sourceUserName: item.sourceUserName ?? listItem.sourceUserName,
        sourceNote: listItem.note,
        userFoodItemId: item.userFoodItemId,
        userFoodItemRestaurantId: item.userFoodItemRestaurantId,
        userFoodItemRating: item.userFoodItemRating,
        userFoodItemVisitedAt: item.userFoodItemVisitedAt,
      });
    }

    groups.set(listItem.restaurantId, group);
  }

  return Array.from(groups.values()).sort((left, right) => left.firstPosition - right.firstPosition);
}

function buildSavedListIdsByBookmarkLookupId(
  savedListIdsByBookmarkLookupId: Record<string, string[]> | undefined,
): Map<string, Set<string>> {
  const mapping = new Map<string, Set<string>>();
  for (const [bookmarkLookupId, rawListIds] of Object.entries(
    savedListIdsByBookmarkLookupId ?? {},
  )) {
    const listIds = mapping.get(bookmarkLookupId) ?? new Set<string>();
    for (const candidateListId of rawListIds) {
      if (!candidateListId?.trim()) {
        continue;
      }
      listIds.add(candidateListId);
    }
    mapping.set(bookmarkLookupId, listIds);
  }
  return mapping;
}

export function buildRestaurantListDetailMapProjection(
  restaurantRows: readonly ListDetailRestaurantRow[],
  isOwner: boolean,
  isDefaultList: boolean,
  allRestaurantRows: readonly ListDetailRestaurantRow[] = restaurantRows,
): ListDetailMapGroupRow[] {
  const mapGroups: ListDetailMapGroupRow[] = [];
  const visibleRowsByRestaurantId = new Map(
    restaurantRows.map((row) => [row.group.restaurantId, row]),
  );
  let eligibleMapGroupCount = 0;

  for (const candidateRow of allRestaurantRows) {
    const { group } = candidateRow;
    if (!hasUsableCoordinates(group)) {
      continue;
    }
    eligibleMapGroupCount += 1;

    const row = visibleRowsByRestaurantId.get(group.restaurantId);
    if (!row) {
      continue;
    }

    const items = isOwner
      ? row.ownerItems.map((item) => {
          const { photoEntries } = item;
          const sourceDateLabel = formatMonthYearLabel(item.source?.visitedAt);
          const userDateLabel =
            formatFullDateLabel(item.user?.visitedAt) ?? formatMonthYearLabel(item.user?.visitedAt);
          const primaryPhoto = photoEntries[0] ?? null;

          return {
            id: item.key,
            meta: [
              {
                dateLabel: sourceDateLabel,
                label: item.source?.sourceUserName,
                rating: item.source?.rating,
              },
              {
                dateLabel: userDateLabel,
                label: item.user ? 'You' : undefined,
                rating: item.user?.rating,
              },
            ],
            name: item.name,
            photoCount: photoEntries.length,
            photoEntries,
            photoThumbnailUrl: primaryPhoto?.previewUrl ?? null,
          };
        })
      : row.bookmarkedItems.map((item) => {
          const { photoEntries } = item;
          const primaryPhoto = photoEntries[0] ?? null;
          const sourceUserDisplayName = item.sourceUserName?.trim() || (item.sourceUserId ? 'Friend' : undefined);

          return {
            id: item.key,
            meta: [
              {
                dateLabel: formatMonthYearLabel(item.visitedAt),
                label: sourceUserDisplayName,
                rating: item.rating,
              },
            ],
            name: item.name,
            notes: item.sourceNote,
            photoCount: photoEntries.length,
            photoEntries,
            photoThumbnailUrl: primaryPhoto?.previewUrl ?? null,
          };
        });

    mapGroups.push({
      id: group.restaurantId,
      items,
      latitude: group.latitude,
      longitude: group.longitude,
      notes: group.notes,
      restaurantLocation: group.restaurantLocation ?? group.restaurantCity,
      restaurantName: group.restaurantName,
      summary: `${eligibleMapGroupCount}. ${
        isDefaultList
          ? 'bookmarked restaurant'
          : pluralize(
              items.length,
              isOwner ? 'bookmarked item' : 'recommended item',
              isOwner ? 'bookmarked items' : 'recommended items',
            )
      }`,
    });
  }

  return mapGroups;
}

function buildAuthenticatedListDetailReadModel({
  detail,
  isError,
  isLoading,
  saveBookmarkTarget,
  userId,
}: AuthenticatedListDetailReadModelInput): ListDetailReadModel {
  const list = detail?.list ?? null;
  const isOwner = Boolean(list && userId && list.userId === userId);
  const isDefaultList = Boolean(list?.isDefault);
  const listItems = detail?.items ?? [];
  const hasBlockingListItemsError = isError && detail === undefined;
  const hasListItemsRefreshError = !hasBlockingListItemsError && isError;
  const savedListIdsByBookmarkLookupId = buildSavedListIdsByBookmarkLookupId(
    detail?.bookmarkState.savedListIdsByBookmarkLookupId,
  );
  const savedBookmarkLookupIds = new Set(savedListIdsByBookmarkLookupId.keys());
  const myLists = detail?.viewerLists ?? [];
  const defaultList = myLists.find((candidate) => candidate.isDefault);
  const nonDefaultLists = myLists.filter((candidate) => !candidate.isDefault);
  const isLoadingMyLists = Boolean(saveBookmarkTarget && !isOwner && isLoading && myLists.length === 0);
  const alreadySavedListIdsForTarget = new Set<string>();

  if (saveBookmarkTarget) {
    for (const bookmarkLookupId of saveBookmarkTarget.bookmarkLookupIds) {
      const existingListIds = savedListIdsByBookmarkLookupId.get(bookmarkLookupId);
      if (!existingListIds) {
        continue;
      }

      for (const targetListId of existingListIds) {
        alreadySavedListIdsForTarget.add(targetListId);
      }
    }
  }

  const groupedRestaurants = buildGroupedRestaurants(listItems, 'authenticated');
  const photosByFoodItemId = groupListDetailPhotosByFoodItemId(detail?.photoPreviews ?? []);
  const restaurantRows = groupedRestaurants.map((group, groupIndex) => {
    const primaryMetaLabel = group.restaurantCity || group.restaurantCuisineType || 'Location not set';
    const secondaryMetaLabel = group.restaurantCity && group.restaurantCuisineType ? group.restaurantCuisineType : null;
    const isRestaurantLocked = group.restaurantVisibility === 'private';
    const ownerDisplayItems = isOwner ? buildOwnerDisplayItems(group.items) : [];
    const viewerDisplayItems = isOwner ? group.items : buildViewerDisplayItems(group.items);

    return {
      group,
      groupIndex,
      primaryMetaLabel,
      secondaryMetaLabel,
      isRestaurantLocked,
      ownerDisplayItems,
      ownerItems: ownerDisplayItems.map((item) => ({
        ...item,
        photoEntries: buildOwnerItemPhotoEntries(item, photosByFoodItemId),
      })),
      bookmarkedItems: viewerDisplayItems.map((item) => ({
        ...item,
        isSaved: item.bookmarkLookupIds.some((bookmarkLookupId) => savedBookmarkLookupIds.has(bookmarkLookupId)),
        photoEntries: buildBookmarkedItemPhotoEntries(item, photosByFoodItemId),
      })),
    };
  });
  const restaurantCount = list?.restaurantCount ?? groupedRestaurants.length;
  const countLabel = `${restaurantCount} ${restaurantCount === 1 ? 'restaurant' : 'restaurants'}`;
  const descriptionLabel = list?.description?.trim();
  const subtitle = !list
    ? countLabel
    : isOwner
      ? descriptionLabel
        ? `${countLabel}\n${descriptionLabel}`
        : countLabel
      : descriptionLabel
        ? `${list.ownerName ?? 'Unknown user'}'s list · ${countLabel}\n${descriptionLabel}`
        : `${list.ownerName ?? 'Unknown user'}'s list · ${countLabel}`;

  return {
    list,
    listItems,
    isOwner,
    isDefaultList,
    groupedRestaurants,
    restaurantRows,
    savedListIdsByBookmarkLookupId,
    savedBookmarkLookupIds,
    myLists,
    defaultList,
    nonDefaultLists,
    alreadySavedListIdsForTarget,
    isLoadingMyLists,
    hasBlockingListItemsError,
    hasListItemsRefreshError,
    hasListsRefreshError: Boolean(saveBookmarkTarget && !isOwner && isError),
    subtitle,
    emptyRestaurantsDescription: isDefaultList
      ? 'Bookmark restaurants and recommendations from Food Discovery or your feed to save them here.'
      : isOwner
        ? 'Use Add Visit Ratings to List to save your first restaurant.'
        : 'No restaurants have been added to this list yet.',
    analyticsContext: {
      source: 'ListDetailScreen',
      isDefaultList: Boolean(list?.isDefault),
      restaurantCount,
    },
  };
}

function buildSharedListDetailReadModel({
  detail,
  locallySavedDefaultBookmarkLookupIds,
}: SharedListDetailReadModelInput): SharedListDetailReadModel {
  const list = detail?.list ?? null;
  const groupedRestaurants = buildGroupedRestaurants(detail?.items ?? [], 'shared');
  const photosByFoodItemId = groupSharedListPhotosByFoodItemId(detail?.photoPreviews ?? []);
  const savedListIdsByBookmarkLookupId = buildSavedListIdsByBookmarkLookupId(
    detail?.bookmarkState.savedListIdsByBookmarkLookupId,
  );
  const defaultList = detail?.viewerLists.find((viewerList) => viewerList.isDefault);
  const defaultListId = defaultList?.id;
  const restaurantRows = groupedRestaurants.map((group, groupIndex) => {
    const bookmarkedItems = buildViewerDisplayItems(group.items).map((item) => ({
      ...item,
      isSaved: item.bookmarkLookupIds.some((bookmarkLookupId) =>
        locallySavedDefaultBookmarkLookupIds.has(bookmarkLookupId) ||
        (defaultListId
          ? savedListIdsByBookmarkLookupId.get(bookmarkLookupId)?.has(defaultListId) === true
          : savedListIdsByBookmarkLookupId.has(bookmarkLookupId)),
      ),
      photoEntries: buildSharedBookmarkedItemPhotoEntries(item, photosByFoodItemId),
    }));

    return {
      group,
      groupIndex,
      primaryMetaLabel: group.restaurantCity || group.restaurantCuisineType || 'Location not set',
      secondaryMetaLabel:
        group.restaurantCity && group.restaurantCuisineType ? group.restaurantCuisineType : null,
      isRestaurantLocked: group.restaurantVisibility === 'private',
      ownerDisplayItems: [],
      ownerItems: [],
      bookmarkedItems,
    };
  });
  const restaurantCount = list?.restaurantCount ?? groupedRestaurants.length;
  const countLabel = `${restaurantCount} ${restaurantCount === 1 ? 'restaurant' : 'restaurants'}`;
  const descriptionLabel = list?.description?.trim();
  const subtitle = list
    ? `${list.ownerName ? `${list.ownerName}'s list · ` : ''}${countLabel}${
        descriptionLabel ? `\n${descriptionLabel}` : ''
      }`
    : undefined;

  return {
    list,
    groupedRestaurants,
    restaurantRows,
    savedListIdsByBookmarkLookupId,
    defaultList,
    subtitle,
  };
}

export function buildRestaurantListDetailReadModel(
  input: AuthenticatedListDetailReadModelInput,
): ListDetailReadModel;
export function buildRestaurantListDetailReadModel(
  input: SharedListDetailReadModelInput,
): SharedListDetailReadModel;
export function buildRestaurantListDetailReadModel(
  input: AuthenticatedListDetailReadModelInput | SharedListDetailReadModelInput,
): ListDetailReadModel | SharedListDetailReadModel {
  return input.variant === 'authenticated'
    ? buildAuthenticatedListDetailReadModel(input)
    : buildSharedListDetailReadModel(input);
}
