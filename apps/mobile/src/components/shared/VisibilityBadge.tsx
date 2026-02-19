import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';
import {
  getVisibilityOptionMeta,
  type VisibilityOptionValue,
} from './VisibilityOptionSelector';

interface VisibilityBadgeProps {
  value: VisibilityOptionValue;
  communityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function VisibilityBadge({
  value,
  communityLabel,
  style,
}: VisibilityBadgeProps) {
  const theme = useTheme();
  const optionMeta = getVisibilityOptionMeta(value, communityLabel);

  const resolveToneColor = () => {
    if (optionMeta.tone === 'info') {
      return theme.colors.text.info;
    }

    if (optionMeta.tone === 'success') {
      return theme.colors.text.success;
    }

    return theme.colors.text.secondary;
  };

  const styles = StyleSheet.create({
    badge: {
      alignItems: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
    },
    privateBadge: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
    },
    friendsBadge: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.status.infoBorder,
    },
    publicBadge: {
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.status.successBorder,
    },
  });

  const badgeStyle =
    value === 'private'
      ? styles.privateBadge
      : value === 'public'
        ? styles.publicBadge
        : styles.friendsBadge;

  return (
    <View style={[styles.badge, badgeStyle, style]}>
      <Ionicons color={resolveToneColor()} name={optionMeta.icon} size={12} />
      <Text tone={optionMeta.tone} variant="bodySm">
        {optionMeta.label}
      </Text>
    </View>
  );
}
