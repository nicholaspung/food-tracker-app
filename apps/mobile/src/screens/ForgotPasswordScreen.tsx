import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import { requestUserPasswordReset } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  isAuthRateLimitError,
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ForgotPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
}));

export function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const {
    decision: resetRequestRateLimitDecision,
    refresh: refreshResetRequestRateLimit,
    setDecision: setResetRequestRateLimitDecision,
  } = useAuthRateLimit('password_reset_request', normalizedEmail);
  const isResetRequestRateLimited = !resetRequestRateLimitDecision.allowed;
  const submitLabel = isResetRequestRateLimited
    ? `Try Again in ${Math.max(1, Math.ceil(resetRequestRateLimitDecision.remainingMs / 1000))}s`
    : 'Send Reset Email';
  const styles = useStyles();

  const handleSubmit = async () => {
    const trimmedEmail = normalizedEmail;
    if (!trimmedEmail) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_VALIDATION_FAILED', {
        source: 'ForgotPasswordScreen',
        reason: 'missing_email',
      });
      setErrorMessage('Email is required.');
      return;
    }

    const rateLimitDecision = await refreshResetRequestRateLimit();
    if (!rateLimitDecision.allowed) {
      setErrorMessage(formatPasswordResetRateLimitMessage(rateLimitDecision.remainingMs));
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUBMIT_STARTED', {
      source: 'ForgotPasswordScreen',
      hasEmail: Boolean(trimmedEmail),
    });

    try {
      await requestUserPasswordReset(trimmedEmail);
      await recordAuthRateLimitSuccess('password_reset_request', trimmedEmail);
      await refreshResetRequestRateLimit();
      trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUBMIT_SUCCEEDED', {
        source: 'ForgotPasswordScreen',
      });
      navigation.navigate('ResetPassword', {
        email: trimmedEmail,
      });
    } catch (error) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUBMIT_FAILED', {
        source: 'ForgotPasswordScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : 'Could not request reset.';
      const nextDecision = isAuthRateLimitError(error)
        ? await recordServerAuthRateLimit('password_reset_request', trimmedEmail)
        : await recordAuthRateLimitFailure('password_reset_request', trimmedEmail);
      setResetRequestRateLimitDecision(nextDecision);
      setErrorMessage(
        nextDecision.allowed ? message : formatPasswordResetRateLimitMessage(nextDecision.remainingMs),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen background="app" keyboardAware scroll testID="forgot-password-screen">
      <FormScaffold
        lead={
          <AuthTopBar
            onBackPress={() => {
              navigation.navigate('Login');
            }}
          />
        }
        showHeader={false}
        title=""
        contentStyle={styles.formContent}
      >
        <AuthIntroCard
          description="Enter your email and we'll send you a secure reset link."
          iconName="mail-open-outline"
          title="Forgot Password"
        />

        <Card style={styles.formCard}>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            testID="forgot-password-email-input"
            value={email}
          />

          <PageErrorToast errorMessage={errorMessage} title="Request failed" />

          <Button
            disabled={!email.trim() || isResetRequestRateLimited}
            label={submitLabel}
            loading={isSubmitting}
            onPress={() => {
              void handleSubmit();
            }}
          />
        </Card>

      </FormScaffold>
      <LoadingOverlay label="Sending..." visible={isSubmitting} />
    </Screen>
  );
}

function formatPasswordResetRateLimitMessage(remainingMs: number): string {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Too many password reset requests. Try again in ${remainingSeconds} seconds.`;
}
