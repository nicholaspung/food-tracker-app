import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { confirmUserPasswordReset } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { Button, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ResetPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation }: ResetPasswordScreenProps) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      setSuccessMessage('Password reset completed. You can now sign in.');
    } catch (error) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_FAILED', {
        source: 'ResetPasswordScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : 'Reset failed.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen background="surface" keyboardAware scroll>
      <FormScaffold subtitle="Enter your reset token and new password." title="Reset Password">
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

        <Button
          label="Back to Login"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'ResetPasswordScreen',
              destination: 'Login',
            });
            navigation.navigate('Login');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Resetting password..." visible={isSubmitting} />
    </Screen>
  );
}
