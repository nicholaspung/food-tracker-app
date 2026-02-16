import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
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
}

export function OptionList({ children, style }: OptionListProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    list: {
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
  });

  return <View style={[styles.list, style]}>{children}</View>;
}

export function OptionListRow({
  title,
  subtitle,
  iconName,
  iconColor,
  leading,
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
  const chevronDirection = chevron ?? (onPress ? 'forward' : false);
  const chevronName =
    chevronDirection === 'up'
      ? 'chevron-up'
      : chevronDirection === 'down'
        ? 'chevron-down'
        : chevronDirection === 'forward'
          ? 'chevron-forward'
          : null;

  const styles = StyleSheet.create({
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
    title: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 19,
    },
    subtitle: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    right: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'flex-end',
    },
  });

  const rowContent = (
    <>
      <View style={styles.left}>
        {leading ? leading : null}
        {!leading && iconName ? (
          <Ionicons color={iconColor ?? theme.colors.text.brand} name={iconName} size={18} />
        ) : null}
        <View style={styles.textWrap}>
          <Text style={[styles.title, titleStyle]}>{title}</Text>
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
}: OptionListInlineBodyProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    body: {
      backgroundColor: theme.colors.background.muted,
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
    },
    bodyWithDivider: {
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
    },
  });

  return <View style={[styles.body, withBottomDivider && styles.bodyWithDivider, style]}>{children}</View>;
}
