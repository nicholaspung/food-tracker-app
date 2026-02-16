import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

type ListItemTone = 'default' | 'muted';

export interface ListItemProps {
  title: string;
  description?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  tone?: ListItemTone;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListItem({
  title,
  description,
  leading,
  trailing,
  onPress,
  disabled = false,
  tone = 'default',
  style,
  contentStyle,
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
    disabled: {
      opacity: 0.6,
    },
    pressed: {
      backgroundColor: tone === 'muted' ? theme.colors.background.surface : theme.colors.background.muted,
    },
  });

  const content = (
    <>
      {leading ? <View>{leading}</View> : null}
      <View style={[styles.content, contentStyle]}>
        <Text variant="label">{title}</Text>
        {description ? <Text tone="secondary">{description}</Text> : null}
      </View>
      {trailing ? <View>{trailing}</View> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.item, style, disabled && styles.disabled]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
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
