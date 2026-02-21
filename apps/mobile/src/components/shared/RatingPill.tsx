import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { useTheme } from '../../theme';
import { Text } from '../../ui';

type RatingPillSize = 'sm' | 'md';

interface RatingPillProps {
  rating: number;
  label?: string | number;
  size?: RatingPillSize;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

function isKnownRating(rating: number): boolean {
  return Number.isFinite(rating) && rating >= 1 && rating <= 5;
}

export function RatingPill({
  rating,
  label,
  size = 'sm',
  style,
  labelStyle,
}: RatingPillProps) {
  const theme = useTheme();
  const knownRating = isKnownRating(rating);
  const backgroundColor = knownRating
    ? getRatingColor(theme, rating)
    : theme.colors.background.muted;
  const textColor = knownRating
    ? theme.colors.text.inverse
    : theme.colors.text.secondary;

  const styles = StyleSheet.create({
    pill: {
      alignItems: 'center',
      backgroundColor,
      borderColor: backgroundColor,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minWidth: size === 'md' ? 22 : 20,
      paddingHorizontal: size === 'md' ? theme.spacing.sm : theme.spacing.xs,
      paddingVertical: 2,
    },
    text: {
      color: textColor,
      fontSize: size === 'md' ? 12 : 10,
      fontWeight: '700',
      lineHeight: size === 'md' ? 16 : 14,
    },
  });

  return (
    <View style={[styles.pill, style]}>
      <Text style={[styles.text, labelStyle]}>
        {String(label ?? getRatingLabel(rating))}
      </Text>
    </View>
  );
}
