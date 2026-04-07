import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

type CurrentLocationButtonVariant = 'icon' | 'inline';

interface CurrentLocationButtonProps {
  onPress: () => void;
  variant?: CurrentLocationButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  captured?: boolean;
  label?: string;
  loadingLabel?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme) => ({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  buttonIcon: {
    height: theme.sizes.inputMinHeight,
    minHeight: theme.sizes.inputMinHeight,
    width: theme.sizes.inputMinHeight,
  },
  buttonInline: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    minHeight: theme.sizes.inputMinHeight,
    minWidth: 108,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 0,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
}));

export function CurrentLocationButton({
  onPress,
  variant = 'inline',
  loading = false,
  disabled = false,
  captured = false,
  label = 'Use GPS',
  loadingLabel = 'Locating...',
  accessibilityLabel = 'Use current location',
  style,
}: CurrentLocationButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const iconColor = captured ? theme.colors.text.success : theme.colors.text.secondary;
  const styles = useStyles();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'icon' ? styles.buttonIcon : styles.buttonInline,
        style,
        pressed && !isDisabled ? { opacity: 0.75 } : null,
        isDisabled ? styles.buttonDisabled : null,
      ]}
    >
      {loading ? <ActivityIndicator color={iconColor} /> : <Ionicons color={iconColor} name="locate-outline" size={16} />}
      {variant === 'inline' ? (
        <Text tone={captured ? 'success' : 'secondary'} variant="bodySm">
          {loading ? loadingLabel : label}
        </Text>
      ) : null}
    </Pressable>
  );
}
