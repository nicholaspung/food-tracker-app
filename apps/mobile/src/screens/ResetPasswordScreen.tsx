import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { AuthIntroCard, AuthTopBar, FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { confirmUserPasswordReset, requestUserPasswordReset } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  isAuthRateLimitError,
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ResetPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  helperText: {
    marginBottom: theme.spacing.xs,
  },
}));

export function ResetPasswordScreen({ navigation, route }: ResetPasswordScreenProps) {
  const [isResending, setIsResending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [hasConfirmedReset, setHasConfirmedReset] = useState(false);
  const resetEmail = route.params?.email?.trim().toLowerCase() ?? '';
  const resetToken = route.params?.token?.trim() ?? '';
  const isTokenReset = Boolean(resetToken);
  const { isOnline } = useConnectivity();
  const {
    decision: resetConfirmRateLimitDecision,
    refresh: refreshResetConfirmRateLimit,
    setDecision: setResetConfirmRateLimitDecision,
  } = useAuthRateLimit('password_reset_confirm', resetEmail);
  const {
    decision: resetResendRateLimitDecision,
    refresh: refreshResetResendRateLimit,
    setDecision: setResetResendRateLimitDecision,
  } = useAuthRateLimit('password_reset_resend', resetEmail);
  const isResetConfirmRateLimited = !resetConfirmRateLimitDecision.allowed;
  const isResetResendRateLimited = !resetResendRateLimitDecision.allowed;
  const resetConfirmLabel = isResetConfirmRateLimited
    ? `Try Again in ${Math.max(1, Math.ceil(resetConfirmRateLimitDecision.remainingMs / 1000))}s`
    : 'Reset Password';
  const resetResendLabel = isResetResendRateLimited
    ? `Try Again in ${Math.max(1, Math.ceil(resetResendRateLimitDecision.remainingMs / 1000))}s`
    : 'Resend Email';
  const styles = useStyles();

  const navigateToLogin = () => {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Login',
          params: resetEmail ? { email: resetEmail } : undefined,
        },
      ],
    });
  };

  const handleConfirmReset = async () => {
    if (!resetToken) {
      setErrorMessage('This reset link is missing required information. Request a new reset email.');
      return;
    }

    if (!isOnline) {
      setErrorMessage('You need an internet connection to reset your password.');
      return;
    }

    if (password.length < 8) {
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_VALIDATION_FAILED', {
        source: 'ResetPasswordScreen',
        reason: 'password_too_short',
      });
      setErrorMessage('Password must be at least 8 characters.');
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

    const rateLimitDecision = await refreshResetConfirmRateLimit();
    if (!rateLimitDecision.allowed) {
      setErrorMessage(formatResetConfirmRateLimitMessage(rateLimitDecision.remainingMs));
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsConfirming(true);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_STARTED', {
      source: 'ResetPasswordScreen',
    });

    try {
      await confirmUserPasswordReset(resetToken, password, passwordConfirm);
      await recordAuthRateLimitSuccess('password_reset_confirm', resetEmail);
      await refreshResetConfirmRateLimit();
      setPassword('');
      setPasswordConfirm('');
      setHasConfirmedReset(true);
      setSuccessMessage('Your password has been reset. Sign in with your new password.');
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_SUCCEEDED', {
        source: 'ResetPasswordScreen',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? 'This reset link is invalid or expired. Request a new reset email.'
          : 'Could not reset your password. Request a new reset email.';
      const nextDecision = isAuthRateLimitError(error)
        ? await recordServerAuthRateLimit('password_reset_confirm', resetEmail)
        : await recordAuthRateLimitFailure('password_reset_confirm', resetEmail);
      setResetConfirmRateLimitDecision(nextDecision);
      setErrorMessage(
        nextDecision.allowed ? message : formatResetConfirmRateLimitMessage(nextDecision.remainingMs),
      );
      trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUBMIT_FAILED', {
        source: 'ResetPasswordScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (isTokenReset) {
    return (
      <Screen background="app" keyboardAware scroll testID="reset-password-screen">
        <FormScaffold
          lead={
            <AuthTopBar
              onBackPress={() => {
                navigation.navigate('Login', resetEmail ? { email: resetEmail } : undefined);
              }}
            />
          }
          showHeader={false}
          title=""
          contentStyle={styles.formContent}
        >
          <AuthIntroCard
            description="Choose a new password for your Yummy Recs account."
            iconName="lock-closed-outline"
            title="Reset Password"
          />

          <Card style={styles.formCard}>
            <PageErrorToast errorMessage={errorMessage} title="Reset failed" />

            {!isOnline ? (
              <FormResultBanner message="Password reset requires an internet connection." tone="warning" />
            ) : null}

            {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

            {!hasConfirmedReset ? (
              <>
                <Input
                  autoCapitalize="none"
                  autoComplete="new-password"
                  passwordRules="minlength: 8;"
                  label="New Password"
                  onChangeText={setPassword}
                  placeholder="Create a new password"
                  secureTextEntry
                  testID="reset-password-new-password-input"
                  textContentType="newPassword"
                  value={password}
                />
                <Input
                  autoCapitalize="none"
                  label="Confirm Password"
                  onChangeText={setPasswordConfirm}
                  placeholder="Repeat your new password"
                  secureTextEntry
                  testID="reset-password-confirm-password-input"
                  value={passwordConfirm}
                />

                <Button
                  disabled={!isOnline || !password || !passwordConfirm || isResetConfirmRateLimited}
                  label={resetConfirmLabel}
                  loading={isConfirming}
                  onPress={() => {
                    void handleConfirmReset();
                  }}
                />
              </>
            ) : null}

            <Button
              label={hasConfirmedReset ? 'Back to Sign In' : 'Request New Link'}
              onPress={() => {
                if (hasConfirmedReset) {
                  navigateToLogin();
                  return;
                }
                navigation.navigate('ForgotPassword');
              }}
              variant={hasConfirmedReset ? 'primary' : 'secondary'}
            />
          </Card>
        </FormScaffold>
        <LoadingOverlay label="Resetting password..." visible={isConfirming} />
      </Screen>
    );
  }

  const handleResend = async () => {
    if (!resetEmail) {
      setErrorMessage('Email is required to resend the reset link.');
      return;
    }

    if (!isOnline) {
      setErrorMessage('You need an internet connection to resend the reset link.');
      return;
    }

    const rateLimitDecision = await refreshResetResendRateLimit();
    if (!rateLimitDecision.allowed) {
      setErrorMessage(formatResetResendRateLimitMessage(rateLimitDecision.remainingMs));
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsResending(true);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_EMAIL_RESEND_STARTED', {
      source: 'ResetPasswordScreen',
      hasEmail: true,
    });

    try {
      await requestUserPasswordReset(resetEmail);
      await recordAuthRateLimitSuccess('password_reset_resend', resetEmail);
      await refreshResetResendRateLimit();
      setSuccessMessage('Reset email sent again.');
      trackObservabilityEvent('AUTH_PASSWORD_RESET_EMAIL_RESEND_SUCCEEDED', {
        source: 'ResetPasswordScreen',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not resend reset email.';
      const nextDecision = isAuthRateLimitError(error)
        ? await recordServerAuthRateLimit('password_reset_resend', resetEmail)
        : await recordAuthRateLimitFailure('password_reset_resend', resetEmail);
      setResetResendRateLimitDecision(nextDecision);
      setErrorMessage(
        nextDecision.allowed ? message : formatResetResendRateLimitMessage(nextDecision.remainingMs),
      );
      trackObservabilityEvent('AUTH_PASSWORD_RESET_EMAIL_RESEND_FAILED', {
        source: 'ResetPasswordScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsResending(false);
    }
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
              navigation.navigate('Login', resetEmail ? { email: resetEmail } : undefined);
            }}
          />
        }
        showHeader={false}
        title=""
        contentStyle={styles.formContent}
      >
        <AuthIntroCard
          description="We sent a secure reset link. Open the email to choose a new password."
          iconName="mail-open-outline"
          title="Check Your Email"
        />

        <Card style={styles.formCard}>
          {resetEmail ? (
            <Text style={styles.helperText} tone="muted" variant="bodySm">
              Reset link sent to: {resetEmail}
            </Text>
          ) : null}

          <PageErrorToast errorMessage={errorMessage} title="Request failed" />

          {!isOnline ? (
            <FormResultBanner message="Password reset emails require an internet connection." tone="warning" />
          ) : null}

          {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

          <Button
            label="Back to Sign In"
            onPress={navigateToLogin}
          />

          <Button
            disabled={!isOnline || !resetEmail || isResetResendRateLimited}
            label={resetResendLabel}
            loading={isResending}
            onPress={() => {
              void handleResend();
            }}
            variant="secondary"
          />
        </Card>
      </FormScaffold>
      <LoadingOverlay label="Sending..." visible={isResending} />
    </Screen>
  );
}

function formatResetConfirmRateLimitMessage(remainingMs: number): string {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Too many password reset attempts. Try again in ${remainingSeconds} seconds.`;
}

function formatResetResendRateLimitMessage(remainingMs: number): string {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Too many reset email requests. Try again in ${remainingSeconds} seconds.`;
}
