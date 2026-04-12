import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles } from '../theme';

export type CardTone = 'default' | 'muted' | 'info' | 'warning' | 'danger' | 'success';

export interface CardProps {
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme, tone: CardTone) => ({
  card: {
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderColor:
      tone === 'muted'
        ? theme.colors.border.subtle
        : tone === 'info'
          ? theme.colors.status.infoBorder
          : tone === 'warning'
            ? theme.colors.status.warningBorder
            : tone === 'danger'
              ? theme.colors.status.dangerBorder
              : tone === 'success'
                ? theme.colors.status.successBorder
                : theme.colors.border.default,
    backgroundColor:
      tone === 'muted'
        ? theme.colors.background.muted
        : tone === 'info'
          ? theme.colors.status.infoBg
          : tone === 'warning'
            ? theme.colors.status.warningBg
            : tone === 'danger'
              ? theme.colors.status.dangerBg
              : tone === 'success'
                ? theme.colors.status.successBg
                : theme.colors.background.surface,
  },
}));

export function Card({ children, tone = 'default', style }: PropsWithChildren<CardProps>) {
  const styles = useStyles(tone);

  return <View style={[styles.card, style]}>{children}</View>;
}
