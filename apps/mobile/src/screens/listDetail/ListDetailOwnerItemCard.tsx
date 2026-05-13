import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { RatingPill } from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import {
  formatFullDateLabel,
  formatMonthYearLabel,
} from './listDetailFormatters';
import { ListDetailItemPhotoButton } from './ListDetailItemPhotoButton';
import type {
  OwnerDisplayItem,
  OwnerItemPhotoEntry,
  PendingDeleteListItem,
} from './listDetailTypes';

interface ListDetailOwnerItemCardProps {
  canCreateVisitFromRestaurant: boolean;
  groupIndex: number;
  item: OwnerDisplayItem;
  itemIndex: number;
  photoEntries: OwnerItemPhotoEntry[];
  onConfirmDeleteItem: (item: PendingDeleteListItem) => void;
  onIWentThere: (input: { listItemId: string; name: string }) => void;
  onOpenPhotos: (entries: OwnerItemPhotoEntry[]) => void;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  itemName: {
    color: theme.colors.text.primary,
    flex: 1,
    ...theme.typography.titleSm,
  },
  sourceUserRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 1,
  },
  sourceUserText: {
    color: theme.colors.text.info,
    ...theme.typography.bodySmTightBold,
  },
  sourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  sourceMeta: {
    alignItems: 'center',
    columnGap: theme.spacing.xxs,
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
  },
  sourceDate: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  iWentButton: {
    alignItems: 'center',
    borderRadius: theme.radii.sm,
    flexDirection: 'row',
    gap: 2,
    minHeight: 22,
    paddingHorizontal: theme.spacing.xs,
  },
  iWentButtonPressed: {
    backgroundColor: theme.colors.status.successBg,
  },
  iWentButtonLabel: {
    color: theme.colors.text.success,
    ...theme.typography.bodySmTightSemiBold,
  },
  deleteButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  deleteButtonPressed: {
    backgroundColor: theme.colors.status.dangerBg,
  },
  userRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  userReviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xxs,
    marginTop: 1,
  },
  userReviewArrow: {
    color: theme.colors.text.info,
    ...theme.typography.bodySm,
  },
  userReviewText: {
    color: theme.colors.text.info,
    ...theme.typography.bodySmTightSemiBold,
  },
  userReviewDate: {
    color: theme.colors.text.info,
    ...theme.typography.bodySm,
  },
}));

export function ListDetailOwnerItemCard({
  canCreateVisitFromRestaurant,
  groupIndex,
  item,
  itemIndex,
  photoEntries,
  onConfirmDeleteItem,
  onIWentThere,
  onOpenPhotos,
}: ListDetailOwnerItemCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const sourceRating = item.source;
  const userRating = item.user;
  const sourceMonthYearLabel = formatMonthYearLabel(sourceRating?.visitedAt);
  const userDisplayDateLabel =
    formatFullDateLabel(userRating?.visitedAt) ?? formatMonthYearLabel(userRating?.visitedAt);
  const canShowIWent = Boolean(sourceRating && !userRating && canCreateVisitFromRestaurant);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text numberOfLines={1} style={styles.itemName}>
          {item.name}
        </Text>
        {photoEntries.length > 0 ? (
          <ListDetailItemPhotoButton
            accessibilityLabel={`View photos for ${item.name}`}
            entries={photoEntries}
            onOpen={onOpenPhotos}
            testID={`list-detail-photo-button-${groupIndex}-${itemIndex}`}
          />
        ) : null}
      </View>

      {sourceRating ? (
        <View style={styles.sourceRow}>
          <View style={styles.sourceMeta}>
            <View style={styles.sourceUserRow}>
              <Ionicons color={theme.colors.text.info} name="people-outline" size={11} />
              <Text style={styles.sourceUserText}>{sourceRating.sourceUserName}</Text>
            </View>
            {sourceRating.rating > 0 ? <RatingPill rating={sourceRating.rating} /> : null}
            {sourceMonthYearLabel ? (
              <Text style={styles.sourceDate}>{sourceMonthYearLabel}</Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            {canShowIWent ? (
              <Pressable
                accessibilityLabel={`I went for ${item.name}`}
                accessibilityRole="button"
                onPress={() => {
                  onIWentThere({
                    listItemId: sourceRating.listItemId,
                    name: item.name,
                  });
                }}
                style={({ pressed }) => [styles.iWentButton, pressed && styles.iWentButtonPressed]}
                testID={`i-went-list-item-${sourceRating.listItemId}`}
              >
                <Ionicons color={theme.colors.text.success} name="location-outline" size={12} />
                <Text style={styles.iWentButtonLabel}>I went</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={`Remove bookmarked rating for ${item.name}`}
              accessibilityRole="button"
              onPress={() => {
                onConfirmDeleteItem({
                  kind: 'source',
                  itemName: item.name,
                  listItemId: sourceRating.listItemId,
                  foodItemId: sourceRating.foodItemId,
                });
              }}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
              testID={`remove-source-rating-${sourceRating.listItemId}-${sourceRating.foodItemId}`}
            >
              <Ionicons color={theme.colors.text.danger} name="trash-outline" size={15} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {userRating ? (
        <View style={styles.userRow}>
          <View style={styles.userReviewRow}>
            <Text style={styles.userReviewArrow}>{'\u21b3'}</Text>
            <Text style={styles.userReviewText}>You</Text>
            <RatingPill rating={userRating.rating} />
            {userDisplayDateLabel ? <Text style={styles.userReviewDate}>{userDisplayDateLabel}</Text> : null}
          </View>
          <Pressable
            accessibilityLabel={`Remove your rating for ${item.name}`}
            accessibilityRole="button"
            onPress={() => {
              if (userRating.kind === 'linked') {
                onConfirmDeleteItem({
                  kind: 'user-linked',
                  itemName: item.name,
                  listItemId: userRating.listItemId,
                });
                return;
              }

              onConfirmDeleteItem({
                kind: 'user-standalone',
                itemName: item.name,
                listItemId: userRating.listItemId,
                foodItemId: userRating.foodItemId,
              });
            }}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
            testID={
              userRating.kind === 'linked'
                ? `remove-user-rating-${userRating.listItemId}-${userRating.userFoodItemId}`
                : `remove-list-item-${userRating.listItemId}-${userRating.foodItemId}`
            }
          >
            <Ionicons color={theme.colors.text.danger} name="trash-outline" size={15} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
