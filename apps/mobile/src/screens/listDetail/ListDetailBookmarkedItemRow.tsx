import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';

import { RatingPill } from '../../components/shared';
import { formatMonthYearLabel } from '../../features/restaurantLists/listDetailFormatters';
import type {
  GroupedBookmarkedItem,
  OwnerItemPhotoEntry,
} from '../../features/restaurantLists/listDetailTypes';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { ListDetailItemPhotoButton } from './ListDetailItemPhotoButton';

interface ListDetailBookmarkedItemRowProps {
  canSave: boolean;
  groupIndex: number;
  isSaved: boolean;
  item: GroupedBookmarkedItem;
  itemIndex: number;
  photoEntries: OwnerItemPhotoEntry[];
  onOpenPhotos: (entries: OwnerItemPhotoEntry[]) => void;
  onSave: (item: GroupedBookmarkedItem) => void;
}

const useStyles = createThemedStyles((theme) => ({
  block: {
    gap: 2,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  left: {
    alignItems: 'center',
    columnGap: theme.spacing.xxs,
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
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
  itemName: {
    color: theme.colors.text.primary,
    flexShrink: 1,
    ...theme.typography.bodyLgTightMedium,
  },
  metaDot: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  date: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  bookmarkButton: {
    alignItems: 'center',
    borderRadius: theme.radii.sm,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  bookmarkButtonPressed: {
    backgroundColor: theme.colors.status.infoBg,
  },
}));

export function ListDetailBookmarkedItemRow({
  canSave,
  groupIndex,
  isSaved,
  item,
  itemIndex,
  photoEntries,
  onOpenPhotos,
  onSave,
}: ListDetailBookmarkedItemRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const monthYearLabel = formatMonthYearLabel(item.visitedAt);
  const hasSourceBookmark = Boolean(item.sourceUserId || item.sourceUserName);
  const sourceUserDisplayName = item.sourceUserName?.trim() || 'Friend';

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.left}>
          {hasSourceBookmark ? (
            <View style={styles.sourceUserRow}>
              <Ionicons color={theme.colors.text.info} name="people-outline" size={11} />
              <Text style={styles.sourceUserText}>{sourceUserDisplayName}</Text>
            </View>
          ) : null}
          <Text numberOfLines={1} style={styles.itemName}>
            {item.name}
          </Text>
          {item.rating > 0 ? (
            <>
              <Text style={styles.metaDot}>{'\u2022'}</Text>
              <RatingPill rating={item.rating} />
            </>
          ) : null}
          {monthYearLabel ? (
            <>
              <Text style={styles.metaDot}>{'\u2022'}</Text>
              <Text style={styles.date}>{monthYearLabel}</Text>
            </>
          ) : null}
        </View>
        {photoEntries.length > 0 ? (
          <ListDetailItemPhotoButton
            accessibilityLabel={`View photos for ${item.name}`}
            entries={photoEntries}
            onOpen={onOpenPhotos}
            testID={`list-detail-friend-photo-button-${groupIndex}-${itemIndex}`}
          />
        ) : null}
        {canSave ? (
          <Pressable
            accessibilityLabel={`Save ${item.name} to my lists`}
            accessibilityRole="button"
            onPress={() => {
              onSave(item);
            }}
            style={({ pressed }) => [styles.bookmarkButton, pressed && styles.bookmarkButtonPressed]}
            testID={`save-list-item-${item.listItemId}`}
          >
            <Ionicons
              color={isSaved ? theme.colors.text.info : theme.colors.text.muted}
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
