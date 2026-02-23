import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AuthTopBar, FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { confirmUserPasswordReset } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ResetPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation, route }: ResetPasswordScreenProps) {
  const theme = useTheme();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const resetEmail = route.params?.email?.trim().toLowerCase() ?? '';

  const styles = StyleSheet.create({
    formContent: {
      paddingTop: theme.spacing.sm,
    },
    introCard: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    introVisual: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 64,
    },
    introIconFrame: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 60,
      justifyContent: 'center',
      width: 60,
    },
    formCard: {
      gap: theme.spacing.sm,
    },
    helperText: {
      marginBottom: theme.spacing.xs,
    },
  });

  const handleSubmit = async () => {
    if (!token.trim() || !password) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_VALIDATION_FAILED', {
        source: 'ResetPasswordScreen',
        reason: 'missing_token_or_password',
      });
      setErrorMessage('Token and password are required.');
      return;
    }

    if (password !== passwordConfirm) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_VALIDATION_FAILED', {
        source: 'ResetPasswordScreen',
        reason: 'password_mismatch',
      });
      setErrorMessage('Passwords do not match.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_STARTED', {
      source: 'ResetPasswordScreen',
      tokenLength: token.trim().length,
    });

    try {
      await confirmUserPasswordReset(token.trim(), password, passwordConfirm);
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_SUCCEEDED', {
        source: 'ResetPasswordScreen',
      });

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Login',
            params: resetEmail ? { email: resetEmail } : undefined,
          },
        ],
      });
    } catch (error) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_FAILED', {
        source: 'ResetPasswordScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = resolveResetErrorMessage(error);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveResetErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 400) {
        return 'Reset token is incorrect or expired.';
      }
    }

    if (error instanceof Error) {
      const normalized = error.message.toLowerCase();
      if (normalized.includes('token') || normalized.includes('invalid') || normalized.includes('expired')) {
        return 'Reset token is incorrect or expired.';
      }
      return error.message;
    }

    return 'Reset failed.';
  };

  return (
    <Screen background="app" keyboardAware scroll>
      <FormScaffold
        lead={
          <AuthTopBar
            onBackPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate('ForgotPassword');
            }}
          />
        }
        showHeader={false}
        title=""
        contentStyle={styles.formContent}
      >
        <Card style={styles.introCard} tone="muted">
          <View style={styles.introVisual}>
            <View style={styles.introIconFrame}>
              <Ionicons color={theme.colors.text.brand} name="lock-open-outline" size={28} />
            </View>
          </View>
          <Text variant="titleMd">Reset Password</Text>
          <Text tone="secondary">Enter your reset token and choose a new password.</Text>
        </Card>

        <Card style={styles.formCard}>
          {resetEmail ? (
            <Text style={styles.helperText} tone="muted" variant="bodySm">
              Reset for: {resetEmail}
            </Text>
          ) : null}

          <Input
            autoCapitalize="none"
            autoCorrect={false}
            label="Reset Token"
            onChangeText={setToken}
            placeholder="Paste token"
            value={token}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            label="New Password"
            onChangeText={setPassword}
            placeholder="New password"
            secureTextEntry
            value={password}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            label="Confirm Password"
            onChangeText={setPasswordConfirm}
            placeholder="Confirm password"
            secureTextEntry
            value={passwordConfirm}
          />

          <PageErrorToast errorMessage={errorMessage} title="Reset failed" />

          {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

          <Button
            disabled={!token.trim() || !password || !passwordConfirm}
            label="Set New Password"
            loading={isSubmitting}
            onPress={() => {
              void handleSubmit();
            }}
          />
        </Card>
      </FormScaffold>
      <LoadingOverlay label="Resetting password..." visible={isSubmitting} />
    </Screen>
  );
}
