import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

interface FeedRatingDisplayProps {
  rating: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}

const useStyles = createThemedStyles((theme) => ({
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  ratingDot: {
    borderRadius: theme.radii.pill,
    height: 10,
    width: 10,
  },
  ratingLabel: {
    color: theme.colors.text.secondary,
  },
}));

export function FeedRatingDisplay({
  rating,
  style,
  labelStyle,
  testID,
}: FeedRatingDisplayProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View style={[styles.ratingRow, style]} testID={testID}>
      <View
        style={[
          styles.ratingDot,
          { backgroundColor: getRatingColor(theme, rating) },
        ]}
      />
      <Text style={[styles.ratingLabel, labelStyle]} variant="bodySmTightMedium">
        {getRatingLabel(rating)}
      </Text>
    </View>
  );
}
