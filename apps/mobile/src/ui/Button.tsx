import { ActivityIndicator, Pressable } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles, useTheme } from '../theme';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps extends Pick<PressableProps, 'accessibilityLabel' | 'testID'> {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme, variant: ButtonVariant) => ({
  button: {
    minHeight: variant === 'primary' ? theme.sizes.buttonHeight : theme.sizes.secondaryButtonHeight,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderWidth: variant === 'secondary' ? 1 : 0,
    borderColor: variant === 'secondary' ? theme.colors.button.secondaryBorder : 'transparent',
    backgroundColor: variant === 'primary' ? theme.colors.button.primaryBg : theme.colors.button.secondaryBg,
  },
  pressed: {
    backgroundColor: variant === 'primary' ? theme.colors.button.primaryPressed : theme.colors.button.secondaryPressed,
  },
  disabled: {
    backgroundColor:
      variant === 'primary' ? theme.colors.button.primaryDisabledBg : theme.colors.button.secondaryDisabledBg,
    borderColor: variant === 'secondary' ? theme.colors.border.subtle : 'transparent',
    opacity: 0.9,
  },
}));

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const styles = useStyles(variant);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? theme.colors.button.primaryText : theme.colors.button.secondaryText}
        />
      ) : (
        <Text
          tone={variant === 'primary' ? 'inverse' : 'primary'}
          variant="button"
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
