import { StyleSheet, Text as RNText } from 'react-native';
import type { StyleProp, TextProps as RNTextProps, TextStyle } from 'react-native';

import { useTheme, type Theme } from '../theme';

type TextVariant = 'titleLg' | 'titleMd' | 'bodyLg' | 'bodyMd' | 'bodySm' | 'label' | 'button';
type TextTone = 'primary' | 'secondary' | 'muted' | 'inverse' | 'brand' | 'danger' | 'warning' | 'success' | 'info';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}

function resolveColor(tone: TextTone, theme: Theme): string {
  switch (tone) {
    case 'secondary':
      return theme.colors.text.secondary;
    case 'muted':
      return theme.colors.text.muted;
    case 'inverse':
      return theme.colors.text.inverse;
    case 'brand':
      return theme.colors.text.brand;
    case 'danger':
      return theme.colors.text.danger;
    case 'warning':
      return theme.colors.text.warning;
    case 'success':
      return theme.colors.text.success;
    case 'info':
      return theme.colors.text.info;
    case 'primary':
    default:
      return theme.colors.text.primary;
  }
}

export function Text({ variant = 'bodyMd', tone = 'primary', style, children, ...props }: TextProps) {
  const theme = useTheme();
  const tokenStyle = theme.typography[variant];

  return (
    <RNText
      {...props}
      style={[
        styles.base,
        tokenStyle,
        {
          color: resolveColor(tone, theme),
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
