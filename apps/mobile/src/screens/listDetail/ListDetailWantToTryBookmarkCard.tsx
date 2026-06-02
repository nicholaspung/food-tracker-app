import { Ionicons } from '../../ui/AppIcon';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { SectionHeader } from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';

interface ListDetailWantToTryBookmarkCardProps<Item> {
  groupIndex: number;
  friendOverlapCount?: number;
  isLocked?: boolean;
  items: readonly Item[];
  lockTestID?: string;
  onDeleteRestaurantBookmark?: () => void;
  onIWentThere?: () => void;
  primaryMetaLabel: string;
  renderItem: (item: Item, itemIndex: number) => ReactNode;
  restaurantName: string;
  secondaryMetaLabel: string | null;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  restaurantHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  restaurantTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  restaurantIndex: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyLgMedium,
  },
  restaurantTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLgBold,
  },
  metaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  metaIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  metaText: {
    color: theme.colors.text.secondary,
    flex: 1,
    minWidth: 0,
    ...theme.typography.bodyMd,
  },
  actionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
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
    borderRadius: theme.radii.sm,
    flexDirection: 'row',
    gap: 2,
    minHeight: 22,
    paddingHorizontal: theme.spacing.xs,
  },
  deleteButtonPressed: {
    backgroundColor: theme.colors.status.dangerBg,
  },
  section: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
}));

export function ListDetailWantToTryBookmarkCard<Item>({
  groupIndex,
  friendOverlapCount,
  isLocked = false,
  items,
  lockTestID,
  onDeleteRestaurantBookmark,
  onIWentThere,
  primaryMetaLabel,
  renderItem,
  restaurantName,
  secondaryMetaLabel,
}: ListDetailWantToTryBookmarkCardProps<Item>) {
  const theme = useTheme();
  const styles = useStyles();
  const metadataLabel = secondaryMetaLabel
    ? `${primaryMetaLabel} • ${secondaryMetaLabel}`
    : primaryMetaLabel;
  const friendOverlapLabel =
    typeof friendOverlapCount === 'number' && friendOverlapCount > 0
      ? `${friendOverlapCount} ${friendOverlapCount === 1 ? 'friend also wants' : 'friends also want'} to try this`
      : null;

  return (
    <Card style={styles.card} tone="default">
      <View style={styles.restaurantHeaderRow}>
        <View style={styles.restaurantTitleRow}>
          <Text style={styles.restaurantIndex}>{`${groupIndex + 1}.`}</Text>
          <Text style={styles.restaurantTitle}>{restaurantName}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {isLocked ? (
          <Ionicons
            accessibilityLabel="Private restaurant"
            color={theme.colors.text.muted}
            name="lock-closed-outline"
            size={14}
            style={styles.metaIcon}
            testID={lockTestID}
          />
        ) : null}
        <Ionicons
          color={theme.colors.text.muted}
          name="location-outline"
          size={14}
          style={styles.metaIcon}
        />
        <Text style={styles.metaText}>{metadataLabel}</Text>
      </View>

      {friendOverlapLabel ? (
        <View style={styles.metaRow}>
          <Ionicons
            color={theme.colors.text.muted}
            name="people-outline"
            size={14}
            style={styles.metaIcon}
          />
          <Text style={styles.metaText}>{friendOverlapLabel}</Text>
        </View>
      ) : null}

      {onIWentThere || onDeleteRestaurantBookmark ? (
        <View style={styles.actionsRow}>
          {onIWentThere ? (
            <Pressable
              accessibilityLabel={`I went to ${restaurantName}`}
              accessibilityRole="button"
              onPress={onIWentThere}
              style={({ pressed }) => [styles.iWentButton, pressed && styles.iWentButtonPressed]}
              testID={`i-went-restaurant-bookmark-${groupIndex}`}
            >
              <Ionicons color={theme.colors.text.success} name="location-outline" size={13} />
              <Text style={styles.iWentButtonLabel}>I went</Text>
            </Pressable>
          ) : null}
          {onDeleteRestaurantBookmark ? (
            <Pressable
              accessibilityLabel={`Remove ${restaurantName} from Want to Try`}
              accessibilityRole="button"
              onPress={onDeleteRestaurantBookmark}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
              testID={`delete-restaurant-bookmark-${groupIndex}`}
            >
              <Ionicons color={theme.colors.text.danger} name="trash-outline" size={14} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {items.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Saved Recommendations" titleTone="secondary" />
          {items.map(renderItem)}
        </View>
      ) : null}
    </Card>
  );
}
