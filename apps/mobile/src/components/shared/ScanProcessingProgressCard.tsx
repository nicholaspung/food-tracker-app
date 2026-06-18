import type { Animated } from 'react-native';
import { Animated as RNAnimated, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import { Ionicons } from '../../ui/AppIcon';
import { LinearProgressBar } from './LinearProgressBar';

interface ScanProcessingProgressCardProps {
  detailText: string;
  elapsedLabel: string;
  imageName: string;
  processingPercent: number;
  progressValue: number;
  spin: Animated.AnimatedInterpolation<string | number>;
  statusText: string;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  motionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  spinner: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  textBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
}));

export function ScanProcessingProgressCard({
  detailText,
  elapsedLabel,
  imageName,
  processingPercent,
  progressValue,
  spin,
  statusText,
}: ScanProcessingProgressCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <View style={styles.motionRow}>
        <RNAnimated.View
          style={[
            styles.spinner,
            {
              transform: [{ rotate: spin }],
            },
          ]}
        >
          <Ionicons color={theme.colors.text.info} name="sync-outline" size={22} />
        </RNAnimated.View>
        <View style={styles.textBlock}>
          <Text tone="secondary">{statusText}</Text>
          <Text tone="secondary" variant="bodySm">
            {elapsedLabel}
          </Text>
        </View>
      </View>
      <Text variant="label">Processing "{imageName}"</Text>
      <LinearProgressBar progress={progressValue} />
      <Text tone="secondary">
        {processingPercent}% complete. {detailText}
      </Text>
    </Card>
  );
}
