import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { ListItem, Text } from '../../ui';
import type { OwnerDisplayItem } from '../../features/restaurantLists/listDetailTypes';

const MIN_TOUCH_TARGET_SIZE = 44;

interface ListDetailWantToTryMenuItemRowProps {
  canCreateVisitFromRestaurant: boolean;
  canDelete: boolean;
  item: OwnerDisplayItem;
  itemIndex: number;
  onDelete: (item: OwnerDisplayItem) => void;
  onIWentThere: (input: {
    foodItemId?: string;
    listItemId: string;
    menuItemId?: string;
    name: string;
    sourceUserId?: string;
  }) => void;
}

const useStyles = createThemedStyles((theme) => ({
  item: {
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
  },
  itemContent: {
    minWidth: 0,
  },
  actions: {
    alignItems: 'center',
    flexShrink: 0,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  iWentButton: {
    alignItems: 'center',
    borderRadius: theme.radii.sm,
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET_SIZE,
    minWidth: MIN_TOUCH_TARGET_SIZE,
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
    borderRadius: theme.radii.sm,
    height: MIN_TOUCH_TARGET_SIZE,
    justifyContent: 'center',
    width: MIN_TOUCH_TARGET_SIZE,
  },
  deleteButtonPressed: {
    backgroundColor: theme.colors.status.dangerBg,
  },
}));

function resolveIwentListItemId(item: OwnerDisplayItem): string | null {
  return item.source?.listItemId ?? item.user?.listItemId ?? item.bookmark.listItemId;
}

export function ListDetailWantToTryMenuItemRow({
  canCreateVisitFromRestaurant,
  canDelete,
  item,
  itemIndex,
  onDelete,
  onIWentThere,
}: ListDetailWantToTryMenuItemRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const listItemId = resolveIwentListItemId(item);
  const canShowIWent = Boolean(canCreateVisitFromRestaurant && listItemId);

  return (
    <ListItem
      contentStyle={styles.itemContent}
      style={styles.item}
      testID={`want-to-try-menu-item-${itemIndex}`}
      title={item.name}
      trailing={
        <View style={styles.actions}>
          {canShowIWent && listItemId ? (
            <Pressable
              accessibilityLabel={`I went for ${item.name}`}
              accessibilityRole="button"
              onPress={() => {
                onIWentThere({
                  foodItemId: item.bookmark.foodItemId,
                  listItemId,
                  menuItemId: item.bookmark.menuItemId,
                  name: item.name,
                  sourceUserId: item.source?.sourceUserId,
                });
              }}
              style={({ pressed }) => [styles.iWentButton, pressed && styles.iWentButtonPressed]}
              testID={`i-went-list-item-${listItemId}`}
            >
              <Ionicons color={theme.colors.text.success} name="location-outline" size={13} />
              <Text style={styles.iWentButtonLabel}>I went</Text>
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              accessibilityLabel={`Remove ${item.name} from Want to Try`}
              accessibilityRole="button"
              onPress={() => {
                onDelete(item);
              }}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
              testID={`remove-want-to-try-menu-item-${listItemId ?? item.key}`}
            >
              <Ionicons color={theme.colors.text.danger} name="trash-outline" size={15} />
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}
