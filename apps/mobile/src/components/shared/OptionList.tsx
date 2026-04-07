import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type OptionChevronDirection = 'forward' | 'up' | 'down';

interface OptionListProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export interface OptionListRowProps {
  title: string;
  subtitle?: string;
  iconName?: IoniconName;
  iconColor?: string;
  leading?: ReactNode;
  titleAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  chevron?: OptionChevronDirection | false;
  onPress?: () => void;
  connected?: boolean;
  isLast?: boolean;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

interface OptionListInlineBodyProps {
  children: ReactNode;
  withBottomDivider?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useListStyles = createThemedStyles((theme) => ({
  list: {
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
}));

const useRowStyles = createThemedStyles((theme) => ({
  row: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  rowConnected: {
    borderBottomWidth: 0,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  left: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  titleTextWrap: {
    flexShrink: 1,
  },
  title: {
    color: theme.colors.text.primary,
    ...theme.typography.titleSm,
  },
  subtitle: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  right: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
  },
}));

const useInlineBodyStyles = createThemedStyles((theme) => ({
  body: {
    backgroundColor: theme.colors.background.muted,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  bodyWithDivider: {
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
  },
}));

export function OptionList({ children, style }: OptionListProps) {
  const styles = useListStyles();

  return <View style={[styles.list, style]}>{children}</View>;
}

export function OptionListRow({
  title,
  subtitle,
  iconName,
  iconColor,
  leading,
  titleAccessory,
  rightAccessory,
  chevron,
  onPress,
  connected = false,
  isLast = false,
  style,
  titleStyle,
  subtitleStyle,
  accessibilityLabel,
  testID,
}: OptionListRowProps) {
  const theme = useTheme();
  const styles = useRowStyles();
  const chevronDirection = chevron ?? (onPress ? 'forward' : false);
  const chevronName =
    chevronDirection === 'up'
      ? 'chevron-up'
      : chevronDirection === 'down'
        ? 'chevron-down'
        : chevronDirection === 'forward'
          ? 'chevron-forward'
          : null;

  const rowContent = (
    <>
      <View style={styles.left}>
        {leading ? leading : null}
        {!leading && iconName ? (
          <Ionicons color={iconColor ?? theme.colors.text.brand} name={iconName} size={18} />
        ) : null}
        <View style={styles.textWrap}>
          <View style={styles.titleRow}>
            <View style={styles.titleTextWrap}>
              <Text style={[styles.title, titleStyle]}>{title}</Text>
            </View>
            {titleAccessory}
          </View>
          {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
        </View>
      </View>
      {rightAccessory || chevronName ? (
        <View style={styles.right}>
          {rightAccessory}
          {chevronName ? <Ionicons color={theme.colors.text.muted} name={chevronName} size={16} /> : null}
        </View>
      ) : null}
    </>
  );

  const rowStyle = [styles.row, connected && styles.rowConnected, isLast && styles.rowLast, style];
  if (!onPress) {
    return <View style={rowStyle}>{rowContent}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={rowStyle}
      testID={testID}
    >
      {rowContent}
    </Pressable>
  );
}

export function OptionListInlineBody({
  children,
  withBottomDivider = false,
  style,
  testID,
}: OptionListInlineBodyProps) {
  const styles = useInlineBodyStyles();

  return (
    <View style={[styles.body, withBottomDivider && styles.bodyWithDivider, style]} testID={testID}>
      {children}
    </View>
  );
}
