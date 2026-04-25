import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { AuthIntroCard, AuthTopBar, FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { requestUserPasswordReset } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Button, Card, Screen, Text } from '../ui';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const resetEmail = route.params?.email?.trim().toLowerCase() ?? '';
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

  const handleResend = async () => {
    if (!resetEmail) {
      setErrorMessage('Email is required to resend the reset link.');
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
      setSuccessMessage('Reset email sent again.');
      trackObservabilityEvent('AUTH_PASSWORD_RESET_EMAIL_RESEND_SUCCEEDED', {
        source: 'ResetPasswordScreen',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not resend reset email.';
      setErrorMessage(message);
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

          {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

          <Button
            label="Back to Sign In"
            onPress={navigateToLogin}
          />

          <Button
            disabled={!resetEmail}
            label="Resend Email"
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
