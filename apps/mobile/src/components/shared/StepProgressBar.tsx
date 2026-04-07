import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Text } from '../../ui';

interface Step {
  label: string;
}

interface StepProgressBarProps {
  steps: Step[];
  currentStep: number; // 0-indexed
  compact?: boolean;
  showCompletedCheckmark?: boolean;
}

const useStyles = createThemedStyles((
  theme,
  compact: boolean,
  circleSize: number,
  connectorHeight: number,
) => ({
  container: {
    gap: compact ? theme.spacing.xxs : theme.spacing.xs,
  },
  trackWrap: {
    justifyContent: 'center',
    minHeight: circleSize,
    position: 'relative',
  },
  connectorsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    top: circleSize / 2 - 1,
  },
  connectorSideSpacer: {
    flex: 0.5,
  },
  connectorSegment: {
    flex: 1,
  },
  connectorSegmentInner: {
    backgroundColor: theme.colors.border.default,
    borderRadius: connectorHeight / 2,
    height: connectorHeight,
  },
  connectorSegmentActive: {
    backgroundColor: theme.colors.button.primaryBg,
  },
  circlesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  circleCell: {
    alignItems: 'center',
    flex: 1,
  },
  circle: {
    alignItems: 'center',
    borderRadius: circleSize / 2,
    height: circleSize,
    justifyContent: 'center',
    width: circleSize,
  },
  circleCurrent: {
    backgroundColor: theme.colors.button.primaryBg,
    borderColor: `${theme.colors.button.primaryBg}40`,
    borderWidth: compact ? 1 : 2,
  },
  circleCompleted: {
    backgroundColor: theme.colors.button.primaryBg,
  },
  circleFuture: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.default,
    borderWidth: 1,
  },
  circleTextActive: {
    color: theme.colors.button.primaryText,
  },
  circleTextFuture: {
    color: theme.colors.text.muted,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelCell: {
    alignItems: 'center',
    flex: 1,
  },
}));

export function StepProgressBar({
  steps,
  currentStep,
  compact = false,
  showCompletedCheckmark = true,
}: StepProgressBarProps) {
  const circleSize = compact ? 26 : 34;
  const connectorHeight = compact ? 1 : 2;
  const styles = useStyles(compact, circleSize, connectorHeight);

  return (
    <View style={styles.container}>
      <View style={styles.trackWrap}>
        {steps.length > 1 ? (
          <View style={styles.connectorsRow}>
            <View style={styles.connectorSideSpacer} />
            {steps.slice(0, -1).map((_, index) => (
              <View key={`connector_${index}`} style={styles.connectorSegment}>
                <View
                  style={[
                    styles.connectorSegmentInner,
                    index < currentStep ? styles.connectorSegmentActive : null,
                  ]}
                />
              </View>
            ))}
            <View style={styles.connectorSideSpacer} />
          </View>
        ) : null}

        <View style={styles.circlesRow}>
          {steps.map((_, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const isFuture = index > currentStep;

            return (
              <View key={`circle_${index}`} style={styles.circleCell}>
                <View
                  style={[
                    styles.circle,
                    isCompleted && styles.circleCompleted,
                    isCurrent && styles.circleCurrent,
                    isFuture && styles.circleFuture,
                  ]}
                >
                  <Text
                    style={[
                      (isCompleted || isCurrent) && styles.circleTextActive,
                      isFuture && styles.circleTextFuture,
                    ]}
                    variant={compact ? 'bodySmTightSemiBold' : 'labelMd'}
                  >
                    {isCompleted && showCompletedCheckmark ? '✓' : `${index + 1}`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.labelsRow}>
        {steps.map((step, index) => {
          const isCurrent = index === currentStep;
          return (
            <View key={`label_${index}`} style={styles.labelCell}>
              <Text
                tone={isCurrent ? undefined : 'muted'}
                variant={compact ? 'captionMedium' : 'bodySm'}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
