import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

const INLINE_DISMISS_KEYBOARD_TYPES = new Set<NonNullable<TextInputProps['keyboardType']>>([
  'decimal-pad',
  'number-pad',
  'numeric',
  'phone-pad',
]);

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
  const [isFocused, setIsFocused] = useState(false);
  const isMultiline = props.multiline === true;
  const shouldShowInlineDismissButton =
    Platform.OS === 'ios' &&
    isFocused &&
    !isMultiline &&
    props.editable !== false &&
    INLINE_DISMISS_KEYBOARD_TYPES.has(props.keyboardType ?? 'default');

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.xs,
    },
    inputShell: {
      alignItems: 'center',
      borderWidth: 1,
      borderColor: errorText
        ? theme.colors.border.danger
        : isFocused
          ? theme.colors.border.strong
          : theme.colors.border.default,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.background.surface,
      flexDirection: 'row',
      minHeight: theme.sizes.inputMinHeight,
      paddingLeft: theme.spacing.md,
      paddingRight: theme.spacing.xs,
    },
    multilineShell: {
      alignItems: 'stretch',
      paddingRight: theme.spacing.md,
    },
    input: {
      color: theme.colors.text.primary,
      flex: 1,
      minHeight: theme.sizes.inputMinHeight,
      paddingVertical: theme.spacing.sm,
      ...theme.typography.bodyLg,
    },
    multilineInput: {
      textAlignVertical: 'top',
    },
    dismissButton: {
      alignItems: 'center',
      borderRadius: theme.radii.pill,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    dismissButtonPressed: {
      backgroundColor: theme.colors.background.muted,
    },
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={[styles.inputShell, isMultiline ? styles.multilineShell : null]}>
        <TextInput
          blurOnSubmit={props.blurOnSubmit ?? !isMultiline}
          placeholderTextColor={theme.colors.text.muted}
          returnKeyType={props.returnKeyType ?? (!isMultiline ? 'done' : undefined)}
          {...props}
          ref={inputRef}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onSubmitEditing={(event) => {
            if (!isMultiline && (props.blurOnSubmit ?? true)) {
              inputRef.current?.blur();
              Keyboard.dismiss();
            }
            props.onSubmitEditing?.(event);
          }}
          style={[styles.input, isMultiline ? styles.multilineInput : null, inputStyle]}
        />
        {shouldShowInlineDismissButton ? (
          <Pressable
            accessibilityLabel="Hide keyboard"
            accessibilityRole="button"
            onPress={() => {
              inputRef.current?.blur();
              Keyboard.dismiss();
            }}
            style={({ pressed }) => [styles.dismissButton, pressed ? styles.dismissButtonPressed : null]}
          >
            <Ionicons color={theme.colors.text.muted} name="chevron-down" size={18} />
          </Pressable>
        ) : null}
      </View>
      {errorText ? <Text tone="danger">{errorText}</Text> : helperText ? <Text tone="muted">{helperText}</Text> : null}
    </View>
  );
}
