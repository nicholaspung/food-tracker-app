import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { FormResultBanner, FormScaffold, LoadingOverlay } from '../components/shared';
import { createCollectionRecord } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { Button, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

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
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'missing_required_fields',
      });
      setErrorMessage('Name, email, and password are required.');
      return;
    }

    if (password !== passwordConfirm) {
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'password_mismatch',
      });
      setErrorMessage('Passwords do not match.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_STARTED', {
      source: 'SignUpScreen',
      hasName: Boolean(trimmedName),
      hasEmail: Boolean(trimmedEmail),
    });

    try {
      await createCollectionRecord('users', {
        name: trimmedName,
        email: trimmedEmail,
        password,
        passwordConfirm,
        username: `${trimmedEmail.split('@')[0]}_${Date.now().toString(36)}`,
      });

      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_SUCCEEDED', {
        source: 'SignUpScreen',
      });
      setSuccessMessage('Account created. Check your email for a verification link or token.');
    } catch (error) {
      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_FAILED', {
        source: 'SignUpScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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

        <PageErrorToast errorMessage={errorMessage} title="Could not create account" />

        {successMessage ? <FormResultBanner message={successMessage} tone="success" /> : null}

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
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'SignUpScreen',
              destination: 'Login',
            });
            navigation.navigate('Login');
          }}
          variant="secondary"
        />

        <Button
          label="Enter verification token"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'SignUpScreen',
              destination: 'VerifyEmail',
            });
            navigation.navigate('VerifyEmail');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Creating account..." visible={isSubmitting} />
    </Screen>
  );
}
