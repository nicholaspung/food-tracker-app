import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { ExpandableText } from './ExpandableText';
import { VisibilityBadge } from './VisibilityBadge';

type MenuItemVisibility = 'private' | 'friends' | 'public';

interface VisitMenuItemOptionRowProps {
  name: string;
  description?: string;
  visibility?: MenuItemVisibility;
  userEatenCount?: number;
  friendEatenCount?: number;
  selected: boolean;
  compactActions?: boolean;
  onPress: () => void;
  onEditPress?: () => void;
  optionTestID?: string;
  selectButtonTestID?: string;
  editButtonTestID?: string;
}

function normalizeMenuItemVisibility(value: MenuItemVisibility | undefined): MenuItemVisibility {
  if (value === 'private' || value === 'public') {
    return value;
  }

  return 'friends';
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'stretch',
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  containerSelected: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
  },
  containerCompact: {
    paddingVertical: theme.spacing.xs,
  },
  mainButton: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  nameWrap: {
    flex: 1,
    paddingRight: theme.spacing.xs,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  eatenBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  friendEatenBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  actionsColumn: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  actionsColumnCompact: {
    gap: theme.spacing.xxs,
    justifyContent: 'flex-start',
  },
  selectButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    padding: theme.spacing.xxs,
  },
  editButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
  },
  editButtonCompact: {
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: theme.spacing.xxs,
    paddingVertical: 0,
  },
}));

export function VisitMenuItemOptionRow({
  name,
  description,
  visibility,
  userEatenCount,
  friendEatenCount,
  selected,
  compactActions = false,
  onPress,
  onEditPress,
  optionTestID,
  selectButtonTestID,
  editButtonTestID,
}: VisitMenuItemOptionRowProps) {
  const theme = useTheme();
  const resolvedVisibility = normalizeMenuItemVisibility(visibility);
  const shouldShowVisibilityBadge = resolvedVisibility !== 'public';
  const trimmedDescription = description?.trim() || '';
  const normalizedEatenCount =
    typeof userEatenCount === 'number' && Number.isFinite(userEatenCount)
      ? Math.max(0, Math.floor(userEatenCount))
      : 0;
  const normalizedFriendEatenCount =
    typeof friendEatenCount === 'number' && Number.isFinite(friendEatenCount)
      ? Math.max(0, Math.floor(friendEatenCount))
      : 0;
  const styles = useStyles();

  return (
    <View
      style={[
        styles.container,
        selected ? styles.containerSelected : null,
        compactActions ? styles.containerCompact : null,
      ]}
    >
      <Pressable
        accessibilityHint={selected ? `Deselects ${name}` : `Selects ${name}`}
        accessibilityLabel={name}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={styles.mainButton}
        testID={optionTestID}
      >
        <View style={styles.headerRow}>
          <View style={styles.nameWrap}>
            <Text variant="label">{name}</Text>
          </View>
        </View>

        {trimmedDescription ? (
          <ExpandableText
            collapsedNumberOfLines={2}
            interactionMode="inline-toggle"
            stopPropagationOnToggle
            tone="secondary"
            variant="bodySm"
          >
            {trimmedDescription}
          </ExpandableText>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.badgeRow}>
            {shouldShowVisibilityBadge ? <VisibilityBadge value={resolvedVisibility} /> : null}
            {normalizedEatenCount > 0 ? (
              <View style={styles.eatenBadge}>
                <Ionicons
                  color={theme.colors.text.success}
                  name="restaurant-outline"
                  size={12}
                />
                <Text tone="success" variant="bodySm">
                  {`Had ${normalizedEatenCount} ${normalizedEatenCount === 1 ? 'time' : 'times'}`}
                </Text>
              </View>
            ) : null}
            {normalizedFriendEatenCount > 0 ? (
              <View style={styles.friendEatenBadge}>
                <Ionicons
                  color={theme.colors.text.info}
                  name="people-outline"
                  size={12}
                />
                <Text tone="info" variant="bodySm">
                  {`Had ${normalizedFriendEatenCount} ${normalizedFriendEatenCount === 1 ? 'time' : 'times'}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View
        collapsable={false}
        style={[
          styles.actionsColumn,
          compactActions ? styles.actionsColumnCompact : null,
        ]}
      >
	        <Pressable
	          accessibilityHint={selected ? `Deselects ${name}` : `Selects ${name}`}
	          accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${name}`}
	          accessibilityRole="button"
	          accessibilityState={{ selected }}
	          hitSlop={12}
	          onPress={onPress}
          style={styles.selectButton}
          testID={selectButtonTestID}
        >
          <Ionicons
            color={selected ? theme.colors.text.success : theme.colors.text.muted}
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
          />
        </Pressable>

        {onEditPress ? (
          <Pressable
            accessibilityHint="Opens menu item edit options"
            accessibilityLabel={`Edit ${name}`}
            accessibilityRole="button"
            accessible
            collapsable={false}
            hitSlop={12}
            onPress={(event) => {
              event.stopPropagation();
              onEditPress();
            }}
            style={[
              styles.editButton,
              compactActions ? styles.editButtonCompact : null,
            ]}
            testID={editButtonTestID}
          >
            <Ionicons color={theme.colors.text.secondary} name="pencil-outline" size={14} />
            <Text tone="secondary" variant="bodySm">
              Edit
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
