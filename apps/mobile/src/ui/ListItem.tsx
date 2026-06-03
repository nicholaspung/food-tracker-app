import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

type ListItemTone = 'default' | 'muted';

export interface ListItemProps {
  title: string;
  titleAccessory?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  tone?: ListItemTone;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  separateTrailingAction?: boolean;
  testID?: string;
}

export function ListItem({
  title,
  titleAccessory,
  description,
  leading,
  trailing,
  onPress,
  onLongPress,
  disabled = false,
  tone = 'default',
  style,
  contentStyle,
  separateTrailingAction = false,
  testID,
}: ListItemProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    item: {
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: tone === 'muted' ? 'transparent' : theme.colors.border.subtle,
      backgroundColor: tone === 'muted' ? theme.colors.background.muted : theme.colors.background.surface,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    content: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    pressableContent: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    disabled: {
      opacity: 0.6,
    },
    pressed: {
      backgroundColor: tone === 'muted' ? theme.colors.background.surface : theme.colors.background.muted,
    },
    pressedInline: {
      opacity: 0.75,
    },
  });

  const mainContent = (
    <>
      {leading ? <View>{leading}</View> : null}
      <View style={[styles.content, contentStyle]}>
        <View style={styles.titleRow}>
          <Text variant="label">{title}</Text>
          {titleAccessory}
        </View>
        {typeof description === 'string' ? <Text tone="secondary">{description}</Text> : description ?? null}
      </View>
    </>
  );

  const content = (
    <>
      {mainContent}
      {trailing ? <View>{trailing}</View> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.item, style, disabled && styles.disabled]}>{content}</View>;
  }

  if (trailing && separateTrailingAction) {
    return (
      <View style={[styles.item, style, disabled && styles.disabled]}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onLongPress={onLongPress}
          onPress={onPress}
          style={({ pressed }) => [
            styles.pressableContent,
            pressed && !disabled && styles.pressedInline,
          ]}
          testID={testID}
        >
          {mainContent}
        </Pressable>
        <View>{trailing}</View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        style,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
