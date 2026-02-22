import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { confirmUserEmailVerification } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { Button, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type VerifyEmailScreenProps = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

export function VerifyEmailScreen({ navigation }: VerifyEmailScreenProps) {
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleVerify = async () => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_VALIDATION_FAILED', {
        source: 'VerifyEmailScreen',
        reason: 'missing_token',
      });
      setErrorMessage('Verification token is required.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    trackObservabilityEvent('AUTH_EMAIL_VERIFY_SUBMIT_STARTED', {
      source: 'VerifyEmailScreen',
      tokenLength: trimmedToken.length,
    });

    try {
      await confirmUserEmailVerification(trimmedToken);
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_SUBMIT_SUCCEEDED', {
        source: 'VerifyEmailScreen',
      });
      setSuccessMessage('Email verified successfully.');
    } catch (error) {
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_SUBMIT_FAILED', {
        source: 'VerifyEmailScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : 'Verification failed.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen background="surface" keyboardAware>
      <FormScaffold subtitle="Paste the verification token sent by email." title="Verify Email">
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="Verification Token"
          onChangeText={setToken}
          placeholder="Enter token"
          value={token}
        />

        <PageErrorToast errorMessage={errorMessage} title="Verification failed" />

        {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

        <Button
          disabled={!token.trim()}
          label="Verify"
          loading={isSubmitting}
          onPress={() => {
            void handleVerify();
          }}
        />

        <Button
          label="Go to Login"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'VerifyEmailScreen',
              destination: 'Login',
            });
            navigation.navigate('Login');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Verifying email..." visible={isSubmitting} />
    </Screen>
  );
}
