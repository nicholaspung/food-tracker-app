import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import { requestUserPasswordReset } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  formatAuthRateLimitActionLabel,
  formatAuthRateLimitCountdown,
  formatAuthRateLimitMessage,
  isAuthRateLimitError,
  recordAuthRateLimitCooldown,
  recordAuthRateLimitFailure,
} from '../lib/authRateLimiter';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ForgotPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;
const PASSWORD_RESET_EMAIL_COOLDOWN_MS = 60_000;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  cooldownText: {
    color: theme.colors.text.muted,
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
  const hasResetRequestCooldown = resetRequestRateLimitDecision.remainingMs > 0;
  const resetRequestCountdown = hasResetRequestCooldown
    ? formatAuthRateLimitCountdown(resetRequestRateLimitDecision.remainingMs)
    : '';
  const submitLabel = isResetRequestRateLimited
    ? formatAuthRateLimitActionLabel('Try Again', resetRequestRateLimitDecision.remainingMs)
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
      setErrorMessage(formatAuthRateLimitMessage('Too many password reset requests', rateLimitDecision.remainingMs));
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
      const nextDecision = await recordAuthRateLimitCooldown(
        'password_reset_request',
        trimmedEmail,
        PASSWORD_RESET_EMAIL_COOLDOWN_MS,
      );
      await recordAuthRateLimitCooldown(
        'password_reset_resend',
        trimmedEmail,
        PASSWORD_RESET_EMAIL_COOLDOWN_MS,
      );
      setResetRequestRateLimitDecision(nextDecision);
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
        ? await recordAuthRateLimitCooldown(
            'password_reset_request',
            trimmedEmail,
            PASSWORD_RESET_EMAIL_COOLDOWN_MS,
          )
        : await recordAuthRateLimitFailure('password_reset_request', trimmedEmail);
      if (isAuthRateLimitError(error)) {
        await recordAuthRateLimitCooldown(
          'password_reset_resend',
          trimmedEmail,
          PASSWORD_RESET_EMAIL_COOLDOWN_MS,
        );
      }
      setResetRequestRateLimitDecision(nextDecision);
      setErrorMessage(
        nextDecision.allowed
          ? message
          : formatAuthRateLimitMessage('Too many password reset requests', nextDecision.remainingMs),
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

          {hasResetRequestCooldown ? (
            <Text style={styles.cooldownText} variant="bodySm">
              You can request another reset email in {resetRequestCountdown}.
            </Text>
          ) : null}
        </Card>

      </FormScaffold>
      <LoadingOverlay label="Sending..." visible={isSubmitting} />
    </Screen>
  );
}
