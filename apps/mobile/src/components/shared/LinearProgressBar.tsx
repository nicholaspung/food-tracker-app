import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { createThemedStyles } from '../../theme';

interface LinearProgressBarProps {
  progress: number; // 0..1
  accessibilityLabel?: string;
  height?: number;
  trackStyle?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme, height: number) => ({
  track: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    backgroundColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.pill,
    height: '100%',
  },
}));

export function LinearProgressBar({
  progress,
  accessibilityLabel = 'Progress',
  height = 8,
  trackStyle,
}: LinearProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const accessiblePercent = Math.round(clamped * 100);
  const styles = useStyles(height);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityValue={{ min: 0, max: 100, now: accessiblePercent }}
      accessible
      style={[styles.track, trackStyle]}
    >
      <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  );
}
