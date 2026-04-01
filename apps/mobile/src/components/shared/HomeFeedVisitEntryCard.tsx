import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import {
  buildPocketBaseFileUrl,
  type VisitRecord,
} from '../../features';
import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { useTheme } from '../../theme';
import { Text } from '../../ui';

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
  onSharePhoto?: (input: SharePhotoInput) => void;
  onShareVisit?: () => void;
  editTestID?: string;
  deleteTestID?: string;
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
  onSharePhoto,
  onShareVisit,
  editTestID,
  deleteTestID,
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
      ...theme.typography.bodyLg,
      fontWeight: '700',
      lineHeight: 22,
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
      ...theme.typography.bodySm,
      fontWeight: '700',
      lineHeight: 14,
    },
    sourceBadge: {
      backgroundColor: colors.screenBackground,
      borderRadius: theme.radii.pill,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    sourceBadgeLabel: {
      color: colors.textSecondary,
      ...theme.typography.bodySm,
      fontWeight: '700',
      lineHeight: 14,
      textTransform: 'uppercase',
    },
    restaurantMeta: {
      color: colors.textMuted,
      ...theme.typography.bodyMd,
      lineHeight: 19,
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
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
    },
    foodItemContent: {
      flex: 1,
      gap: 2,
      justifyContent: 'center',
      minHeight: 56,
    },
    foodItemName: {
      color: colors.textPrimary,
      ...theme.typography.button,
    },
    foodItemNotes: {
      color: colors.textMuted,
      ...theme.typography.label,
      fontStyle: 'italic',
      lineHeight: 18,
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
      ...theme.typography.bodySm,
      fontWeight: '500',
      lineHeight: 16,
    },
    entryMeta: {
      color: colors.textMuted,
      ...theme.typography.bodySm,
      lineHeight: 16,
    },
  });

  const hasActions = Boolean(onShareVisit || onEdit || onDelete);

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryTopRow}>
        <Text numberOfLines={2} style={styles.entryTitle}>
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
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeLabel}>Visit</Text>
            </View>
          </View>
        </View>
      </View>

      {restaurantMetaLabel || hasActions ? (
        <View style={styles.restaurantMetaRow}>
          {restaurantMetaLabel ? (
            <Text numberOfLines={1} style={[styles.restaurantMeta, styles.restaurantMetaInline]}>
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
                  <Text numberOfLines={2} style={styles.foodItemName}>
                    {item.name}
                  </Text>
                  {item.notes ? (
                    <Text numberOfLines={2} style={styles.foodItemNotes}>
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
                    <Text style={styles.ratingLabel}>{getRatingLabel(item.rating)}</Text>
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
        <Text style={styles.entryMeta}>No items recorded</Text>
      )}

      {footerLabel ? <Text style={styles.entryMeta}>{footerLabel}</Text> : null}
    </View>
  );
}
