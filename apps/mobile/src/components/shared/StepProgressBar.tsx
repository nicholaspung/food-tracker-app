import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
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

export function StepProgressBar({
    steps,
    currentStep,
    compact = false,
    showCompletedCheckmark = true,
}: StepProgressBarProps) {
    const theme = useTheme();
    const circleSize = compact ? 26 : 34;
    const connectorHeight = compact ? 1 : 2;

    const styles = StyleSheet.create({
        container: {
            gap: compact ? theme.spacing.xxs : theme.spacing.xs,
        },
        trackWrap: {
            position: 'relative',
            minHeight: circleSize,
            justifyContent: 'center',
        },
        connectorsRow: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: circleSize / 2 - 1,
            flexDirection: 'row',
            alignItems: 'center',
        },
        connectorSideSpacer: {
            flex: 0.5,
        },
        connectorSegment: {
            flex: 1,
        },
        connectorSegmentInner: {
            borderRadius: connectorHeight / 2,
            height: connectorHeight,
            backgroundColor: theme.colors.border.default,
        },
        connectorSegmentActive: {
            backgroundColor: theme.colors.button.primaryBg,
        },
        circlesRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        circleCell: {
            flex: 1,
            alignItems: 'center',
        },
        circle: {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
        },
        circleCurrent: {
            backgroundColor: theme.colors.button.primaryBg,
            borderWidth: compact ? 1 : 2,
            borderColor: theme.colors.button.primaryBg + '40',
        },
        circleCompleted: {
            backgroundColor: theme.colors.button.primaryBg,
        },
        circleFuture: {
            backgroundColor: theme.colors.background.muted,
            borderWidth: 1,
            borderColor: theme.colors.border.default,
        },
        circleText: {
            fontSize: compact ? 12 : 14,
            fontWeight: '600',
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
            flex: 1,
            alignItems: 'center',
        },
        labelTextCompact: {
            fontSize: 11,
            lineHeight: 14,
            fontWeight: '500',
        },
    });

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
                                            styles.circleText,
                                            (isCompleted || isCurrent) && styles.circleTextActive,
                                            isFuture && styles.circleTextFuture,
                                        ]}
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
                                style={compact ? styles.labelTextCompact : undefined}
                                tone={isCurrent ? undefined : 'muted'}
                                variant="bodySm"
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
