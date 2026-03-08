import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { useKeyboardAwareScroll } from './KeyboardAwareScrollContext';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function Input({
  label,
  helperText,
  errorText,
  containerStyle,
  inputStyle,
  onBlur,
  onFocus,
  ...props
}: InputProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const { clearFocusedInput, scrollToFocusedInput } = useKeyboardAwareScroll();
  const [isFocused, setIsFocused] = useState(false);

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.xs,
    },
    input: {
      minHeight: theme.sizes.inputMinHeight,
      borderWidth: 1,
      borderColor: errorText
        ? theme.colors.border.danger
        : isFocused
          ? theme.colors.border.strong
          : theme.colors.border.default,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.background.surface,
      ...theme.typography.bodyLg,
    },
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.colors.text.muted}
        {...props}
        ref={inputRef}
        onBlur={(event) => {
          setIsFocused(false);
          clearFocusedInput(inputRef.current);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setIsFocused(true);
          scrollToFocusedInput(inputRef.current);
          onFocus?.(event);
        }}
        style={[styles.input, inputStyle]}
      />
      {errorText ? <Text tone="danger">{errorText}</Text> : helperText ? <Text tone="muted">{helperText}</Text> : null}
    </View>
  );
}
