import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';
import { StatusPill, type StatusPillTone } from './StatusPill';

export type VisibilityOptionValue = 'private' | 'friends' | 'public';

type VisibilityTone = 'secondary' | 'info' | 'success';

interface VisibilityOptionMeta {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: VisibilityTone;
}

interface VisibilityOptionSelectorProps {
  value: VisibilityOptionValue;
  onChange: (value: VisibilityOptionValue) => void;
  options?: readonly VisibilityOptionValue[];
  disabled?: boolean;
  communityLabel?: string;
  labelOverrides?: Partial<Record<VisibilityOptionValue, string>>;
  optionDescriptions?: Partial<Record<VisibilityOptionValue, string>>;
  optionBadgeLabels?: Partial<Record<VisibilityOptionValue, string>>;
  optionBadgeTones?: Partial<Record<VisibilityOptionValue, StatusPillTone>>;
  variant?: 'segmented' | 'cards';
  containerStyle?: StyleProp<ViewStyle>;
}

export function getVisibilityOptionMeta(
  value: VisibilityOptionValue,
  communityLabel = 'Community',
  labelOverrides?: Partial<Record<VisibilityOptionValue, string>>,
): VisibilityOptionMeta {
  if (value === 'private') {
    return {
      icon: 'lock-closed-outline',
      label: labelOverrides?.private ?? 'Private',
      tone: 'secondary',
    };
  }

  if (value === 'public') {
    return {
      icon: 'earth-outline',
      label: labelOverrides?.public ?? communityLabel,
      tone: 'success',
    };
  }

  return {
    icon: 'people-outline',
    label: labelOverrides?.friends ?? 'Friends',
    tone: 'info',
  };
}

const DEFAULT_OPTIONS: VisibilityOptionValue[] = ['private', 'friends', 'public'];

export function VisibilityOptionSelector({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
  communityLabel,
  labelOverrides,
  optionDescriptions,
  optionBadgeLabels,
  optionBadgeTones,
  variant = 'segmented',
  containerStyle,
}: VisibilityOptionSelectorProps) {
  const theme = useTheme();
  const isSegmentedVariant = variant === 'segmented';
  const isCompactLayout = isSegmentedVariant && options.length >= 3;

  const resolveToneTokens = (tone: VisibilityTone) => {
    if (tone === 'info') {
      return {
        activeBackground: theme.colors.status.infoBg,
        activeBorder: theme.colors.status.infoBorder,
        activeText: theme.colors.text.info,
      };
    }

    if (tone === 'success') {
      return {
        activeBackground: theme.colors.status.successBg,
        activeBorder: theme.colors.status.successBorder,
        activeText: theme.colors.text.success,
      };
    }

    return {
      activeBackground: theme.colors.background.surface,
      activeBorder: theme.colors.border.strong,
      activeText: theme.colors.text.primary,
    };
  };

  const styles = StyleSheet.create({
    containerSegmented: {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.default,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      padding: 4,
    },
    containerCards: {
      gap: theme.spacing.xs,
    },
    disabled: {
      opacity: 0.55,
    },
    segmentedOption: {
      alignItems: 'center',
      borderRadius: 9,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: isCompactLayout ? 4 : 6,
      justifyContent: 'center',
      minHeight: 38,
      minWidth: 0,
      paddingHorizontal: isCompactLayout ? theme.spacing.xxs : theme.spacing.xs,
      paddingVertical: 7,
    },
    segmentedOptionInactive: {
      borderColor: 'transparent',
    },
    segmentedOptionActiveBase: {
      shadowColor: theme.colors.background.inverse,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 1,
    },
    segmentedOptionLabel: {
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
      flexShrink: 1,
      minWidth: 0,
    },
    segmentedOptionLabelCompact: {
      fontSize: 12,
      lineHeight: 16,
    },
    segmentedOptionLabelActive: {
      fontWeight: '700',
    },
    segmentedOptionLabelInactive: {
      color: theme.colors.text.secondary,
    },
    cardOption: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 2,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    cardOptionPressed: {
      backgroundColor: theme.colors.background.muted,
    },
    cardRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    cardRadioOuter: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 2,
      height: 20,
      justifyContent: 'center',
      marginTop: 2,
      width: 20,
    },
    cardRadioOuterSelected: {
      backgroundColor: theme.colors.text.brand,
      borderColor: theme.colors.text.brand,
    },
    cardRadioInner: {
      backgroundColor: theme.colors.text.inverse,
      borderRadius: theme.radii.pill,
      height: 8,
      width: 8,
    },
    cardContent: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    cardTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    cardLabel: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    cardDescription: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
  });

  return (
    <View
      style={[
        isSegmentedVariant ? styles.containerSegmented : styles.containerCards,
        containerStyle,
        disabled ? styles.disabled : null,
      ]}
    >
      {options.map((option) => {
        const isActive = option === value;
        const optionMeta = getVisibilityOptionMeta(option, communityLabel, labelOverrides);
        const toneTokens = resolveToneTokens(optionMeta.tone);
        const optionTextColor = isActive ? toneTokens.activeText : theme.colors.text.secondary;
        const optionIconColor = isActive ? toneTokens.activeText : theme.colors.text.muted;
        const optionDescription = optionDescriptions?.[option];
        const optionBadgeLabel = optionBadgeLabels?.[option];
        const optionBadgeTone = optionBadgeTones?.[option] ?? 'info';

        if (isSegmentedVariant) {
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: isActive }}
              disabled={disabled}
              key={option}
              onPress={() => {
                onChange(option);
              }}
              style={({ pressed }) => [
                styles.segmentedOption,
                isActive
                  ? [
                      styles.segmentedOptionActiveBase,
                      { backgroundColor: toneTokens.activeBackground, borderColor: toneTokens.activeBorder },
                    ]
                  : styles.segmentedOptionInactive,
                pressed && !disabled ? { opacity: 0.75 } : null,
              ]}
            >
              <Ionicons color={optionIconColor} name={optionMeta.icon} size={13} />
              <Text
                style={[
                  styles.segmentedOptionLabel,
                  isCompactLayout ? styles.segmentedOptionLabelCompact : null,
                  isActive ? styles.segmentedOptionLabelActive : styles.segmentedOptionLabelInactive,
                  { color: optionTextColor },
                ]}
                ellipsizeMode="tail"
                numberOfLines={1}
              >
                {optionMeta.label}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: isActive }}
            disabled={disabled}
            key={option}
            onPress={() => {
              onChange(option);
            }}
            style={({ pressed }) => [
              styles.cardOption,
              isActive ? { backgroundColor: toneTokens.activeBackground, borderColor: toneTokens.activeBorder } : null,
              pressed && !disabled ? styles.cardOptionPressed : null,
            ]}
          >
            <View style={styles.cardRow}>
              <View style={[styles.cardRadioOuter, isActive ? styles.cardRadioOuterSelected : null]}>
                {isActive ? <View style={styles.cardRadioInner} /> : null}
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Ionicons color={optionIconColor} name={optionMeta.icon} size={16} />
                  <Text style={styles.cardLabel}>{optionMeta.label}</Text>
                  {optionBadgeLabel ? (
                    <StatusPill label={optionBadgeLabel} tone={optionBadgeTone} uppercase variant="soft" />
                  ) : null}
                </View>
                {optionDescription ? <Text style={styles.cardDescription}>{optionDescription}</Text> : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
