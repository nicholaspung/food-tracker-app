import { Pressable, View } from 'react-native';

import { getRatingColor, getRatingLabel, RATING_OPTIONS } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme, type Theme } from '../../theme';
import { Text } from '../../ui';

export function resolveRatingColor(theme: Theme, rating: number): string {
  return getRatingColor(theme, rating);
}

interface RatingSelectorProps {
  value: number;
  onChange: (value: number) => void;
  testIDPrefix?: string;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  buttonSelected: {
    borderColor: theme.colors.border.info,
    borderWidth: 2,
    opacity: 1,
  },
  buttonUnselected: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.text.inverse,
  },
  label: {
    textAlign: 'center',
  },
}));

export function RatingSelector({ value, onChange, testIDPrefix }: RatingSelectorProps) {
  const theme = useTheme();
  const styles = useStyles();
  const selectedOption = RATING_OPTIONS.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {RATING_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <Pressable
              accessibilityLabel={`${option.value}, ${getRatingLabel(option.value)}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.button,
                { backgroundColor: resolveRatingColor(theme, option.value) },
                isSelected && styles.buttonSelected,
                !isSelected && styles.buttonUnselected,
              ]}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
            >
              <Text style={styles.buttonText} variant="labelMd">
                {option.value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selectedOption && (
        <Text tone="secondary" style={styles.label} variant="bodySmTight">
          {selectedOption.label}
        </Text>
      )}
    </View>
  );
}
