import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import { createCollectionRecord } from '../features';
import { getErrorMessage } from '../lib/errorUtils';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: SignUpScreenProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = StyleSheet.create({
    formContent: {
      paddingTop: theme.spacing.sm,
    },
    introCard: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    introVisual: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 64,
    },
    introIconFrame: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 60,
      justifyContent: 'center',
      width: 60,
    },
    formCard: {
      gap: theme.spacing.sm,
    },
    supportActions: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
  });

  const handleSignUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedInviteCode = inviteCode.trim().toUpperCase();

    if (!trimmedName || !trimmedEmail || !trimmedInviteCode || !password) {
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'missing_required_fields',
      });
      setErrorMessage('Name, email, invite code, and password are required.');
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
    setIsSubmitting(true);
    trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_STARTED', {
      source: 'SignUpScreen',
      hasName: Boolean(trimmedName),
      hasEmail: Boolean(trimmedEmail),
      hasInviteCode: Boolean(trimmedInviteCode),
      inviteCodeLength: trimmedInviteCode.length,
    });

    try {
      await createCollectionRecord('users', {
        name: trimmedName,
        email: trimmedEmail,
        inviteCode: trimmedInviteCode,
        password,
        passwordConfirm,
        username: `${trimmedEmail.split('@')[0]}_${Date.now().toString(36)}`,
      });

      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_SUCCEEDED', {
        source: 'SignUpScreen',
      });
      navigation.navigate('VerifyEmail', {
        email: trimmedEmail,
        password,
        source: 'sign_up',
      });
    } catch (error) {
      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_FAILED', {
        source: 'SignUpScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = resolveSignUpErrorMessage(error);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveSignUpErrorMessage = (error: unknown): string => {
    const message = getErrorMessage(error, 'Sign up failed.');
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes('invite code is required')) {
      return 'Invite code is required.';
    }

    if (normalizedMessage.includes('invalid or already used invite code')) {
      return 'Invite code is invalid or already used.';
    }

    if (normalizedMessage.includes('too many failed attempts')) {
      return 'Too many invalid invite code attempts. Please try again later.';
    }

    return message;
  };

  return (
    <Screen background="app" keyboardAware scroll>
      <FormScaffold
        lead={
          <AuthTopBar
            onBackPress={() => {
              navigation.navigate('Onboarding');
            }}
          />
        }
        showHeader={false}
        title=""
        contentStyle={styles.formContent}
      >
        <Card style={styles.introCard} tone="muted">
          <View style={styles.introVisual}>
            <View style={styles.introIconFrame}>
              <Ionicons color={theme.colors.text.brand} name="person-add-outline" size={28} />
            </View>
          </View>
          <Text variant="titleMd">Create Account</Text>
          <Text tone="secondary">
            Start building your own recommendation history and share favorite finds with friends.
          </Text>
        </Card>

        <Card style={styles.formCard}>
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
            autoCapitalize="characters"
            autoCorrect={false}
            label="Invite Code"
            onChangeText={setInviteCode}
            placeholder="Enter invite code"
            value={inviteCode}
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

          <Button
            disabled={!name.trim() || !email.trim() || !inviteCode.trim() || !password || !passwordConfirm}
            label="Create Account"
            loading={isSubmitting}
            onPress={() => {
              void handleSignUp();
            }}
          />
        </Card>

        <View style={styles.supportActions}>
          <Text tone="muted" variant="bodySm">
            Already created an account?
          </Text>
          <Button
            label="Log In Instead"
            onPress={() => {
              trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
                source: 'SignUpScreen',
                destination: 'Login',
              });
              navigation.navigate('Login');
            }}
            variant="secondary"
          />
        </View>
      </FormScaffold>
      <LoadingOverlay label="Creating account..." visible={isSubmitting} />
    </Screen>
  );
}
