import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { AuthIntroCard, AuthTopBar, FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { confirmUserEmailVerification } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { AUTH_EMAIL_UNVERIFIED_ERROR, useAuth } from '../providers/AuthProvider';
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

export function VerifyEmailScreen({ navigation, route }: VerifyEmailScreenProps) {
  const { signInWithPassword, signOut } = useAuth();
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const pendingEmail = route.params?.email?.trim().toLowerCase() ?? '';
  const pendingPassword = route.params?.password ?? '';
  const shouldAutoSignIn = Boolean(pendingEmail && pendingPassword);
  const subtitle = pendingEmail
    ? `Paste the verification token sent to ${pendingEmail}.`
    : 'Paste the verification token sent by email.';
  const styles = useStyles();

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

      if (shouldAutoSignIn) {
        try {
          await signInWithPassword(pendingEmail, pendingPassword);
          return;
        } catch (autoSignInError) {
          const autoSignInMessage =
            autoSignInError instanceof Error && autoSignInError.message === AUTH_EMAIL_UNVERIFIED_ERROR
              ? 'Verification is still processing. Please try again.'
              : 'Email verified. Please sign in to continue.';
          setErrorMessage(autoSignInMessage);
          setSuccessMessage('Email verified successfully.');
          return;
        }
      }

      setSuccessMessage('Email verified successfully. You can now sign in.');
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

  const resolveVerificationErrorMessage = (error: unknown): string => {
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
  };

  const handleCancelVerification = async () => {
    trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
      source: 'VerifyEmailScreen',
      destination: 'Onboarding',
    });

    try {
      await signOut();
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
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate('Onboarding');
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
            label={shouldAutoSignIn ? 'Verify and Continue' : 'Verify'}
            loading={isSubmitting}
            onPress={() => {
              void handleVerify();
            }}
          />

          <Button
            label="Cancel Verification"
            onPress={() => {
              void handleCancelVerification();
            }}
            variant="secondary"
          />
        </Card>
      </FormScaffold>
      <LoadingOverlay label="Verifying email..." visible={isSubmitting} />
    </Screen>
  );
}
