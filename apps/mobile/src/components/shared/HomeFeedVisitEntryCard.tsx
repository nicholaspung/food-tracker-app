import { Ionicons } from '../../ui/AppIcon';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { VisitRecord } from '../../features';
import { buildPhotoThumbnailUrl } from '../../lib/photoUrls';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { CachedRemoteImage } from './CachedRemoteImage';
import { ExpandableText } from './ExpandableText';
import { FeedRatingDisplay } from './FeedRatingDisplay';
import { StatusPill } from './StatusPill';

export interface HomeFeedPhotoRecord {
  id: string;
  food_item?: string;
  photo: string;
  uri?: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
}

interface SharePhotoInput {
  itemName: string;
  photo: HomeFeedPhotoRecord;
  rating: number;
  restaurantName: string;
  visitDate: string;
}

interface HomeFeedVisitEntryCardProps {
  visit: VisitRecord;
  getPhotosForItem: (itemId: string) => HomeFeedPhotoRecord[];
  footerLabel?: string;
  friendName?: string;
  restaurantMetaLabel?: string;
  onDelete?: () => void;
  onEdit?: () => void;
  onItemLongPress?: (item: VisitRecord['items'][number]) => void;
  onOpenPhotoViewer?: (photos: HomeFeedPhotoRecord[], initialIndex?: number) => void;
  onMoreActions?: () => void;
  onSharePhoto?: (input: SharePhotoInput) => void;
  onShareVisit?: () => void;
  moreActionsAccessibilityLabel?: string;
  editTestID?: string;
  deleteTestID?: string;
  moreActionsTestID?: string;
  highlighted?: boolean;
  renderItemBookmark?: (item: VisitRecord['items'][number]) => ReactNode;
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
  entryCardHighlighted: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.brand,
  },
  entryTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
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
  entryTitle: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  friendBadge: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.brand,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  friendBadgeLabel: {
    color: theme.colors.text.brand,
    ...theme.typography.bodySmTightBold,
  },
  sourceBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  sourceBadgeLabel: {
    color: theme.colors.text.secondary,
    ...theme.typography.bodySmTightBold,
    textTransform: 'uppercase',
  },
  restaurantMeta: {
    color: theme.colors.text.muted,
  },
  restaurantMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
    marginTop: theme.spacing.xxs,
  },
  restaurantMetaInline: {
    flex: 1,
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
  foodItemsList: {
    gap: theme.spacing.xs,
  },
  foodItemRow: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.background.muted,
    borderRadius: 10,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  foodItemRowPressed: {
    backgroundColor: theme.colors.status.infoBg,
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
  foodItemName: {
    color: theme.colors.text.primary,
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
  foodItemSecondaryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  entryMeta: {
    color: theme.colors.text.muted,
  },
  recommendationSource: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  recommendationSourceText: {
    color: theme.colors.text.muted,
  },
}));

function formatRecommendationSourceLabel(
  source: VisitRecord['recommendationSource'],
  fallbackLabel: string,
): string | null {
  if (!source) {
    return null;
  }

  const sourceUserName = source.sourceUserName?.trim();
  if (sourceUserName) {
    return `Recommended by ${sourceUserName}`;
  }

  return fallbackLabel;
}

export function HomeFeedVisitEntryCard({
  visit,
  getPhotosForItem,
  footerLabel,
  friendName,
  restaurantMetaLabel,
  onDelete,
  onEdit,
  onItemLongPress,
  onOpenPhotoViewer,
  onMoreActions,
  onSharePhoto,
  onShareVisit,
  moreActionsAccessibilityLabel,
  editTestID,
  deleteTestID,
  moreActionsTestID,
  highlighted = false,
  renderItemBookmark,
}: HomeFeedVisitEntryCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  const hasActions = Boolean(onShareVisit || onEdit || onDelete || onMoreActions);
  const showUnderReviewBadge = !friendName?.trim() && visit.moderationStatus === 'under_review';
  const isPrivateVisit = visit.visibility === 'private';
  const hasItemRecommendationSource = visit.items.some((item) => Boolean(item.recommendationSource));
  const visitRecommendationSourceLabel = hasItemRecommendationSource
    ? null
    : formatRecommendationSourceLabel(visit.recommendationSource, 'Recommended restaurant');

  return (
    <View style={[styles.entryCard, highlighted ? styles.entryCardHighlighted : null]}>
      <View style={styles.entryTopRow}>
        <Text numberOfLines={2} style={styles.entryTitle} variant="titleSm">
          {visit.restaurantName}
        </Text>
        <View style={styles.entryTopRight}>
          <View style={styles.badgesRow}>
            {friendName?.trim() ? (
              <View style={styles.friendBadge}>
                <Text numberOfLines={1} style={styles.friendBadgeLabel}>
                  {friendName.trim()}
                </Text>
              </View>
            ) : null}
            {showUnderReviewBadge ? <StatusPill label="Under review" tone="warning" /> : null}
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeLabel}>Visit</Text>
              {isPrivateVisit ? (
                <Ionicons
                  accessibilityLabel="Private visit"
                  color={theme.colors.text.secondary}
                  name="lock-closed-outline"
                  size={12}
                  testID="home-feed-visit-private-lock"
                />
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {visitRecommendationSourceLabel ? (
        <View style={styles.recommendationSource} testID="home-feed-visit-recommendation-source">
          <Ionicons color={theme.colors.text.muted} name="sparkles-outline" size={14} />
          <Text numberOfLines={1} style={styles.recommendationSourceText} variant="bodySmTight">
            {visitRecommendationSourceLabel}
          </Text>
        </View>
      ) : null}

      {restaurantMetaLabel || hasActions ? (
        <View style={styles.restaurantMetaRow}>
          {restaurantMetaLabel ? (
            <Text numberOfLines={1} style={[styles.restaurantMeta, styles.restaurantMetaInline]} variant="bodyMd">
              {restaurantMetaLabel}
            </Text>
          ) : (
            <View style={styles.restaurantMetaInline} />
          )}
          {hasActions ? (
            <View style={styles.compactActions}>
              {onShareVisit ? (
                <Pressable
                  accessibilityLabel="Share visit"
                  onPress={onShareVisit}
                  style={styles.compactActionButton}
                >
                  <Ionicons color={theme.colors.text.secondary} name="share-social-outline" size={16} />
                </Pressable>
              ) : null}
              {onEdit ? (
                <Pressable
                  accessibilityLabel="Edit visit"
                  onPress={onEdit}
                  style={styles.compactActionButton}
                  testID={editTestID}
                >
                  <Ionicons color={theme.colors.text.secondary} name="create-outline" size={16} />
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  accessibilityLabel="Delete visit"
                  onPress={onDelete}
                  style={[styles.compactActionButton, styles.compactActionDanger]}
                  testID={deleteTestID}
                >
                  <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
                </Pressable>
              ) : null}
              {onMoreActions ? (
                <Pressable
                  accessibilityLabel={moreActionsAccessibilityLabel ?? 'More actions'}
                  onPress={onMoreActions}
                  style={styles.compactActionButton}
                  testID={moreActionsTestID}
                >
                  <Ionicons color={theme.colors.text.secondary} name="ellipsis-horizontal" size={16} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {visit.items.length > 0 ? (
        <View style={styles.foodItemsList}>
          {visit.items.map((item) => {
            const itemPhotos = getPhotosForItem(item.id);
            const primaryPhoto = itemPhotos[0] ?? null;
            const thumbnailUrl = primaryPhoto ? buildPhotoThumbnailUrl(primaryPhoto) : null;
            const isPrivateVisitItem = isPrivateVisit || item.menuItemVisibility === 'private';
            const itemRecommendationSourceLabel = formatRecommendationSourceLabel(
              item.recommendationSource,
              'Recommended item',
            );

            const renderItemRowContent = (pressed = false) => (
              <View style={[styles.foodItemRow, pressed ? styles.foodItemRowPressed : null]}>
                {thumbnailUrl ? (
                  onOpenPhotoViewer ? (
                    <Pressable
                      accessibilityLabel={`View photos for ${item.name}`}
                      onPress={() => {
                        onOpenPhotoViewer(itemPhotos);
                      }}
                      style={styles.photoWrap}
                    >
                      <CachedRemoteImage uri={thumbnailUrl} style={styles.photoThumb} />
                      {itemPhotos.length > 1 ? (
                        <View style={styles.photoCountBadge}>
                          <Text style={styles.photoCountText}>+{itemPhotos.length - 1}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : (
                    <View style={styles.photoWrap}>
                      <CachedRemoteImage uri={thumbnailUrl} style={styles.photoThumb} />
                      {itemPhotos.length > 1 ? (
                        <View style={styles.photoCountBadge}>
                          <Text style={styles.photoCountText}>+{itemPhotos.length - 1}</Text>
                        </View>
                      ) : null}
                    </View>
                  )
                ) : null}

                <View style={styles.foodItemContent}>
                  <Text numberOfLines={2} style={styles.foodItemName} variant="button">
                    {item.name}
                  </Text>
                  {itemRecommendationSourceLabel ? (
                    <View
                      style={styles.recommendationSource}
                      testID={`home-feed-visit-item-recommendation-source-${item.id}`}
                    >
                      <Ionicons color={theme.colors.text.muted} name="sparkles-outline" size={12} />
                      <Text numberOfLines={1} style={styles.recommendationSourceText} variant="bodySmTight">
                        {itemRecommendationSourceLabel}
                      </Text>
                    </View>
                  ) : null}
                  {item.notes ? (
                    <ExpandableText
                      collapsedNumberOfLines={2}
                      interactionMode="tap-text"
                      style={styles.foodItemNotes}
                      variant="label"
                    >
                      {`"${item.notes}"`}
                    </ExpandableText>
                  ) : null}
                </View>

                <View style={styles.foodItemRight}>
                  <FeedRatingDisplay
                    rating={item.rating}
                    testID={`home-feed-visit-item-rating-${item.id}`}
                  />
                  {isPrivateVisitItem || (primaryPhoto && onSharePhoto) || renderItemBookmark ? (
                    <View style={styles.foodItemSecondaryActions}>
                      {isPrivateVisitItem ? (
                        <Ionicons
                          accessibilityLabel={`Private rating for ${item.name}`}
                          color={theme.colors.text.muted}
                          name="lock-closed-outline"
                          size={14}
                          testID={`home-feed-visit-item-private-lock-${item.id}`}
                        />
                      ) : null}
                      {primaryPhoto && onSharePhoto ? (
                        <Pressable
                          accessibilityLabel={`Share ${item.name}`}
                          onPress={() => {
                            onSharePhoto({
                              itemName: item.name,
                              photo: primaryPhoto,
                              rating: item.rating,
                              restaurantName: visit.restaurantName,
                              visitDate: visit.visitedAt || visit.createdAt,
                            });
                          }}
                          style={styles.compactActionButton}
                        >
                          <Ionicons color={theme.colors.text.secondary} name="share-social-outline" size={16} />
                        </Pressable>
                      ) : null}
                      {renderItemBookmark?.(item)}
                    </View>
                  ) : null}
                </View>
              </View>
            );

            if (!onItemLongPress) {
              return (
                <View key={item.id}>
                  {renderItemRowContent()}
                </View>
              );
            }

            return (
              <Pressable
                accessibilityHint="Long press to move this item to another visit"
                accessibilityLabel={`Move ${item.name} to another visit`}
                delayLongPress={250}
                key={item.id}
                onLongPress={() => {
                  onItemLongPress(item);
                }}
                testID={`home-feed-visit-item-${item.id}`}
              >
                {({ pressed }) => renderItemRowContent(pressed)}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.entryMeta} variant="bodySmTight">No items recorded</Text>
      )}

      {footerLabel ? <Text style={styles.entryMeta} variant="bodySmTight">{footerLabel}</Text> : null}
    </View>
  );
}
