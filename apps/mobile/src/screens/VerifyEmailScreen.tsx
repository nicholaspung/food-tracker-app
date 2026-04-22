import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';

import {
  AuthIntroCard,
  AuthTopBar,
  FormResultBanner,
  FormScaffold,
  LoadingOverlay,
} from '../components/shared';
import {
  confirmUserEmailVerification,
  requestUserEmailVerification,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type VerifyEmailScreenProps = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
}));

function resolveVerificationErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (status === 400) {
      return 'Verification code is incorrect or expired.';
    }
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes('token') ||
      normalized.includes('verify') ||
      normalized.includes('invalid') ||
      normalized.includes('expired')
    ) {
      return 'Verification code is incorrect or expired.';
    }

    return error.message;
  }

  return 'Verification failed.';
}

export function VerifyEmailScreen({ navigation, route }: VerifyEmailScreenProps) {
  const { actualUser, refreshAuthSession, signInWithPassword, signOut, status } = useAuth();
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const pendingEmail =
    route.params?.email?.trim().toLowerCase() ?? actualUser?.email?.trim().toLowerCase() ?? '';
  const pendingPassword = route.params?.password ?? '';
  const hasRetainedSession = Boolean(actualUser);
  const shouldAutoSignIn = !hasRetainedSession && Boolean(pendingEmail && pendingPassword);
  const source = route.params?.source;
  const isExpiredEntry = status === 'verification_required' || source === 'expired_entry';
  const styles = useStyles();

  const subtitle = pendingEmail
    ? `Use the link sent to ${pendingEmail}, or paste the verification token below.`
    : 'Use the link in your email, or paste the verification token below.';

  const modeBanner = useMemo(() => {
    if (isExpiredEntry) {
      return (
        <FormResultBanner
          message="Your 3-day verification window has ended. Verify your email to keep using the app."
          tone="warning"
        />
      );
    }

    if (hasRetainedSession) {
      return (
        <FormResultBanner
          message="You can keep using the app for now, but you must verify your email within 3 days of signup."
          tone="info"
        />
      );
    }

    return null;
  }, [hasRetainedSession, isExpiredEntry]);

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

      if (hasRetainedSession) {
        try {
          await refreshAuthSession();
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          });
          return;
        } catch (refreshError) {
          trackObservabilityEvent('AUTH_EMAIL_VERIFY_REFRESH_FAILED', {
            source: 'VerifyEmailScreen',
            errorMessage: refreshError instanceof Error ? refreshError.message : String(refreshError),
          });
        }
      }

      if (shouldAutoSignIn) {
        try {
          await signInWithPassword(pendingEmail, pendingPassword);
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          });
          return;
        } catch (autoSignInError) {
          trackObservabilityEvent('AUTH_EMAIL_VERIFY_AUTO_SIGNIN_FAILED', {
            source: 'VerifyEmailScreen',
            errorMessage: autoSignInError instanceof Error ? autoSignInError.message : String(autoSignInError),
          });
          setSuccessMessage('Email verified successfully. Please sign in to continue.');
          return;
        }
      }

      setSuccessMessage(
        hasRetainedSession
          ? 'Email verified successfully. If access does not resume immediately, sign in again.'
          : 'Email verified successfully. You can now sign in.',
      );
    } catch (error) {
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_SUBMIT_FAILED', {
        source: 'VerifyEmailScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = resolveVerificationErrorMessage(error);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    if (!pendingEmail) {
      setErrorMessage('Email address is required to resend verification.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsResending(true);
    trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_STARTED', {
      source: 'VerifyEmailScreen',
    });

    try {
      await requestUserEmailVerification(pendingEmail);
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_SUCCEEDED', {
        source: 'VerifyEmailScreen',
      });
      setSuccessMessage('Verification email sent. You can use the link in your inbox or paste the token here.');
    } catch (error) {
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_FAILED', {
        source: 'VerifyEmailScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(resolveVerificationErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  const handleSecondaryAction = async () => {
    trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
      source: 'VerifyEmailScreen',
      destination:
        hasRetainedSession && !isExpiredEntry
          ? 'Previous'
          : hasRetainedSession
            ? 'Onboarding'
            : 'Onboarding',
    });

    if (hasRetainedSession && !isExpiredEntry && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (!hasRetainedSession && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    try {
      if (hasRetainedSession) {
        await signOut();
      }
    } finally {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Onboarding' }],
      });
    }
  };

  return (
    <Screen background="app" keyboardAware scroll>
      <FormScaffold
        lead={
          <AuthTopBar
            onBackPress={() => {
              if (hasRetainedSession && isExpiredEntry) {
                void handleSecondaryAction();
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.reset({
                index: 0,
                routes: [{ name: 'Onboarding' }],
              });
            }}
          />
        }
        showHeader={false}
        title=""
        contentStyle={styles.formContent}
      >
        <AuthIntroCard
          description={subtitle}
          iconName="mail-unread-outline"
          title="Verify Email"
        />

        {modeBanner}

        <Card style={styles.formCard}>
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
            label={hasRetainedSession ? 'Verify and Refresh Access' : 'Verify'}
            loading={isSubmitting}
            onPress={() => {
              void handleVerify();
            }}
          />

          <Button
            disabled={!pendingEmail}
            label="Resend Verification Email"
            loading={isResending}
            onPress={() => {
              void handleResendVerificationEmail();
            }}
            variant="secondary"
          />

          <Button
            label={
              hasRetainedSession
                ? isExpiredEntry
                  ? 'Sign Out'
                  : 'Back'
                : 'Cancel Verification'
            }
            onPress={() => {
              void handleSecondaryAction();
            }}
            variant="secondary"
          />
        </Card>
      </FormScaffold>
      <LoadingOverlay
        label={isSubmitting ? 'Verifying email...' : 'Sending verification email...'}
        visible={isSubmitting || isResending}
      />
    </Screen>
  );
}
