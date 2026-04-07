import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import { requestUserPasswordReset } from '../features';
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
  const styles = useStyles();

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
      navigation.navigate('ResetPassword', {
        email: trimmedEmail,
      });
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
          description="Request a reset token by email."
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
            disabled={!email.trim()}
            label="Send Reset Email"
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
