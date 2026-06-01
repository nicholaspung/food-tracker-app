import { Ionicons } from './AppIcon';
import { useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';

import { createThemedStyles, useTheme } from '../theme';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  passwordMode?: PasswordInputMode;
  showInlineKeyboardDismissButton?: boolean;
  useDefaultReturnKeyType?: boolean;
}

export type PasswordInputMode = 'current' | 'new' | 'confirm' | 'off';

const INLINE_DISMISS_KEYBOARD_TYPES = new Set<NonNullable<TextInputProps['keyboardType']>>([
  'decimal-pad',
  'number-pad',
  'numeric',
  'phone-pad',
]);

const useStyles = createThemedStyles((theme, hasError: boolean, isFocused: boolean) => ({
  container: {
    gap: theme.spacing.xs,
  },
  inputShell: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: hasError
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
}));

export function Input({
  label,
  helperText,
  errorText,
  containerStyle,
  inputStyle,
  passwordMode,
  showInlineKeyboardDismissButton = true,
  useDefaultReturnKeyType = true,
  onBlur,
  onFocus,
  ...props
}: InputProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isMultiline = props.multiline === true;
  const isNumericInput = INLINE_DISMISS_KEYBOARD_TYPES.has(props.keyboardType ?? 'default');
  const shouldDisableAutofill = isNumericInput;
  const passwordProps = resolvePasswordInputProps(passwordMode);
  const resolvedAutoComplete =
    passwordProps.autoComplete ?? props.autoComplete ?? (shouldDisableAutofill ? 'off' : undefined);
  const resolvedImportantForAutofill =
    passwordProps.importantForAutofill ??
    props.importantForAutofill ??
    (shouldDisableAutofill ? 'no' : undefined);
  const resolvedTextContentType =
    passwordProps.textContentType ??
    props.textContentType ??
    (Platform.OS === 'ios' && shouldDisableAutofill ? 'none' : undefined);
  const resolvedPasswordRules = passwordProps.passwordRules ?? props.passwordRules;
  const resolvedReturnKeyType =
    props.returnKeyType ?? (useDefaultReturnKeyType && !isMultiline ? 'done' : undefined);
  const shouldShowInlineDismissButton =
    Platform.OS === 'ios' &&
    isFocused &&
    !isMultiline &&
    props.editable !== false &&
    isNumericInput &&
    showInlineKeyboardDismissButton;
  const styles = useStyles(Boolean(errorText), isFocused);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={[styles.inputShell, isMultiline ? styles.multilineShell : null]}>
        <TextInput
          blurOnSubmit={props.blurOnSubmit ?? !isMultiline}
          placeholderTextColor={theme.colors.text.muted}
          returnKeyType={resolvedReturnKeyType}
          {...props}
          autoComplete={resolvedAutoComplete}
          autoCapitalize={passwordProps.autoCapitalize ?? props.autoCapitalize}
          autoCorrect={passwordProps.autoCorrect ?? props.autoCorrect}
          importantForAutofill={resolvedImportantForAutofill}
          passwordRules={resolvedPasswordRules}
          ref={inputRef}
          secureTextEntry={passwordProps.secureTextEntry ?? props.secureTextEntry}
          spellCheck={passwordProps.spellCheck ?? props.spellCheck}
          textContentType={resolvedTextContentType}
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

function resolvePasswordInputProps(passwordMode: PasswordInputMode | undefined): Partial<TextInputProps> {
  if (!passwordMode) {
    return {};
  }

  const sharedPasswordProps: Partial<TextInputProps> = {
    autoCapitalize: 'none',
    autoCorrect: false,
    secureTextEntry: true,
    spellCheck: false,
  };

  if (Platform.OS === 'ios') {
    switch (passwordMode) {
      case 'current':
        return {
          ...sharedPasswordProps,
          textContentType: 'password',
        };
      case 'new':
        return {
          ...sharedPasswordProps,
          passwordRules: 'minlength: 8;',
          textContentType: 'newPassword',
        };
      case 'confirm':
      case 'off':
        return {
          ...sharedPasswordProps,
          textContentType: 'none',
        };
    }
  }

  switch (passwordMode) {
    case 'current':
      return {
        ...sharedPasswordProps,
        autoComplete: 'current-password',
      };
    case 'new':
      return {
        ...sharedPasswordProps,
        autoComplete: 'new-password',
      };
    case 'confirm':
    case 'off':
      return {
        ...sharedPasswordProps,
        autoComplete: 'off',
        importantForAutofill: 'no',
      };
  }
}
