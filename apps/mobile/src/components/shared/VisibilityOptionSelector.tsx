import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { StatusPill, type StatusPillTone } from './StatusPill';

export type VisibilityOptionValue = 'private' | 'friends' | 'public';
export type VisibilityLabelPreset = 'default' | 'personal';

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
  labelPreset?: VisibilityLabelPreset;
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
  labelPreset: VisibilityLabelPreset = 'default',
): VisibilityOptionMeta {
  if (value === 'private') {
    return {
      icon: 'lock-closed-outline',
      label: labelOverrides?.private ?? (labelPreset === 'personal' ? 'Only me' : 'Private'),
      tone: 'secondary',
    };
  }

  if (value === 'public') {
    return {
      icon: 'earth-outline',
      label: labelOverrides?.public ?? (labelPreset === 'personal' ? 'Everyone' : communityLabel),
      tone: 'success',
    };
  }

  return {
    icon: 'people-outline',
    label: labelOverrides?.friends ?? (labelPreset === 'personal' ? 'Friends only' : 'Friends'),
    tone: 'info',
  };
}

const DEFAULT_OPTIONS: VisibilityOptionValue[] = ['private', 'friends', 'public'];

const useStyles = createThemedStyles((
  theme,
  isPersonalSegmentedLayout: boolean,
  isCompactLayout: boolean,
) => ({
  containerSegmented: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.default,
    borderRadius: isPersonalSegmentedLayout ? theme.radii.lg + theme.spacing.xxs : 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: isPersonalSegmentedLayout ? theme.spacing.xxs : 4,
    padding: isPersonalSegmentedLayout ? theme.spacing.xxs : 4,
  },
  containerCards: {
    gap: theme.spacing.xs,
  },
  disabled: {
    opacity: 0.55,
  },
  segmentedOption: {
    alignItems: 'center',
    borderRadius: isPersonalSegmentedLayout ? theme.radii.lg : 9,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: isPersonalSegmentedLayout ? 6 : isCompactLayout ? 4 : 6,
    justifyContent: 'center',
    minHeight: isPersonalSegmentedLayout ? 46 : 38,
    minWidth: 0,
    paddingHorizontal: isPersonalSegmentedLayout
      ? theme.spacing.sm
      : isCompactLayout
        ? theme.spacing.xxs
        : theme.spacing.xs,
    paddingVertical: isPersonalSegmentedLayout ? theme.spacing.xs : 7,
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
    flexShrink: 1,
    minWidth: 0,
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
    backgroundColor: theme.colors.fill.brand,
    borderColor: theme.colors.fill.brand,
  },
  cardRadioInner: {
    backgroundColor: theme.colors.background.surface,
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
  },
  cardDescription: {
    color: theme.colors.text.secondary,
  },
}));

export function VisibilityOptionSelector({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
  communityLabel,
  labelPreset,
  labelOverrides,
  optionDescriptions,
  optionBadgeLabels,
  optionBadgeTones,
  variant = 'segmented',
  containerStyle,
}: VisibilityOptionSelectorProps) {
  const theme = useTheme();
  const isSegmentedVariant = variant === 'segmented';
  const isPersonalSegmentedLayout = isSegmentedVariant && options.length === 2;
  const isCompactLayout = isSegmentedVariant && options.length >= 3;
  const resolvedLabelPreset = labelPreset ?? (isPersonalSegmentedLayout ? 'personal' : 'default');
  const styles = useStyles(isPersonalSegmentedLayout, isCompactLayout);

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
        const optionMeta = getVisibilityOptionMeta(option, communityLabel, labelOverrides, resolvedLabelPreset);
        const toneTokens = resolveToneTokens(optionMeta.tone);
        const optionTextColor =
          isSegmentedVariant && isPersonalSegmentedLayout
            ? isActive
              ? theme.colors.text.info
              : theme.colors.text.secondary
            : isActive
              ? toneTokens.activeText
              : theme.colors.text.secondary;
        const optionIconColor =
          isSegmentedVariant && isPersonalSegmentedLayout
            ? optionTextColor
            : isActive
              ? toneTokens.activeText
              : theme.colors.text.muted;
        const optionDescription = optionDescriptions?.[option];
        const optionBadgeLabel = optionBadgeLabels?.[option];
        const optionBadgeTone = optionBadgeTones?.[option] ?? 'info';
        const segmentedLabelVariant = isCompactLayout
          ? isActive
            ? 'bodySmTightBold'
            : 'bodySmTightSemiBold'
          : isPersonalSegmentedLayout
            ? isActive
              ? 'labelMdBold'
              : 'labelMd'
            : isActive
              ? 'labelStrong'
              : 'label';

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
                      {
                        backgroundColor: isPersonalSegmentedLayout
                          ? theme.colors.status.infoBg
                          : toneTokens.activeBackground,
                        borderColor: isPersonalSegmentedLayout
                          ? theme.colors.border.info
                          : toneTokens.activeBorder,
                      },
                    ]
                  : styles.segmentedOptionInactive,
                pressed && !disabled ? { opacity: 0.75 } : null,
              ]}
            >
              <Ionicons color={optionIconColor} name={optionMeta.icon} size={isPersonalSegmentedLayout ? 16 : 13} />
              <Text
                style={[
                  styles.segmentedOptionLabel,
                  { color: optionTextColor },
                ]}
                ellipsizeMode="tail"
                numberOfLines={1}
                variant={segmentedLabelVariant}
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
                  <Text style={styles.cardLabel} variant="titleXs">
                    {optionMeta.label}
                  </Text>
                  {optionBadgeLabel ? (
                    <StatusPill label={optionBadgeLabel} tone={optionBadgeTone} uppercase variant="soft" />
                  ) : null}
                </View>
                {optionDescription ? (
                  <Text style={styles.cardDescription} variant="metaRegular">
                    {optionDescription}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
