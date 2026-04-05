import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

export type StatusPillTone = 'brand' | 'info' | 'warning' | 'success' | 'danger' | 'muted';
type StatusPillVariant = 'solid' | 'soft';
type StatusPillSize = 'sm' | 'md';

export interface StatusPillProps {
  label: string | number;
  tone?: StatusPillTone;
  variant?: StatusPillVariant;
  size?: StatusPillSize;
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

function resolveToneColors(
  tone: StatusPillTone,
  variant: StatusPillVariant,
  theme: ReturnType<typeof useTheme>,
): { backgroundColor: string; borderColor: string; textColor: string } {
  if (variant === 'solid') {
    if (tone === 'info') {
      return {
        backgroundColor: theme.colors.text.info,
        borderColor: theme.colors.text.info,
        textColor: theme.colors.text.inverse,
      };
    }

    if (tone === 'warning') {
      return {
        backgroundColor: theme.colors.text.warning,
        borderColor: theme.colors.text.warning,
        textColor: theme.colors.text.inverse,
      };
    }

    if (tone === 'success') {
      return {
        backgroundColor: theme.colors.text.success,
        borderColor: theme.colors.text.success,
        textColor: theme.colors.text.inverse,
      };
    }

    if (tone === 'danger') {
      return {
        backgroundColor: theme.colors.text.danger,
        borderColor: theme.colors.text.danger,
        textColor: theme.colors.text.inverse,
      };
    }

    if (tone === 'muted') {
      return {
        backgroundColor: theme.colors.background.muted,
        borderColor: theme.colors.border.subtle,
        textColor: theme.colors.text.secondary,
      };
    }

    return {
      backgroundColor: theme.colors.text.brand,
      borderColor: theme.colors.text.brand,
      textColor: theme.colors.text.inverse,
    };
  }

  if (tone === 'warning') {
    return {
      backgroundColor: theme.colors.status.warningBg,
      borderColor: theme.colors.border.warning,
      textColor: theme.colors.text.warning,
    };
  }

  if (tone === 'success') {
    return {
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.border.success,
      textColor: theme.colors.text.success,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: theme.colors.status.dangerBg,
      borderColor: theme.colors.border.danger,
      textColor: theme.colors.text.danger,
    };
  }

  if (tone === 'muted') {
    return {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      textColor: theme.colors.text.muted,
    };
  }

  return {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    textColor: tone === 'brand' ? theme.colors.text.brand : theme.colors.text.info,
  };
}

export function StatusPill({
  label,
  tone = 'info',
  variant = 'soft',
  size = 'sm',
  uppercase = false,
  style,
  labelStyle,
}: StatusPillProps) {
  const theme = useTheme();
  const { backgroundColor, borderColor, textColor } = resolveToneColors(tone, variant, theme);
  const textLabel = uppercase ? String(label).toUpperCase() : String(label);

  const styles = StyleSheet.create({
    pill: {
      alignItems: 'center',
      backgroundColor,
      borderColor,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minWidth: size === 'md' ? 22 : 20,
      paddingHorizontal: size === 'md' ? theme.spacing.sm : theme.spacing.xs,
      paddingVertical: 2,
    },
    label: {
      color: textColor,
    },
  });

  return (
    <View style={[styles.pill, style]}>
      <Text
        style={[styles.label, labelStyle]}
        variant={size === 'md' ? 'bodySmTightBold' : 'microStrong'}
      >
        {textLabel}
      </Text>
    </View>
  );
}
