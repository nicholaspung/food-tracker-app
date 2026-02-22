import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { FormScaffold, LoadingOverlay } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { Button, Input, Screen } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInWithPassword, isSubmitting, authError } = useAuth();

  const handleSignIn = async () => {
    trackObservabilityEvent('AUTH_LOGIN_SUBMIT_STARTED', {
      source: 'LoginScreen',
      hasEmail: Boolean(email.trim()),
    });

    try {
      await signInWithPassword(email, password);
    } catch {
      // AuthProvider already handles user-facing errors.
    }
  };

  return (
    <Screen background="surface" keyboardAware scroll>
      <FormScaffold subtitle="Sign in with your existing account." title="Food Tracker">
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
          placeholder="Password"
          secureTextEntry
          value={password}
        />

        <PageErrorToast errorMessage={authError} title="Sign in failed" />

        <Button
          disabled={!email.trim() || !password}
          label="Sign In"
          loading={isSubmitting}
          onPress={() => {
            void handleSignIn();
          }}
        />

        <Button
          label="Forgot Password"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'LoginScreen',
              destination: 'ForgotPassword',
            });
            navigation.navigate('ForgotPassword');
          }}
          variant="secondary"
        />

        <Button
          label="Create Account"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'LoginScreen',
              destination: 'SignUp',
            });
            navigation.navigate('SignUp');
          }}
          variant="secondary"
        />

        <Button
          label="Back to Onboarding"
          onPress={() => {
            trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
              source: 'LoginScreen',
              destination: 'Onboarding',
            });
            navigation.navigate('Onboarding');
          }}
          variant="secondary"
        />
      </FormScaffold>
      <LoadingOverlay label="Signing in..." visible={isSubmitting} />
    </Screen>
  );
}
