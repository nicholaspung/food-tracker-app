import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AuthIntroCard,
  AuthTopBar,
  FormResultBanner,
  FormScaffold,
  LoadingOverlay,
} from '../components/shared';
import {
  requestUserEmailVerification,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type VerifyEmailScreenProps = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

const verificationEmailCooldownUntilByEmail = new Map<string, number>();

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
  cooldownText: {
    color: theme.colors.text.muted,
  },
}));

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function getVerificationEmailCooldownUntil(email: string): number {
  return verificationEmailCooldownUntilByEmail.get(normalizeEmailAddress(email)) ?? 0;
}

function setVerificationEmailCooldownUntil(email: string, cooldownUntil: number) {
  verificationEmailCooldownUntilByEmail.set(normalizeEmailAddress(email), cooldownUntil);
}

function formatResendCooldownLabel(remainingSeconds: number): string {
  return `Resend in ${remainingSeconds}s`;
}

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

export function VerifyEmailScreen({ navigation, route }: VerifyEmailScreenProps) {
  const {
    actualUser,
    signOut,
    status,
    verificationStatus,
  } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldownTick, setCooldownTick] = useState(() => Date.now());
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number>(() =>
    pendingEmailFromRouteOrUser(route.params?.email, actualUser?.email),
  );
  const pendingEmail =
    route.params?.email?.trim().toLowerCase() ?? actualUser?.email?.trim().toLowerCase() ?? '';
  const hasRetainedSession = Boolean(actualUser);
  const source = route.params?.source;
  const isExpiredEntry = status === 'verification_required' || source === 'expired_entry';
  const styles = useStyles();
  const hasTriggeredInitialSendRef = useRef(false);
  const resendRemainingSeconds = Math.max(
    0,
    Math.ceil((resendCooldownUntil - cooldownTick) / 1000),
  );
  const canResendVerificationEmail =
    Boolean(pendingEmail) && resendRemainingSeconds === 0 && !isResending;
  const resendButtonLabel =
    resendRemainingSeconds > 0
      ? formatResendCooldownLabel(resendRemainingSeconds)
      : 'Resend Verification Email';

  const subtitle = pendingEmail
    ? hasRetainedSession
      ? `We'll send a verification link to ${pendingEmail}. Open the email, tap Verify, and the app will refresh automatically once your account is updated.`
      : `We'll send a verification link to ${pendingEmail}. Open the email, tap Verify, then return to sign in.`
    : 'We can send another verification email to your account. Open the email and tap Verify to continue.';

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

    const now = Date.now();
    const existingCooldownUntil = getVerificationEmailCooldownUntil(pendingEmail);
    if (existingCooldownUntil > now) {
      setResendCooldownUntil(existingCooldownUntil);
      setErrorMessage(null);
      setSuccessMessage(
        `Check ${pendingEmail} for the latest verification email. You can request another one in ${Math.ceil(
          (existingCooldownUntil - now) / 1000,
        )} seconds.`,
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
      const nextCooldownUntil = Date.now() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
      setVerificationEmailCooldownUntil(pendingEmail, nextCooldownUntil);
      setResendCooldownUntil(nextCooldownUntil);
      setCooldownTick(Date.now());
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_SUCCEEDED', {
        source: 'VerifyEmailScreen',
        trigger,
      });
      setSuccessMessage(
        hasRetainedSession
          ? `Verification email sent to ${pendingEmail}. Tap Verify in your inbox and the banner will clear automatically once PocketBase reports the updated status.`
          : `Verification email sent to ${pendingEmail}. Tap Verify in your inbox, then return to sign in.`,
      );
      return true;
    } catch (error) {
      if (
        (error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 429) ||
        (error instanceof Error &&
          /already requested|rate|too many|try again later/i.test(error.message))
      ) {
        const nextCooldownUntil = Date.now() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
        setVerificationEmailCooldownUntil(pendingEmail, nextCooldownUntil);
        setResendCooldownUntil(nextCooldownUntil);
        setCooldownTick(Date.now());
      }
      trackObservabilityEvent('AUTH_EMAIL_VERIFY_RESEND_FAILED', {
        source: 'VerifyEmailScreen',
        trigger,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(resolveVerificationEmailErrorMessage(error));
      return false;
    } finally {
      setIsResending(false);
    }
  }, [hasRetainedSession, pendingEmail]);

  useEffect(() => {
    setResendCooldownUntil(pendingEmail ? getVerificationEmailCooldownUntil(pendingEmail) : 0);
    setCooldownTick(Date.now());
  }, [pendingEmail]);

  useEffect(() => {
    if (resendCooldownUntil <= Date.now()) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setCooldownTick(Date.now());
    }, 1_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [resendCooldownUntil]);

  useEffect(() => {
    if (!pendingEmail || hasTriggeredInitialSendRef.current || verificationStatus === 'verified') {
      return;
    }

    hasTriggeredInitialSendRef.current = true;
    void sendVerificationEmail('screen_open');
  }, [pendingEmail, sendVerificationEmail, verificationStatus]);

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
          <Text style={styles.helperText}>
            Keep this screen open after tapping the link if you're already signed in. Otherwise, verify your email and
            then return to sign in again.
          </Text>

          <PageErrorToast errorMessage={errorMessage} title="Verification failed" />

          {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

          <Button
            disabled={!canResendVerificationEmail}
            label={resendButtonLabel}
            loading={isResending}
            onPress={() => {
              void sendVerificationEmail('manual');
            }}
          />

          {resendRemainingSeconds > 0 ? (
            <Text style={styles.cooldownText} variant="bodySm">
              For deliverability and abuse protection, you can request another email in {resendRemainingSeconds}
              seconds.
            </Text>
          ) : null}

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
      <LoadingOverlay label="Sending verification email..." visible={isResending} />
    </Screen>
  );
}

function pendingEmailFromRouteOrUser(routeEmail?: string, actualUserEmail?: string): number {
  const resolvedEmail = routeEmail?.trim().toLowerCase() ?? actualUserEmail?.trim().toLowerCase() ?? '';
  return resolvedEmail ? getVerificationEmailCooldownUntil(resolvedEmail) : 0;
}
