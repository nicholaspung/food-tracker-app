import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AuthIntroCard,
  ConfirmDestructiveModal,
  AuthTopBar,
  FormResultBanner,
  FormScaffold,
  LoadingOverlay,
} from '../components/shared';
import {
  confirmUserEmailVerification,
  requestUserEmailVerification,
} from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import { useQueuedLogoutConfirmation } from '../hooks/useQueuedLogoutConfirmation';
import {
  formatAuthRateLimitActionLabel,
  formatAuthRateLimitCountdown,
  formatAuthRateLimitMessage,
  isAuthRateLimitError,
  recordAuthRateLimitCooldown,
  recordAuthRateLimitFailure,
} from '../lib/authRateLimiter';
import { decodeAuthActionTokenPayload } from '../lib/authActionToken';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { buildSafeTelemetryErrorProperties } from '../observability/telemetryError';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useAuth } from '../providers/AuthProvider';
import { useFocusedVerificationMonitor } from '../providers/auth/verificationMonitor';
import { createThemedStyles } from '../theme';
import { Button, Card, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type VerifyEmailScreenProps = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  helperText: {
    color: theme.colors.text.secondary,
  },
}));

function resolveVerificationEmailErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (status === 429) {
      return 'Please wait about a minute before requesting another verification email.';
    }
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes('already requested') ||
      normalized.includes('rate') ||
      normalized.includes('too many') ||
      normalized.includes('try again later')
    ) {
      return 'Please wait about a minute before requesting another verification email.';
    }

    return 'Could not send a verification email right now.';
  }

  return 'Could not send a verification email right now.';
}

function isTransientEmailVerificationConfirmError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return false;
  }

  return (error as { status?: unknown }).status === 0;
}

export function VerifyEmailScreen({ navigation, route }: VerifyEmailScreenProps) {
  const {
    actualUser,
    refreshAuthSession,
    status,
    verificationStatus,
  } = useAuth();
  const verificationToken = route.params?.token?.trim() ?? '';
  const tokenPayload = useMemo(() => decodeAuthActionTokenPayload(verificationToken), [verificationToken]);
  const { isOnline } = useConnectivity();
  const isFocused = useIsFocused();
  const [isResending, setIsResending] = useState(false);
  const [tokenConfirmationStatus, setTokenConfirmationStatus] = useState<
    'idle' | 'confirming' | 'succeeded' | 'failed'
  >('idle');
  const [tokenFailureKind, setTokenFailureKind] = useState<'invalid' | 'transient' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const pendingEmail =
    route.params?.email?.trim().toLowerCase() ??
    actualUser?.email?.trim().toLowerCase() ??
    tokenPayload?.email ??
    '';
  const {
    decision: resendRateLimitDecision,
    refresh: refreshResendRateLimit,
    setDecision: setResendRateLimitDecision,
  } = useAuthRateLimit('email_verification_resend', pendingEmail);
  const hasRetainedSession = Boolean(actualUser);
  const source = route.params?.source;
  const isTokenVerification = Boolean(verificationToken);
  const isExpiredEntry = status === 'verification_required' || source === 'expired_entry';
  const styles = useStyles();
  const hasTriggeredInitialSendRef = useRef(false);
  const hasTriggeredTokenConfirmationRef = useRef(false);
  useFocusedVerificationMonitor({
    enabled: hasRetainedSession && !isTokenVerification && verificationStatus !== 'verified',
    isFocused,
    isOnline,
    refreshAuthSession,
  });
  const canResendVerificationEmail =
    isOnline && Boolean(pendingEmail) && resendRateLimitDecision.allowed && !isResending;
  const resendButtonLabel =
    resendRateLimitDecision.remainingMs > 0
      ? formatAuthRateLimitActionLabel('Resend', resendRateLimitDecision.remainingMs)
      : 'Resend Verification Email';
  const resetToOnboarding = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
  }, [navigation]);
  const {
    cancelLabel: logoutCancelLabel,
    cancelLogout,
    confirmLabel: logoutConfirmLabel,
    confirmLoadingLabel: logoutConfirmLoadingLabel,
    confirmLogout,
    description: logoutDescription,
    isConfirmVisible: isLogoutConfirmVisible,
    isLoggingOut,
    requestLogout,
    title: logoutTitle,
  } = useQueuedLogoutConfirmation({
    onLoggedOut: resetToOnboarding,
  });

  const subtitle = pendingEmail
    ? hasRetainedSession
      ? `Tap Verify in the email sent to ${pendingEmail}.`
      : `Tap Verify in the email sent to ${pendingEmail}, then return to sign in.`
    : 'Tap Verify in the verification email to continue.';

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

  const sendVerificationEmail = useCallback(async (trigger: 'screen_open' | 'manual') => {
    if (!pendingEmail) {
      setErrorMessage('Email address is required to resend verification.');
      return false;
    }

    if (!isOnline) {
      setErrorMessage('You need an internet connection to request a verification email.');
      return false;
    }

    const rateLimitDecision = await refreshResendRateLimit();
    if (!rateLimitDecision.allowed) {
      setErrorMessage(null);
      setSuccessMessage(
        `Check ${pendingEmail} for the latest verification email. You can request another one in ${formatAuthRateLimitCountdown(
          rateLimitDecision.remainingMs,
        )}.`,
      );
      return false;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsResending(true);
    trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_STARTED', {
      source: 'VerifyEmailScreen',
      trigger,
    });

    try {
      await requestUserEmailVerification(pendingEmail);
      const nextDecision = await recordAuthRateLimitCooldown(
        'email_verification_resend',
        pendingEmail,
        EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
      );
      setResendRateLimitDecision(nextDecision);
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_SUCCEEDED', {
        source: 'VerifyEmailScreen',
        trigger,
      });
      setSuccessMessage(
        hasRetainedSession
          ? `Verification email sent to ${pendingEmail}.`
          : `Verification email sent to ${pendingEmail}. Return to sign in after verifying.`,
      );
      return true;
    } catch (error) {
      const nextDecision = isAuthRateLimitError(error)
        ? await recordAuthRateLimitCooldown(
            'email_verification_resend',
            pendingEmail,
            EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
          )
        : await recordAuthRateLimitFailure('email_verification_resend', pendingEmail);
      setResendRateLimitDecision(nextDecision);
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_FAILED', {
        source: 'VerifyEmailScreen',
        trigger,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(
        nextDecision.allowed
          ? resolveVerificationEmailErrorMessage(error)
          : formatAuthRateLimitMessage('Too many verification email requests', nextDecision.remainingMs),
      );
      return false;
    } finally {
      setIsResending(false);
    }
  }, [hasRetainedSession, isOnline, pendingEmail, refreshResendRateLimit, setResendRateLimitDecision]);

  useEffect(() => {
    if (
      isTokenVerification ||
      !pendingEmail ||
      hasTriggeredInitialSendRef.current ||
      verificationStatus === 'verified'
    ) {
      return;
    }

    hasTriggeredInitialSendRef.current = true;
    void sendVerificationEmail('screen_open');
  }, [isTokenVerification, pendingEmail, sendVerificationEmail, verificationStatus]);

  const confirmVerificationToken = useCallback(async () => {
    if (!verificationToken || !isOnline) {
      return;
    }

    setTokenConfirmationStatus('confirming');
    setTokenFailureKind(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('AUTH_EMAIL_VERIFY_CONFIRM_STARTED', {
      source: 'VerifyEmailScreen',
    });

    try {
      await confirmUserEmailVerification(verificationToken);
    } catch (error) {
      const isTransientFailure = isTransientEmailVerificationConfirmError(error);
      setTokenConfirmationStatus('failed');
      setTokenFailureKind(isTransientFailure ? 'transient' : 'invalid');
      setErrorMessage(
        isTransientFailure
          ? 'We could not reach the verification server. Check your connection and try again.'
          : 'This verification link is invalid or expired. Request a new verification email.',
      );
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_CONFIRM_FAILED', {
        failureStage: 'confirm',
        source: 'VerifyEmailScreen',
        ...buildSafeTelemetryErrorProperties(error),
      });
      return;
    }

    setTokenConfirmationStatus('succeeded');
    setSuccessMessage(
      hasRetainedSession
        ? 'Your email has been verified. The app will refresh your account status automatically.'
        : 'Your email has been verified. You can sign in now.',
    );
    trackObservabilityEvent('AUTH_EMAIL_VERIFY_CONFIRM_SUCCEEDED', {
      source: 'VerifyEmailScreen',
    });

    if (!hasRetainedSession) {
      return;
    }

    try {
      await refreshAuthSession({ afterCurrent: true });
    } catch (error) {
      setSuccessMessage('Your email has been verified. If the app does not update automatically, close and reopen it.');
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_REFRESH_FAILED', {
        failureStage: 'refresh',
        source: 'VerifyEmailScreen',
        ...buildSafeTelemetryErrorProperties(error),
      });
    }
  }, [hasRetainedSession, isOnline, refreshAuthSession, verificationToken]);

  useEffect(() => {
    if (!verificationToken || !isOnline || hasTriggeredTokenConfirmationRef.current) {
      return;
    }

    hasTriggeredTokenConfirmationRef.current = true;
    void confirmVerificationToken();
  }, [confirmVerificationToken, isOnline, verificationToken]);

  useEffect(() => {
    if (!hasRetainedSession || verificationStatus !== 'verified') {
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [hasRetainedSession, navigation, verificationStatus]);

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

    if (hasRetainedSession) {
      await requestLogout();
      return;
    }

    resetToOnboarding();
  };

  if (isTokenVerification) {
    const isConfirmingToken = tokenConfirmationStatus === 'confirming';
    const isTransientTokenFailure =
      tokenConfirmationStatus === 'failed' && tokenFailureKind === 'transient';
    const canRequestNewVerification =
      tokenConfirmationStatus === 'failed' &&
      tokenFailureKind !== 'transient' &&
      Boolean(pendingEmail) &&
      canResendVerificationEmail &&
      isOnline;
    const tokenDescription = isConfirmingToken
      ? 'We are verifying your email address.'
      : tokenConfirmationStatus === 'succeeded'
        ? 'Your email address has been verified.'
        : tokenConfirmationStatus === 'failed'
          ? isTransientTokenFailure
            ? 'We could not reach the verification server.'
            : 'This verification link could not be completed.'
          : isOnline
            ? 'We are preparing to verify your email address.'
            : 'Connect to the internet to verify your email address.';

    return (
      <Screen background="app" keyboardAware scroll testID="verify-email-token-screen">
        <FormScaffold
          lead={
            <AuthTopBar
              onBackPress={() => {
                if (hasRetainedSession && navigation.canGoBack()) {
                  navigation.goBack();
                  return;
                }

                navigation.reset({
                  index: 0,
                  routes: [{ name: hasRetainedSession ? 'Home' : 'Login' }],
                });
              }}
            />
          }
          showHeader={false}
          title=""
          contentStyle={styles.formContent}
        >
          <AuthIntroCard
            description={tokenDescription}
            iconName="mail-unread-outline"
            title="Verify Email"
          />

          <Card style={styles.formCard}>
            {isConfirmingToken ? <Text style={styles.helperText}>Verifying your email...</Text> : null}

            {!isOnline ? (
              <FormResultBanner message="Email verification requires an internet connection." tone="warning" />
            ) : null}

            <PageErrorToast errorMessage={errorMessage} title="Verification failed" />

            {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

            {isTransientTokenFailure ? (
              <Button
                disabled={!isOnline}
                label="Try Again"
                onPress={() => {
                  void confirmVerificationToken();
                }}
              />
            ) : null}

            {tokenConfirmationStatus === 'failed' && tokenFailureKind !== 'transient' && pendingEmail ? (
              <Button
                disabled={!canRequestNewVerification}
                label={resendButtonLabel}
                loading={isResending}
                onPress={() => {
                  void sendVerificationEmail('manual');
                }}
              />
            ) : null}

            {tokenConfirmationStatus === 'failed' && !pendingEmail ? (
              <Button
                label="Request New Link"
                onPress={() => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                  });
                }}
              />
            ) : null}

            {!isConfirmingToken ? (
              <Button
                label={hasRetainedSession ? 'Back to App' : 'Back to Sign In'}
                onPress={() => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: hasRetainedSession ? 'Home' : 'Login' }],
                  });
                }}
                variant="secondary"
              />
            ) : null}
          </Card>
        </FormScaffold>
        <LoadingOverlay
          label={isResending ? 'Sending verification email...' : 'Verifying your email...'}
          visible={isConfirmingToken || isResending}
        />
      </Screen>
    );
  }

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
          <PageErrorToast errorMessage={errorMessage} title="Verification failed" />

          {!isOnline ? (
            <FormResultBanner message="Verification emails require an internet connection." tone="warning" />
          ) : null}

          {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

          <Button
            disabled={!canResendVerificationEmail}
            label={resendButtonLabel}
            loading={isResending}
            onPress={() => {
              void sendVerificationEmail('manual');
            }}
          />

          <Button
            label={
              hasRetainedSession
                ? isExpiredEntry
                  ? 'Sign Out'
                  : 'Back'
                : 'Back to Sign In'
            }
            onPress={() => {
              void handleSecondaryAction();
            }}
            variant="secondary"
          />
        </Card>
      </FormScaffold>
      <ConfirmDestructiveModal
        cancelLabel={logoutCancelLabel}
        confirmLabel={logoutConfirmLabel}
        confirmLoadingLabel={logoutConfirmLoadingLabel}
        description={logoutDescription}
        loading={isLoggingOut}
        onCancel={cancelLogout}
        onConfirm={() => {
          void confirmLogout();
        }}
        testID="verify-email-logout-confirmation-modal"
        title={logoutTitle}
        visible={isLogoutConfirmVisible}
      />
      <LoadingOverlay label="Sending verification email..." visible={isResending} />
    </Screen>
  );
}
