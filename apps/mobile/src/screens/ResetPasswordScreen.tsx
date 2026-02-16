import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { ErrorState, FormScaffold, LoadingOverlay } from '../components/shared';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Button, Card, Input, Screen, Text } from '../ui';

type ResetPasswordScreenProps = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation }: ResetPasswordScreenProps) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!token.trim() || !password) {
      setErrorMessage('Token and password are required.');
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      await pb.collection('users').confirmPasswordReset(token.trim(), password, passwordConfirm);
      setSuccessMessage('Password reset completed. You can now sign in.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reset failed.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen background="surface" keyboardAware scroll>
      <FormScaffold subtitle="Enter your reset token and new password." title="Reset Password">
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="Reset Token"
          onChangeText={setToken}
          placeholder="Paste token"
          value={token}
        />
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="New Password"
          onChangeText={setPassword}
          placeholder="New password"
          secureTextEntry
          value={password}
        />
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="Confirm Password"
          onChangeText={setPasswordConfirm}
          placeholder="Confirm password"
          secureTextEntry
          value={passwordConfirm}
        />

        {errorMessage ? <ErrorState description={errorMessage} title="Reset failed" /> : null}

        {successMessage ? (
          <Card tone="success">
            <Text tone="success">{successMessage}</Text>
          </Card>
        ) : null}

        <Button
          disabled={!token.trim() || !password || !passwordConfirm}
          label="Set New Password"
          loading={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
        />

        <Button
          label="Back to Login"
          onPress={() => {
            navigation.navigate('Login');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Resetting password..." visible={isSubmitting} />
    </Screen>
  );
}
