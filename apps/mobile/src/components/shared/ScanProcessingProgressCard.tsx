import type { Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated as RNAnimated, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import { Ionicons } from '../../ui/AppIcon';
import { LinearProgressBar } from './LinearProgressBar';

interface ScanProcessingProgressCardProps {
  detailText: string;
  elapsedLabel: string;
  imageName: string;
  processingPercent: number;
  progressAccessibilityLabel: string;
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

function getProgressAnnouncementMilestone(processingPercent: number): number {
  const clampedPercent = Math.max(0, Math.min(100, processingPercent));

  if (clampedPercent >= 100) {
    return 100;
  }
  if (clampedPercent >= 75) {
    return 75;
  }
  if (clampedPercent >= 50) {
    return 50;
  }
  if (clampedPercent >= 25) {
    return 25;
  }

  return 0;
}

export function ScanProcessingProgressCard({
  detailText,
  elapsedLabel,
  imageName,
  processingPercent,
  progressAccessibilityLabel,
  progressValue,
  spin,
  statusText,
}: ScanProcessingProgressCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const announcementMilestone = getProgressAnnouncementMilestone(processingPercent);
  const lastAnnouncementKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const announcementKey = `${progressAccessibilityLabel}:${announcementMilestone}`;
    if (lastAnnouncementKeyRef.current === announcementKey) {
      return;
    }

    lastAnnouncementKeyRef.current = announcementKey;
    AccessibilityInfo.announceForAccessibility(
      announcementMilestone === 0
        ? `${progressAccessibilityLabel} started.`
        : `${progressAccessibilityLabel}, ${announcementMilestone}% complete.`,
    );
  }, [announcementMilestone, progressAccessibilityLabel]);

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
      <LinearProgressBar
        accessibilityLabel={progressAccessibilityLabel}
        progress={progressValue}
      />
      <Text tone="secondary">
        {processingPercent}% complete. {detailText}
      </Text>
    </Card>
  );
}
