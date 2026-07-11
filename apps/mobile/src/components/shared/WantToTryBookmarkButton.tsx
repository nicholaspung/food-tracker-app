import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Ionicons } from '../../ui/AppIcon';
import { useTheme } from '../../theme';

type WantToTryBookmarkButtonVariant = 'card' | 'compact' | 'inline';

const COMPACT_ACTION_TARGET_SIZE = 44;

interface WantToTryBookmarkButtonProps {
  accessibilityLabel: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  saved: boolean;
  testID?: string;
  variant?: WantToTryBookmarkButtonVariant;
}

export function WantToTryBookmarkButton({
  accessibilityLabel,
  disabled = false,
  loading = false,
  onPress,
  saved,
  testID,
  variant = 'card',
}: WantToTryBookmarkButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const iconColor = saved ? theme.colors.text.warning : theme.colors.text.secondary;
  const buttonSize = variant === 'card' ? 40 : COMPACT_ACTION_TARGET_SIZE;
  const iconSize = variant === 'card' ? 19 : variant === 'compact' ? 16 : 18;
  const borderRadius = variant === 'compact' ? 8 : variant === 'inline' ? theme.radii.sm : theme.radii.md;

  const styles = StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor:
        variant === 'compact'
          ? 'transparent'
          : variant === 'card' && saved
            ? theme.colors.status.warningBg
            : theme.colors.background.surface,
      borderColor:
        variant === 'card' && saved ? theme.colors.status.warningBorder : theme.colors.border.default,
      borderRadius,
      borderWidth: variant === 'inline' ? 0 : 1,
      height: buttonSize,
      justifyContent: 'center',
      width: buttonSize,
    },
    disabled: {
      opacity: 0.72,
    },
    pressed: {
      backgroundColor: variant === 'inline' ? theme.colors.status.infoBg : theme.colors.background.muted,
    },
  });

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected: saved }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <Ionicons color={iconColor} name={saved ? 'bookmark' : 'bookmark-outline'} size={iconSize} />
      )}
    </Pressable>
  );
}
