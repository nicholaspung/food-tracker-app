import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

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
  containerStyle,
}: VisibilityOptionSelectorProps) {
  const theme = useTheme();
  const isCompactLayout = options.length >= 3;

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
    container: {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.default,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      padding: 4,
    },
    disabled: {
      opacity: 0.55,
    },
    option: {
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
    optionInactive: {
      borderColor: 'transparent',
    },
    optionActiveBase: {
      shadowColor: theme.colors.background.inverse,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 1,
    },
    optionLabel: {
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
      flexShrink: 1,
      minWidth: 0,
    },
    optionLabelCompact: {
      fontSize: 12,
      lineHeight: 16,
    },
    optionLabelActive: {
      fontWeight: '700',
    },
    optionLabelInactive: {
      color: theme.colors.text.secondary,
    },
  });

  return (
    <View style={[styles.container, containerStyle, disabled ? styles.disabled : null]}>
      {options.map((option) => {
        const isActive = option === value;
        const optionMeta = getVisibilityOptionMeta(option, communityLabel, labelOverrides);
        const toneTokens = resolveToneTokens(optionMeta.tone);
        const optionTextColor = isActive ? toneTokens.activeText : theme.colors.text.secondary;
        const optionIconColor = isActive ? toneTokens.activeText : theme.colors.text.muted;

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
              styles.option,
              isActive
                ? [
                    styles.optionActiveBase,
                    { backgroundColor: toneTokens.activeBackground, borderColor: toneTokens.activeBorder },
                  ]
                : styles.optionInactive,
              pressed && !disabled ? { opacity: 0.75 } : null,
            ]}
          >
            <Ionicons color={optionIconColor} name={optionMeta.icon} size={13} />
            <Text
              style={[
                styles.optionLabel,
                isCompactLayout ? styles.optionLabelCompact : null,
                isActive ? styles.optionLabelActive : styles.optionLabelInactive,
                { color: optionTextColor },
              ]}
              ellipsizeMode="tail"
              numberOfLines={1}
            >
              {optionMeta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
