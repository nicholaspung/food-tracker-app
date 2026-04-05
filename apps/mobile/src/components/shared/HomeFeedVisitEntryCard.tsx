import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import {
  buildPocketBaseFileUrl,
  type VisitRecord,
} from '../../features';
import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { useTheme } from '../../theme';
import { Text } from '../../ui';
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
  onOpenPhotoViewer?: (photos: HomeFeedPhotoRecord[], initialIndex?: number) => void;
  onMoreActions?: () => void;
  onSharePhoto?: (input: SharePhotoInput) => void;
  onShareVisit?: () => void;
  moreActionsAccessibilityLabel?: string;
  editTestID?: string;
  deleteTestID?: string;
  moreActionsTestID?: string;
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

export function HomeFeedVisitEntryCard({
  visit,
  getPhotosForItem,
  footerLabel,
  friendName,
  restaurantMetaLabel,
  onDelete,
  onEdit,
  onOpenPhotoViewer,
  onMoreActions,
  onSharePhoto,
  onShareVisit,
  moreActionsAccessibilityLabel,
  editTestID,
  deleteTestID,
  moreActionsTestID,
}: HomeFeedVisitEntryCardProps) {
  const theme = useTheme();

  const colors = {
    accent: theme.colors.text.brand,
    accentSoft: theme.colors.status.infoBg,
    border: theme.colors.border.default,
    borderSubtle: theme.colors.border.subtle,
    dangerBorder: theme.colors.border.danger,
    dangerText: theme.colors.text.danger,
    screenBackground: theme.colors.background.muted,
    shadow: theme.colors.background.inverse,
    surface: theme.colors.background.surface,
    textMuted: theme.colors.text.muted,
    textPrimary: theme.colors.text.primary,
    textSecondary: theme.colors.text.secondary,
  } as const;

  const styles = StyleSheet.create({
    entryCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
      color: colors.textPrimary,
      flex: 1,
    },
    friendBadge: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    friendBadgeLabel: {
      color: colors.accent,
      ...theme.typography.bodySmTightBold,
    },
    sourceBadge: {
      backgroundColor: colors.screenBackground,
      borderRadius: theme.radii.pill,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    sourceBadgeLabel: {
      color: colors.textSecondary,
      ...theme.typography.bodySmTightBold,
      textTransform: 'uppercase',
    },
    restaurantMeta: {
      color: colors.textMuted,
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
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      height: 30,
      justifyContent: 'center',
      width: 30,
    },
    compactActionDanger: {
      borderColor: colors.dangerBorder,
    },
    foodItemsList: {
      gap: theme.spacing.xs,
    },
    foodItemRow: {
      alignItems: 'flex-start',
      backgroundColor: colors.screenBackground,
      borderRadius: 10,
      flexDirection: 'row',
      gap: theme.spacing.xs,
      padding: theme.spacing.xs,
    },
    photoWrap: {
      position: 'relative',
    },
    photoThumb: {
      backgroundColor: colors.borderSubtle,
      borderRadius: 8,
      height: 56,
      width: 56,
    },
    photoCountBadge: {
      alignItems: 'center',
      backgroundColor: colors.shadow,
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
      color: colors.textPrimary,
    },
    foodItemNotes: {
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    foodItemRight: {
      alignItems: 'flex-end',
      gap: 6,
      justifyContent: 'center',
      minHeight: 56,
    },
    ratingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    ratingDot: {
      borderRadius: theme.radii.pill,
      height: 10,
      width: 10,
    },
    ratingLabel: {
      color: colors.textSecondary,
    },
    entryMeta: {
      color: colors.textMuted,
    },
  });

  const hasActions = Boolean(onShareVisit || onEdit || onDelete || onMoreActions);
  const showUnderReviewBadge = !friendName?.trim() && visit.moderationStatus === 'under_review';

  return (
    <View style={styles.entryCard}>
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
            </View>
          </View>
        </View>
      </View>

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
                  <Ionicons color={colors.textSecondary} name="share-social-outline" size={16} />
                </Pressable>
              ) : null}
              {onEdit ? (
                <Pressable
                  accessibilityLabel="Edit visit"
                  onPress={onEdit}
                  style={styles.compactActionButton}
                  testID={editTestID}
                >
                  <Ionicons color={colors.textSecondary} name="create-outline" size={16} />
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  accessibilityLabel="Delete visit"
                  onPress={onDelete}
                  style={[styles.compactActionButton, styles.compactActionDanger]}
                  testID={deleteTestID}
                >
                  <Ionicons color={colors.dangerText} name="trash-outline" size={16} />
                </Pressable>
              ) : null}
              {onMoreActions ? (
                <Pressable
                  accessibilityLabel={moreActionsAccessibilityLabel ?? 'More actions'}
                  onPress={onMoreActions}
                  style={styles.compactActionButton}
                  testID={moreActionsTestID}
                >
                  <Ionicons color={colors.textSecondary} name="ellipsis-horizontal" size={16} />
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

            return (
              <View key={item.id} style={styles.foodItemRow}>
                {thumbnailUrl ? (
                  onOpenPhotoViewer ? (
                    <Pressable
                      accessibilityLabel={`View photos for ${item.name}`}
                      onPress={() => {
                        onOpenPhotoViewer(itemPhotos);
                      }}
                      style={styles.photoWrap}
                    >
                      <Image source={{ uri: thumbnailUrl }} style={styles.photoThumb} />
                      {itemPhotos.length > 1 ? (
                        <View style={styles.photoCountBadge}>
                          <Text style={styles.photoCountText}>+{itemPhotos.length - 1}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : (
                    <View style={styles.photoWrap}>
                      <Image source={{ uri: thumbnailUrl }} style={styles.photoThumb} />
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
                  {item.notes ? (
                    <Text numberOfLines={2} style={styles.foodItemNotes} variant="label">
                      "{item.notes}"
                    </Text>
                  ) : null}
                </View>

                <View style={styles.foodItemRight}>
                  <View style={styles.ratingRow}>
                    <View
                      style={[
                        styles.ratingDot,
                        { backgroundColor: getRatingColor(theme, item.rating) },
                      ]}
                    />
                    <Text style={styles.ratingLabel} variant="bodySmTightMedium">
                      {getRatingLabel(item.rating)}
                    </Text>
                  </View>
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
                      <Ionicons color={colors.textSecondary} name="share-social-outline" size={16} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
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
