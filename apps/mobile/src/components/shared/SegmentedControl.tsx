import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';
import { StatusPill } from './StatusPill';

type SegmentedControlBadgeTone = 'default' | 'alert';

export interface SegmentedControlOption<T extends string> {
  label: string;
  value: T;
  badgeCount?: number;
  badgeTone?: SegmentedControlBadgeTone;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  getOptionTestID?: (value: T, index: number) => string | undefined;
  getOptionAccessibilityLabel?: (value: T, index: number) => string | undefined;
  fill?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  segmentStyle?: StyleProp<ViewStyle>;
  activeSegmentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  activeLabelStyle?: StyleProp<TextStyle>;
  badgeStyle?: StyleProp<ViewStyle>;
}

function renderBadge(count: number, tone: SegmentedControlBadgeTone, style?: StyleProp<ViewStyle>) {
  const badgeLabel = count > 9 ? '9+' : count;

  return (
    <StatusPill
      label={badgeLabel}
      style={style}
      tone={tone === 'alert' ? 'danger' : 'muted'}
      variant={tone === 'alert' ? 'solid' : 'soft'}
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  getOptionTestID,
  getOptionAccessibilityLabel,
  fill = true,
  containerStyle,
  segmentStyle,
  activeSegmentStyle,
  labelStyle,
  activeLabelStyle,
  badgeStyle,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.background.app,
      borderColor: theme.colors.border.default,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      padding: 2,
    },
    segment: {
      alignItems: 'center',
      borderRadius: 9,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 7,
    },
    segmentFill: {
      flex: 1,
    },
    segmentActive: {
      backgroundColor: theme.colors.background.surface,
      shadowColor: theme.colors.background.inverse,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 1,
    },
    label: {
      color: theme.colors.text.muted,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
      flexShrink: 1,
      textAlign: 'center',
    },
    labelActive: {
      color: theme.colors.text.primary,
    },
    badge: {
      marginLeft: 6,
    },
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {options.map((option, index) => {
        const isActive = option.value === value;
        const badgeCount = option.badgeCount ?? 0;

        return (
          <Pressable
            accessible
            accessibilityLabel={getOptionAccessibilityLabel?.(option.value, index)}
            accessibilityRole="button"
            key={option.value}
            onPress={() => {
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              fill && styles.segmentFill,
              segmentStyle,
              isActive ? [styles.segmentActive, activeSegmentStyle] : null,
              pressed && !isActive ? { opacity: 0.75 } : null,
            ]}
            testID={getOptionTestID?.(option.value, index)}
          >
            <Text style={[styles.label, labelStyle, isActive ? [styles.labelActive, activeLabelStyle] : null]}>
              {option.label}
            </Text>
            {badgeCount > 0 ? renderBadge(badgeCount, option.badgeTone ?? 'default', [styles.badge, badgeStyle]) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
