import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme } from '../../theme';
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

const useStyles = createThemedStyles(
  (theme, backgroundColor: string, textColor: string, size: RatingPillSize) => ({
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
    },
  }),
);

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
  const styles = useStyles(backgroundColor, textColor, size);

  return (
    <View style={[styles.pill, style]}>
      <Text
        style={[styles.text, labelStyle]}
        variant={size === 'md' ? 'bodySmTightBold' : 'microStrong'}
      >
        {String(label ?? getRatingLabel(rating))}
      </Text>
    </View>
  );
}
