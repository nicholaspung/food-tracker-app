import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBackPress?: () => void;
  rightAccessory?: ReactNode;
  backAccessibilityLabel?: string;
  variant?: 'large' | 'compact';
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  onBackPress,
  rightAccessory,
  backAccessibilityLabel = 'Back',
  variant = 'large',
  style,
  titleStyle,
  subtitleStyle,
  testID,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const isCompact = variant === 'compact';

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.background.surface,
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      gap: isCompact ? theme.spacing.xxs : theme.spacing.xs,
      paddingBottom: isCompact ? theme.spacing.xs : theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingTop: isCompact ? theme.spacing.sm : theme.spacing.md,
    },
    topRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    backButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: isCompact ? 32 : 36,
      justifyContent: 'center',
      width: isCompact ? 32 : 36,
    },
    title: {
      color: theme.colors.text.primary,
      flexShrink: 1,
      fontSize: isCompact ? theme.typography.titleMd.fontSize : 38,
      fontWeight: '700',
      lineHeight: isCompact ? theme.typography.titleMd.lineHeight : 44,
    },
    subtitle: {
      color: theme.colors.text.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    rightAccessory: {
      marginLeft: 'auto',
    },
  });

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.topRow}>
        {onBackPress ? (
          <Pressable
            accessibilityLabel={backAccessibilityLabel}
            accessibilityRole="button"
            onPress={onBackPress}
            style={styles.backButton}
          >
            <Ionicons color={theme.colors.text.primary} name="chevron-back" size={isCompact ? 16 : 18} />
          </Pressable>
        ) : null}
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
    </View>
  );
}
