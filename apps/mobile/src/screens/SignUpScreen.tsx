import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { ErrorState, FormScaffold, LoadingOverlay } from '../components/shared';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Button, Card, Input, Screen, Text } from '../ui';

type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: SignUpScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSignUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      setErrorMessage('Name, email, and password are required.');
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
      await pb.collection('users').create({
        name: trimmedName,
        email: trimmedEmail,
        password,
        passwordConfirm,
        username: `${trimmedEmail.split('@')[0]}_${Date.now().toString(36)}`,
      });

      setSuccessMessage('Account created. Check your email for a verification link or token.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen background="surface" keyboardAware scroll>
      <FormScaffold subtitle="Create your account to continue." title="Sign Up">
        <Input label="Name" onChangeText={setName} placeholder="Your name" value={name} />
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="Password"
          onChangeText={setPassword}
          placeholder="Create password"
          secureTextEntry
          value={password}
        />
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="Confirm Password"
          onChangeText={setPasswordConfirm}
          placeholder="Repeat password"
          secureTextEntry
          value={passwordConfirm}
        />

        {errorMessage ? <ErrorState description={errorMessage} title="Could not create account" /> : null}

        {successMessage ? (
          <Card tone="success">
            <Text tone="success">{successMessage}</Text>
          </Card>
        ) : null}

        <Button
          disabled={!name.trim() || !email.trim() || !password || !passwordConfirm}
          label="Create Account"
          loading={isSubmitting}
          onPress={() => {
            void handleSignUp();
          }}
        />

        <Button
          label="I already verified"
          onPress={() => {
            navigation.navigate('Login');
          }}
          variant="secondary"
        />

        <Button
          label="Enter verification token"
          onPress={() => {
            navigation.navigate('VerifyEmail');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Creating account..." visible={isSubmitting} />
    </Screen>
  );
}
