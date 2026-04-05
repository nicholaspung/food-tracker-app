import { Pressable, StyleSheet, View } from 'react-native';

import { getRatingColor, RATING_OPTIONS } from '../../lib/ratingConstants';
import { useTheme, type Theme } from '../../theme';
import { Text } from '../../ui';

export { RATING_OPTIONS };

export function resolveRatingColor(theme: Theme, rating: number): string {
  return getRatingColor(theme, rating);
}

interface RatingSelectorProps {
  value: number;
  onChange: (value: number) => void;
  testIDPrefix?: string;
}

export function RatingSelector({ value, onChange, testIDPrefix }: RatingSelectorProps) {
  const theme = useTheme();
  const selectedOption = RATING_OPTIONS.find((o) => o.value === value);

  const dynamicStyles = StyleSheet.create({
    buttonSelected: {
      borderColor: theme.colors.border.info,
    },
    buttonText: {
      color: theme.colors.text.inverse,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {RATING_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.button,
                { backgroundColor: resolveRatingColor(theme, option.value) },
                isSelected && [styles.buttonSelected, dynamicStyles.buttonSelected],
                !isSelected && styles.buttonUnselected,
              ]}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
            >
              <Text style={[styles.buttonText, dynamicStyles.buttonText]} variant="labelMd">
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

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSelected: {
    opacity: 1,
    borderWidth: 2,
  },
  buttonUnselected: {
    opacity: 0.5,
  },
  buttonText: {
  },
  label: {
    textAlign: 'center',
  },
});
