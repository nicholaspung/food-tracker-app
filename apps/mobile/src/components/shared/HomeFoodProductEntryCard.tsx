import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { buildPocketBaseFileUrl, type FoodProductRecord } from '../../features';
import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { CachedRemoteImage } from './CachedRemoteImage';
import { ExpandableText } from './ExpandableText';
import type { HomeFeedPhotoRecord } from './HomeFeedVisitEntryCard';
import { StatusPill } from './StatusPill';

interface SharePhotoInput {
  itemName: string;
  photo: HomeFeedPhotoRecord;
  rating: number;
  restaurantName: string;
  visitDate: string;
}

interface HomeFoodProductEntryCardProps {
  foodProduct?: FoodProductRecord;
  photos: HomeFeedPhotoRecord[];
  entryMeta: string;
  friendName?: string;
  onDelete?: () => void;
  onEdit?: () => void;
  onMoreActions?: () => void;
  onOpenPhotoViewer?: (photos: HomeFeedPhotoRecord[], initialIndex?: number) => void;
  onSharePhoto?: (input: SharePhotoInput) => void;
  moreActionsAccessibilityLabel?: string;
  showUnderReviewBadge?: boolean;
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ');
}

function buildPhotoThumbnailUrl(photo: HomeFeedPhotoRecord): string {
  const localUri = photo.uri?.trim();
  if (localUri) {
    return localUri;
  }

  return buildPocketBaseFileUrl({
    collectionId: photo.collectionId,
    collectionName: photo.collectionName ?? 'visit_photos',
    recordId: photo.id,
    filename: photo.photo,
    thumb: '100x100',
  });
}

const useStyles = createThemedStyles((theme) => ({
  entryCard: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 14,
    borderWidth: 1,
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  entryTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  entryTitle: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  entryTopRight: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  badgesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
  },
  friendBadge: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.brand,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  friendBadgeLabel: {
    color: theme.colors.text.brand,
    ...theme.typography.bodySmTightBold,
  },
  sourceBadge: {
    backgroundColor: theme.colors.status.infoBg,
    borderRadius: 999,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  sourceBadgeLabel: {
    color: theme.colors.text.info,
    ...theme.typography.bodySmTightBold,
    textTransform: 'uppercase',
  },
  categoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.background.muted,
    borderRadius: 999,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  categoryBadgeLabel: {
    color: theme.colors.text.secondary,
    ...theme.typography.bodySmTightSemiBold,
    textTransform: 'capitalize',
  },
  compactActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  compactActionButton: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  compactActionDanger: {
    borderColor: theme.colors.border.danger,
  },
  foodItemRow: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.background.surface,
    borderRadius: 10,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  photoWrap: {
    position: 'relative',
  },
  photoThumb: {
    backgroundColor: theme.colors.border.subtle,
    borderRadius: 8,
    height: 56,
    width: 56,
  },
  photoCountBadge: {
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
  photoCountText: {
    color: theme.colors.text.inverse,
    ...theme.typography.captionStrong,
  },
  foodItemContent: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
  },
  foodItemContentCompact: {
    minHeight: 0,
  },
  metadataText: {
    color: theme.colors.text.secondary,
  },
  metadataInline: {
    flex: 1,
  },
  metadataRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  locationIcon: {
    marginTop: 1,
  },
  foodItemNotes: {
    color: theme.colors.text.muted,
    fontStyle: 'italic',
  },
  foodItemRight: {
    alignItems: 'flex-end',
    gap: 6,
    justifyContent: 'center',
    minHeight: 56,
  },
  foodItemRightCompact: {
    minHeight: 0,
  },
  ratingDot: {
    borderRadius: theme.radii.pill,
    height: 10,
    width: 10,
  },
  ratingLabel: {
    color: theme.colors.text.secondary,
  },
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  entryMeta: {
    color: theme.colors.text.muted,
  },
}));

export function HomeFoodProductEntryCard({
  foodProduct,
  photos,
  entryMeta,
  friendName,
  onDelete,
  onEdit,
  onMoreActions,
  onOpenPhotoViewer,
  onSharePhoto,
  moreActionsAccessibilityLabel,
  showUnderReviewBadge = false,
}: HomeFoodProductEntryCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const resolvedFoodProduct = foodProduct;

  if (!resolvedFoodProduct) {
    return null;
  }

  const primaryPhoto = photos[0] ?? null;
  const photoThumb = primaryPhoto ? buildPhotoThumbnailUrl(primaryPhoto) : null;
  const hasPhoto = Boolean(photoThumb);
  const categoryLabel = resolvedFoodProduct.itemCategory
    ? formatCategoryLabel(resolvedFoodProduct.itemCategory)
    : null;
  const locationText = resolvedFoodProduct.locationText?.trim() || null;
  const showActions = Boolean(onEdit || onDelete || onMoreActions);

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryTopRow}>
        <Text numberOfLines={2} style={styles.entryTitle} variant="titleSm">
          {resolvedFoodProduct.itemName}
        </Text>
        <View style={styles.entryTopRight}>
          <View style={styles.badgesRow}>
            {friendName ? (
              <View style={styles.friendBadge}>
                <Text numberOfLines={1} style={styles.friendBadgeLabel}>
                  {friendName}
                </Text>
              </View>
            ) : null}
            {showUnderReviewBadge ? <StatusPill label="Under review" tone="warning" /> : null}
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeLabel}>Product</Text>
            </View>
          </View>
        </View>
      </View>

      {categoryLabel || showActions ? (
        <View style={styles.categoryRow}>
          {categoryLabel ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeLabel}>{categoryLabel}</Text>
            </View>
          ) : (
            <View />
          )}
          {showActions ? (
            <View style={styles.compactActions}>
              {onEdit ? (
                <Pressable accessibilityLabel="Edit food product" onPress={onEdit} style={styles.compactActionButton}>
                  <Ionicons color={theme.colors.text.secondary} name="create-outline" size={16} />
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  accessibilityLabel="Delete food product"
                  onPress={onDelete}
                  style={[styles.compactActionButton, styles.compactActionDanger]}
                >
                  <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
                </Pressable>
              ) : null}
              {onMoreActions ? (
                <Pressable
                  accessibilityLabel={moreActionsAccessibilityLabel ?? 'More actions'}
                  onPress={onMoreActions}
                  style={styles.compactActionButton}
                >
                  <Ionicons color={theme.colors.text.secondary} name="ellipsis-horizontal" size={16} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.foodItemRow}>
        {photoThumb ? (
          <Pressable
            accessibilityLabel={`View photos for ${resolvedFoodProduct.itemName}`}
            onPress={() => {
              onOpenPhotoViewer?.(photos);
            }}
            style={styles.photoWrap}
          >
            <CachedRemoteImage uri={photoThumb} style={styles.photoThumb} />
            {photos.length > 1 ? (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText}>+{photos.length - 1}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View
          style={[styles.foodItemContent, !hasPhoto && styles.foodItemContentCompact]}
          testID="home-food-product-entry-content"
        >
          {locationText ? (
            <View style={styles.metadataRow}>
              <Ionicons
                color={theme.colors.text.secondary}
                name="location-outline"
                size={14}
                style={styles.locationIcon}
              />
              <Text numberOfLines={1} style={[styles.metadataText, styles.metadataInline]} variant="bodySmTight">
                {locationText}
              </Text>
            </View>
          ) : null}
          {resolvedFoodProduct.notes ? (
            <ExpandableText
              collapsedNumberOfLines={2}
              interactionMode="tap-text"
              style={styles.foodItemNotes}
              variant="label"
            >
              {`"${resolvedFoodProduct.notes}"`}
            </ExpandableText>
          ) : null}
        </View>

        <View
          style={[styles.foodItemRight, !hasPhoto && styles.foodItemRightCompact]}
          testID="home-food-product-entry-right"
        >
          <View style={styles.ratingRow}>
            <View
              style={[
                styles.ratingDot,
                { backgroundColor: getRatingColor(theme, resolvedFoodProduct.rating) },
              ]}
            />
            <Text style={styles.ratingLabel} variant="bodySmTightMedium">
              {getRatingLabel(resolvedFoodProduct.rating)}
            </Text>
          </View>
          {primaryPhoto && onSharePhoto ? (
            <Pressable
              accessibilityLabel={`Share ${resolvedFoodProduct.itemName}`}
              onPress={() => {
                onSharePhoto({
                  itemName: resolvedFoodProduct.itemName,
                  photo: primaryPhoto,
                  rating: resolvedFoodProduct.rating,
                  restaurantName: 'Food Product',
                  visitDate: resolvedFoodProduct.itemDate || resolvedFoodProduct.createdAt,
                });
              }}
              style={styles.compactActionButton}
            >
              <Ionicons color={theme.colors.text.secondary} name="share-social-outline" size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.entryMeta} variant="bodySmTight">{entryMeta}</Text>
    </View>
  );
}
