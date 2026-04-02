import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { buildPocketBaseFileUrl, type QuickTrackRecord } from '../../features';
import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { useTheme } from '../../theme';
import { Text } from '../../ui';
import type { HomeFeedPhotoRecord } from './HomeFeedVisitEntryCard';

interface SharePhotoInput {
  itemName: string;
  photo: HomeFeedPhotoRecord;
  rating: number;
  restaurantName: string;
  visitDate: string;
}

interface HomeQuickTrackEntryCardProps {
  quickTrack: QuickTrackRecord;
  photos: HomeFeedPhotoRecord[];
  entryMeta: string;
  friendName?: string;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpenPhotoViewer?: (photos: HomeFeedPhotoRecord[], initialIndex?: number) => void;
  onSharePhoto?: (input: SharePhotoInput) => void;
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ');
}

function parseCoordinateString(value: string): { latitude: number; longitude: number } | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function formatQuickTrackLocationLabel(value: string): string {
  const coordinates = parseCoordinateString(value);
  if (!coordinates) {
    return value.trim();
  }

  return `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
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

export function HomeQuickTrackEntryCard({
  quickTrack,
  photos,
  entryMeta,
  friendName,
  onDelete,
  onEdit,
  onOpenPhotoViewer,
  onSharePhoto,
}: HomeQuickTrackEntryCardProps) {
  const theme = useTheme();

  const colors = {
    accent: theme.colors.text.brand,
    accentSoft: theme.colors.status.infoBg,
    accentSoftText: theme.colors.text.info,
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
    entryTitle: {
      color: colors.textPrimary,
      flex: 1,
      ...theme.typography.bodyLg,
      fontWeight: '700',
      lineHeight: 22,
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
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderRadius: 999,
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
      backgroundColor: colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    sourceBadgeLabel: {
      color: colors.accentSoftText,
      ...theme.typography.bodySm,
      fontWeight: '700',
      lineHeight: 14,
      textTransform: 'uppercase',
    },
    quickTrackCategoryRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -4,
    },
    categoryBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.screenBackground,
      borderRadius: 999,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    categoryBadgeLabel: {
      color: colors.textSecondary,
      ...theme.typography.bodySm,
      fontWeight: '600',
      lineHeight: 14,
      textTransform: 'capitalize',
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
    foodItemRow: {
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
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
    quickTrackMeta: {
      color: colors.textSecondary,
      ...theme.typography.bodySm,
      lineHeight: 16,
    },
    quickTrackMetaInline: {
      flex: 1,
    },
    quickTrackMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    quickTrackLocationIcon: {
      marginTop: 1,
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
    ratingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    entryMeta: {
      color: colors.textMuted,
      ...theme.typography.bodySm,
      lineHeight: 16,
    },
  });

  const primaryPhoto = photos[0] ?? null;
  const photoThumb = primaryPhoto ? buildPhotoThumbnailUrl(primaryPhoto) : null;
  const metaSource = quickTrack.locationText || quickTrack.restaurantName || '';
  const metaLabel = metaSource ? formatQuickTrackLocationLabel(metaSource) : '';
  const categoryLabel = quickTrack.itemCategory ? formatCategoryLabel(quickTrack.itemCategory) : null;
  const showActions = Boolean(onEdit || onDelete);

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryTopRow}>
        <Text numberOfLines={2} style={styles.entryTitle}>
          {quickTrack.itemName}
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
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeLabel}>Quick</Text>
            </View>
          </View>
        </View>
      </View>

      {categoryLabel || showActions ? (
        <View style={styles.quickTrackCategoryRow}>
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
                <Pressable accessibilityLabel="Edit quick track" onPress={onEdit} style={styles.compactActionButton}>
                  <Ionicons color={colors.textSecondary} name="create-outline" size={16} />
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  accessibilityLabel="Delete quick track"
                  onPress={onDelete}
                  style={[styles.compactActionButton, styles.compactActionDanger]}
                >
                  <Ionicons color={colors.dangerText} name="trash-outline" size={16} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.foodItemRow}>
        {photoThumb ? (
          <Pressable
            accessibilityLabel={`View photos for ${quickTrack.itemName}`}
            onPress={() => {
              onOpenPhotoViewer?.(photos);
            }}
            style={styles.photoWrap}
          >
            <Image source={{ uri: photoThumb }} style={styles.photoThumb} />
            {photos.length > 1 ? (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText}>+{photos.length - 1}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View style={styles.foodItemContent}>
          {metaSource ? (
            <View style={styles.quickTrackMetaRow}>
              <Ionicons
                color={colors.textMuted}
                name="location-outline"
                size={12}
                style={styles.quickTrackLocationIcon}
              />
              <Text numberOfLines={1} style={[styles.quickTrackMeta, styles.quickTrackMetaInline]}>
                {metaLabel}
              </Text>
            </View>
          ) : null}
          {quickTrack.notes ? (
            <Text numberOfLines={2} style={styles.foodItemNotes}>
              "{quickTrack.notes}"
            </Text>
          ) : null}
        </View>

        <View style={styles.foodItemRight}>
          <View style={styles.ratingRow}>
            <View
              style={[
                styles.ratingDot,
                { backgroundColor: getRatingColor(theme, quickTrack.rating) },
              ]}
            />
            <Text style={styles.ratingLabel}>{getRatingLabel(quickTrack.rating)}</Text>
          </View>
          {primaryPhoto && onSharePhoto ? (
            <Pressable
              accessibilityLabel={`Share ${quickTrack.itemName}`}
              onPress={() => {
                onSharePhoto({
                  itemName: quickTrack.itemName,
                  photo: primaryPhoto,
                  rating: quickTrack.rating,
                  restaurantName: metaSource || 'Quick Track',
                  visitDate: quickTrack.itemDate || quickTrack.createdAt,
                });
              }}
              style={styles.compactActionButton}
            >
              <Ionicons color={colors.textSecondary} name="share-social-outline" size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.entryMeta}>{entryMeta}</Text>
    </View>
  );
}
