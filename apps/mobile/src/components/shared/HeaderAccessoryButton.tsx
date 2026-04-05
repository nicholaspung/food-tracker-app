import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface HeaderAccessoryButtonProps {
  label: string;
  onPress: () => void;
  iconName?: IoniconName;
  iconSize?: number;
  iconColor?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export function HeaderAccessoryButton({
  label,
  onPress,
  iconName = 'add-outline',
  iconSize = 14,
  iconColor,
  accessibilityLabel,
  disabled = false,
  style,
  labelStyle,
  testID,
}: HeaderAccessoryButtonProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xxs,
      justifyContent: 'center',
      minHeight: 32,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
    },
    buttonPressed: {
      backgroundColor: theme.colors.background.muted,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
        style,
      ]}
      testID={testID}
    >
      <Ionicons
        color={iconColor ?? theme.colors.text.primary}
        name={iconName}
        size={iconSize}
      />
      <Text style={labelStyle} variant="label">
        {label}
      </Text>
    </Pressable>
  );
}
