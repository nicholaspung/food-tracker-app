import { Ionicons } from '../../ui/AppIcon';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { SectionHeader } from '../../components/shared';
import type { RestaurantListFriendMatchRecord } from '../../features';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';

interface ListDetailWantToTryBookmarkCardProps<Item> {
  friendMatches?: readonly RestaurantListFriendMatchRecord[];
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
  showFriendMatches?: boolean;
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
    gap: 0,
    paddingTop: theme.spacing.sm,
  },
  friendSection: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  sectionHeader: {
    marginBottom: theme.spacing.xs,
  },
  friendMatchRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  friendMatchIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  friendMatchText: {
    color: theme.colors.text.secondary,
    flex: 1,
    minWidth: 0,
    ...theme.typography.bodySmTight,
  },
  friendMatchName: {
    color: theme.colors.text.primary,
    ...theme.typography.bodySmTightSemiBold,
  },
  itemSeparator: {
    backgroundColor: theme.colors.border.subtle,
    height: 1,
  },
}));

function buildFriendMatchLabel(match: RestaurantListFriendMatchRecord): string {
  const itemName = match.itemName?.trim();
  if (match.kind === 'menu_item' && itemName) {
    return `saved ${itemName}`;
  }

  return 'also wants to try this';
}

export function ListDetailWantToTryBookmarkCard<Item>({
  friendMatches = [],
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
  showFriendMatches = false,
}: ListDetailWantToTryBookmarkCardProps<Item>) {
  const theme = useTheme();
  const styles = useStyles();
  const metadataLabel = secondaryMetaLabel
    ? `${primaryMetaLabel} • ${secondaryMetaLabel}`
    : primaryMetaLabel;
  const visibleFriendMatches = showFriendMatches ? friendMatches : [];
  const friendOverlapLabel =
    showFriendMatches &&
    visibleFriendMatches.length === 0 &&
    typeof friendOverlapCount === 'number' &&
    friendOverlapCount > 0
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

      {visibleFriendMatches.length > 0 ? (
        <View style={styles.friendSection} testID={`want-to-try-friend-matches-${groupIndex}`}>
          <SectionHeader title="Friends" titleTone="secondary" />
          {visibleFriendMatches.map((match, matchIndex) => (
            <View key={`${match.friendId}-${match.savedAt ?? matchIndex}`} style={styles.friendMatchRow}>
              <Ionicons
                color={theme.colors.text.muted}
                name={match.kind === 'menu_item' ? 'restaurant-outline' : 'people-outline'}
                size={13}
                style={styles.friendMatchIcon}
              />
              <Text style={styles.friendMatchText}>
                <Text style={styles.friendMatchName}>{match.friendName}</Text>
                {` ${buildFriendMatchLabel(match)}`}
              </Text>
            </View>
          ))}
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
          <View style={styles.sectionHeader}>
            <SectionHeader title="Saved Menu Items" titleTone="secondary" />
          </View>
          {items.map((item, itemIndex) => (
            <View key={itemIndex}>
              {renderItem(item, itemIndex)}
              {itemIndex < items.length - 1 ? <View style={styles.itemSeparator} /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
