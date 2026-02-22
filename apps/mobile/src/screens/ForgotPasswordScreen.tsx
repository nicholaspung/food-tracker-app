import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { requestUserPasswordReset } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { Button, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ForgotPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_VALIDATION_FAILED', {
        source: 'ForgotPasswordScreen',
        reason: 'missing_email',
      });
      setErrorMessage('Email is required.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUBMIT_STARTED', {
      source: 'ForgotPasswordScreen',
      hasEmail: Boolean(trimmedEmail),
    });

    try {
      await requestUserPasswordReset(trimmedEmail);
      trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUBMIT_SUCCEEDED', {
        source: 'ForgotPasswordScreen',
      });
      setSuccessMessage('Reset instructions sent. Enter the token on the reset password screen.');
    } catch (error) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUBMIT_FAILED', {
        source: 'ForgotPasswordScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : 'Could not request reset.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen background="surface" keyboardAware>
      <FormScaffold subtitle="Request a reset token by email." title="Forgot Password">
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />

        <PageErrorToast errorMessage={errorMessage} title="Request failed" />

        {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

        <Button
          disabled={!email.trim()}
          label="Send Reset Email"
          loading={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
        />

        <Button
          label="I have a reset token"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'ForgotPasswordScreen',
              destination: 'ResetPassword',
            });
            navigation.navigate('ResetPassword');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Sending..." visible={isSubmitting} />
    </Screen>
  );
}
