import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Button } from '../../ui';
import {
  formatTastingJoinWindowDurationLabel,
  TASTING_JOIN_WINDOW_DURATION_OPTIONS,
} from './shared';

interface TastingJoinWindowDurationSelectorProps {
  value: number;
  onChange: (durationMinutes: number) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme) => ({
  stack: {
    gap: theme.spacing.sm,
  },
}));

export function TastingJoinWindowDurationSelector({
  value,
  onChange,
  disabled = false,
  style,
}: TastingJoinWindowDurationSelectorProps) {
  const styles = useStyles();

  return (
    <View style={[styles.stack, style]}>
      {TASTING_JOIN_WINDOW_DURATION_OPTIONS.map((durationMinutes) => {
        const isSelected = durationMinutes === value;
        const label = formatTastingJoinWindowDurationLabel(durationMinutes);

        return (
          <Button
            accessibilityLabel={`Join window ${label}`}
            disabled={disabled}
            key={durationMinutes}
            onPress={() => onChange(durationMinutes)}
            label={label}
            testID={`tasting-join-window-duration-${durationMinutes}`}
            variant={isSelected ? 'primary' : 'secondary'}
          />
        );
      })}
    </View>
  );
}
