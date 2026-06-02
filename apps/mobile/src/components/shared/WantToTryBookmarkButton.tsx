import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Ionicons } from '../../ui/AppIcon';
import { useTheme } from '../../theme';

interface WantToTryBookmarkButtonProps {
  accessibilityLabel: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  saved: boolean;
  testID?: string;
}

export function WantToTryBookmarkButton({
  accessibilityLabel,
  disabled = false,
  loading = false,
  onPress,
  saved,
  testID,
}: WantToTryBookmarkButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading || saved;
  const iconColor = saved ? theme.colors.text.warning : theme.colors.text.secondary;

  const styles = StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: saved ? theme.colors.status.warningBg : theme.colors.background.surface,
      borderColor: saved ? theme.colors.status.warningBorder : theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    disabled: {
      opacity: 0.72,
    },
    pressed: {
      backgroundColor: theme.colors.background.muted,
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
        <ActivityIndicator color={iconColor} />
      ) : (
        <Ionicons color={iconColor} name={saved ? 'bookmark' : 'bookmark-outline'} size={19} />
      )}
    </Pressable>
  );
}
