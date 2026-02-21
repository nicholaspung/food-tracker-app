import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { FormScaffold, LoadingOverlay } from '../components/shared';
import { confirmUserEmailVerification } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Button, Card, Input, Screen, Text } from '../ui';
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
      setErrorMessage('Verification token is required.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      await confirmUserEmailVerification(trimmedToken);
      setSuccessMessage('Email verified successfully.');
    } catch (error) {
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

        {successMessage ? (
          <Card tone="success">
            <Text tone="success">{successMessage}</Text>
          </Card>
        ) : null}

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
            navigation.navigate('Login');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Verifying email..." visible={isSubmitting} />
    </Screen>
  );
}
