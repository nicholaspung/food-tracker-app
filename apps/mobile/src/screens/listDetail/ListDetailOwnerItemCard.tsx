import { Ionicons } from '../../ui/AppIcon';
import { Pressable } from 'react-native';

import { FoodItemRatingRecordCard, type FoodItemRatingRecordRow } from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import {
  formatFullDateLabel,
  formatMonthYearLabel,
} from './listDetailFormatters';
import type {
  OwnerDisplayItem,
  OwnerItemPhotoEntry,
  PendingDeleteListItem,
} from './listDetailTypes';

const MIN_TOUCH_TARGET_SIZE = 44;

interface ListDetailOwnerItemCardProps {
  canCreateVisitFromRestaurant: boolean;
  groupIndex: number;
  item: OwnerDisplayItem;
  itemIndex: number;
  photoEntries: OwnerItemPhotoEntry[];
  onConfirmDeleteItem: (item: PendingDeleteListItem) => void;
  onIWentThere: (input: {
    foodItemId?: string;
    listItemId: string;
    menuItemId?: string;
    name: string;
    sourceUserId?: string;
  }) => void;
  onLongPressItem?: (item: OwnerDisplayItem) => void;
  onOpenPhotos: (entries: OwnerItemPhotoEntry[]) => void;
}

const useStyles = createThemedStyles((theme) => ({
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
    height: MIN_TOUCH_TARGET_SIZE,
    justifyContent: 'center',
    width: MIN_TOUCH_TARGET_SIZE,
  },
  deleteButtonPressed: {
    backgroundColor: theme.colors.status.dangerBg,
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
  onLongPressItem,
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
  const rows: FoodItemRatingRecordRow[] = [];

  if (sourceRating) {
    rows.push({
      id: `source-${sourceRating.listItemId}-${sourceRating.foodItemId}`,
      dateLabel: sourceMonthYearLabel,
      label: sourceRating.sourceUserName,
      rating: sourceRating.rating,
      type: 'source',
      actions: (
        <>
            {canShowIWent ? (
              <Pressable
                accessibilityLabel={`I went for ${item.name}`}
                accessibilityRole="button"
                onPress={() => {
                  onIWentThere({
                    foodItemId: sourceRating.foodItemId,
                    listItemId: sourceRating.listItemId,
                    menuItemId: sourceRating.menuItemId,
                    name: item.name,
                    sourceUserId: sourceRating.sourceUserId,
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
        </>
      ),
    });
  }

  if (userRating) {
    rows.push({
      id:
        userRating.kind === 'linked'
          ? `user-${userRating.listItemId}-${userRating.userFoodItemId}`
          : `user-${userRating.listItemId}-${userRating.foodItemId}`,
      dateLabel: userDisplayDateLabel,
      label: 'You',
      rating: userRating.rating,
      type: 'user',
      actions: (
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
      ),
    });
  }

  return (
    <FoodItemRatingRecordCard
      itemName={item.name}
      onLongPress={
        onLongPressItem
          ? () => {
              onLongPressItem(item);
            }
          : undefined
      }
      onOpenPhotos={onOpenPhotos}
      photoAccessibilityLabel={`View photos for ${item.name}`}
      photoEntries={photoEntries}
      photoTestID={`list-detail-photo-button-${groupIndex}-${itemIndex}`}
      rows={rows}
    />
  );
}
