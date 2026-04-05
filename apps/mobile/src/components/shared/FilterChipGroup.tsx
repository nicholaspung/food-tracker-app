import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

export interface FilterChipOption<T extends string> {
  label: string;
  value: T;
}

interface FilterChipGroupProps<T extends string> {
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  scrollable?: boolean;
  wrap?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  chipStyle?: StyleProp<ViewStyle>;
  activeChipStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  activeLabelStyle?: StyleProp<TextStyle>;
}

export function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  wrap = false,
  contentContainerStyle,
  chipStyle,
  activeChipStyle,
  labelStyle,
  activeLabelStyle,
}: FilterChipGroupProps<T>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    rowWrap: {
      flexWrap: 'wrap',
    },
    scrollContent: {
      gap: theme.spacing.xs,
      paddingRight: theme.spacing.sm,
    },
    chip: {
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xxs,
    },
    chipActive: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
    },
    chipLabel: {
      color: theme.colors.text.secondary,
    },
    chipLabelActive: {
      color: theme.colors.text.info,
    },
  });

  const chips = options.map((option) => {
    const isSelected = option.value === value;

    return (
      <Pressable
        accessibilityRole="button"
        key={option.value}
        onPress={() => {
          onChange(option.value);
        }}
        style={[styles.chip, chipStyle, isSelected ? [styles.chipActive, activeChipStyle] : null]}
      >
        <Text
          style={[styles.chipLabel, labelStyle, isSelected ? [styles.chipLabelActive, activeLabelStyle] : null]}
          variant="bodySmTightSemiBold"
        >
          {option.label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, contentContainerStyle]} horizontal showsHorizontalScrollIndicator={false}>
        {chips}
      </ScrollView>
    );
  }

  return <View style={[styles.row, wrap && styles.rowWrap, contentContainerStyle]}>{chips}</View>;
}
