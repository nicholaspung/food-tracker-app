import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CachedRemoteImage } from '../../components/shared';
import { buildPhotoThumbnailUrl } from '../../lib/photoUrls';
import { getRatingColor } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { formatMapItemDate } from './homeFeedMapDateFormatting';
import type {
  HomeFeedMapRestaurantGroup,
  HomeFeedMapRestaurantItem,
} from './homeFeedMapGrouping';
import type { FeedMode } from './homeFeedTypes';
import type { VisitPhotoRecord } from './shared';

interface HomeFeedMapRestaurantSheetProps {
  feedMode: FeedMode;
  group: HomeFeedMapRestaurantGroup | null;
  onClose: () => void;
  onOpenPhotoViewer?: (photos: VisitPhotoRecord[], initialIndex?: number) => void;
}

const COLLAPSED_SNAP = 220;
const SNAP_POINTS = [COLLAPSED_SNAP, '42%', '76%'] as const;

const useStyles = createThemedStyles((theme) => ({
  sheetBackground: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderWidth: 1,
  },
  handleIndicator: {
    backgroundColor: theme.colors.border.strong,
    width: 38,
  },
  handle: {
    paddingBottom: theme.spacing.xxs,
    paddingTop: theme.spacing.xs,
  },
  content: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    gap: theme.spacing.xxs,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  location: {
    color: theme.colors.text.secondary,
  },
  summary: {
    color: theme.colors.text.muted,
  },
  itemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 5,
  },
  itemPhoto: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    height: 42,
    width: 42,
  },
  itemPhotoWrap: {
    borderRadius: theme.radii.sm,
  },
  photoCountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    bottom: -4,
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
  },
  photoCountText: {
    color: theme.colors.text.primary,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemName: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  itemRating: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 5,
  },
  itemRatingDot: {
    borderRadius: theme.radii.pill,
    height: 8,
    width: 8,
  },
  itemRatingLabel: {
    color: theme.colors.text.secondary,
  },
  itemMeta: {
    color: theme.colors.text.secondary,
  },
  itemNotes: {
    color: theme.colors.text.muted,
  },
  showMoreButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderColor: theme.colors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
  },
  showMoreLabel: {
    color: theme.colors.text.primary,
  },
  listContent: {
    paddingBottom: theme.spacing.lg,
  },
}));

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildSummary(group: HomeFeedMapRestaurantGroup): string {
  const ratings = pluralize(group.items.length, 'rating', 'ratings');
  const visits = pluralize(group.visitCount, 'visit', 'visits');
  const foodProducts =
    group.foodProductCount > 0
      ? ` • ${pluralize(group.foodProductCount, 'food product', 'food products')}`
      : '';

  return `${ratings} • ${visits}${foodProducts}`;
}

function RestaurantItemRow({
  feedMode,
  item,
  onOpenPhotoViewer,
  showNotes,
}: {
  feedMode: FeedMode;
  item: HomeFeedMapRestaurantItem;
  onOpenPhotoViewer?: (photos: VisitPhotoRecord[], initialIndex?: number) => void;
  showNotes: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const itemDateLabel = formatMapItemDate(item.eventAt, feedMode);
  const primaryPhoto = item.photoPreviews[0] ?? null;
  const thumbnailUrl = primaryPhoto ? buildPhotoThumbnailUrl(primaryPhoto) : null;

  return (
    <View style={styles.itemRow}>
      {thumbnailUrl ? (
        onOpenPhotoViewer ? (
          <Pressable
            accessibilityLabel={`View photos for ${item.name}`}
            onPress={() => {
              onOpenPhotoViewer(item.photoPreviews);
            }}
            style={styles.itemPhotoWrap}
          >
            <CachedRemoteImage
              accessibilityLabel={`${item.name} photo`}
              resizeMode="cover"
              style={styles.itemPhoto}
              uri={thumbnailUrl}
            />
            {item.photoPreviews.length > 1 ? (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText} variant="bodySmTightBold">
                  +{item.photoPreviews.length - 1}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <CachedRemoteImage
            accessibilityLabel={`${item.name} photo`}
            resizeMode="cover"
            style={styles.itemPhoto}
            uri={thumbnailUrl}
          />
        )
      ) : null}
      <View style={styles.itemContent}>
        <View style={styles.itemTitleRow}>
          <Text numberOfLines={1} style={styles.itemName} variant="bodyMdSemiBold">
            {item.name}
          </Text>
          <View style={styles.itemRating}>
            <View style={[styles.itemRatingDot, { backgroundColor: getRatingColor(theme, item.rating) }]} />
            <Text numberOfLines={1} style={styles.itemRatingLabel} variant="bodySmTightMedium">
              {item.ratingLabel}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.itemMeta} variant="bodySmTightMedium">
          {itemDateLabel}
          {itemDateLabel && item.ownerName ? ' • ' : ''}
          {item.ownerName ?? ''}
        </Text>
        {showNotes && item.notes ? (
          <Text numberOfLines={2} style={styles.itemNotes} variant="bodySmTight">
            {item.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function HomeFeedMapRestaurantSheet({
  feedMode,
  group,
  onClose,
  onOpenPhotoViewer,
}: HomeFeedMapRestaurantSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const previousGroupIdRef = useRef<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const styles = useStyles();
  const snapPoints = useMemo(() => [...SNAP_POINTS], []);

  useEffect(() => {
    if (!group) {
      previousGroupIdRef.current = null;
      return;
    }

    if (!previousGroupIdRef.current) {
      sheetRef.current?.snapToIndex(0);
    }
    previousGroupIdRef.current = group.id;
  }, [group]);

  if (!group) {
    return null;
  }

  const topItems = group.items.slice(0, 2);
  const remainingItems = group.items.slice(2);
  const showMore = group.items.length > 2 && sheetIndex === 0;

  const expandSheet = () => {
    sheetRef.current?.snapToIndex(1);
  };

  return (
    <BottomSheet
      backgroundStyle={styles.sheetBackground}
      enablePanDownToClose
      handleIndicatorStyle={styles.handleIndicator}
      handleStyle={styles.handle}
      index={0}
      onChange={setSheetIndex}
      onClose={onClose}
      ref={sheetRef}
      snapPoints={snapPoints}
    >
      <BottomSheetFlatList
        ListHeaderComponent={
          <BottomSheetView style={styles.content}>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.title} variant="titleSm">
                  {group.restaurantName}
                </Text>
              </View>
              {group.restaurantLocation ? (
                <Text numberOfLines={1} style={styles.location} variant="bodySmTightMedium">
                  {group.restaurantLocation}
                </Text>
              ) : null}
              <Text style={styles.summary} variant="bodySmTightSemiBold">
                {buildSummary(group)}
              </Text>
            </View>

            {topItems.map((item) => (
              <RestaurantItemRow
                feedMode={feedMode}
                item={item}
                key={`top-${item.id}`}
                onOpenPhotoViewer={onOpenPhotoViewer}
                showNotes={false}
              />
            ))}

            {showMore ? (
              <Pressable onPress={expandSheet} style={styles.showMoreButton}>
                <Text style={styles.showMoreLabel} variant="labelMd">
                  Show more
                </Text>
              </Pressable>
            ) : null}
          </BottomSheetView>
        }
        contentContainerStyle={styles.listContent}
        data={remainingItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.content}>
            <RestaurantItemRow
              feedMode={feedMode}
              item={item}
              onOpenPhotoViewer={onOpenPhotoViewer}
              showNotes
            />
          </View>
        )}
      />
    </BottomSheet>
  );
}
