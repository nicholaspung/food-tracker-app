import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import { createCollectionRecord, sendApiRequest } from '../features';
import { getErrorMessage } from '../lib/errorUtils';
import { savePendingFriendSuggestion, type PendingFriendSuggestion } from '../lib/pendingFriendSuggestion';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

interface InviteCodeInviterResponse {
  hasInviter?: boolean;
  inviter?: {
    id?: string;
    email?: string;
    name?: string;
  };
}

export function SignUpScreen({ navigation, route }: SignUpScreenProps) {
  const theme = useTheme();
  const prefilledInviteCode =
    route.params?.inviteCode?.trim() ?? route.params?.code?.trim() ?? '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!prefilledInviteCode) {
      return;
    }

    setInviteCode(prefilledInviteCode);
  }, [prefilledInviteCode]);

  const styles = StyleSheet.create({
    formContent: {
      paddingTop: theme.spacing.sm,
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
    const trimmedInviteCode = inviteCode.trim();

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

    if (password.length < 8) {
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'password_too_short',
      });
      setErrorMessage('Password must be at least 8 characters long.');
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
      let pendingFriendSuggestion: PendingFriendSuggestion | null = null;

      try {
        const inviteLookup = await sendApiRequest<InviteCodeInviterResponse>(
          `/api/invite-codes/inviter/${encodeURIComponent(trimmedInviteCode)}`,
          { method: 'GET' },
        );

        if (
          inviteLookup?.hasInviter &&
          typeof inviteLookup.inviter?.id === 'string' &&
          inviteLookup.inviter.id.trim().length > 0 &&
          typeof inviteLookup.inviter?.email === 'string' &&
          inviteLookup.inviter.email.trim().length > 0
        ) {
          pendingFriendSuggestion = {
            inviterId: inviteLookup.inviter.id,
            inviterEmail: inviteLookup.inviter.email,
            inviterName: inviteLookup.inviter.name,
            newUserEmail: trimmedEmail,
          };
        }
      } catch (inviteLookupError) {
        trackObservabilityEvent('AUTH_SIGNUP_INVITER_LOOKUP_FAILED', {
          source: 'SignUpScreen',
          errorMessage:
            inviteLookupError instanceof Error ? inviteLookupError.message : String(inviteLookupError),
        });
      }

      await createCollectionRecord('users', {
        name: trimmedName,
        email: trimmedEmail,
        inviteCode: trimmedInviteCode,
        defaultVisitVisibility: 'friends',
        defaultRestaurantVisibility: 'friends',
        password,
        passwordConfirm,
        username: `${trimmedEmail.split('@')[0]}_${Date.now().toString(36)}`,
      });

      if (pendingFriendSuggestion) {
        await savePendingFriendSuggestion(pendingFriendSuggestion);
      }

      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_SUCCEEDED', {
        source: 'SignUpScreen',
        hasInviter: Boolean(pendingFriendSuggestion),
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
        <AuthIntroCard
          description="Start building your own recommendation history and share favorite finds with friends."
          iconName="person-add-outline"
          title="Create Account"
        />

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
            autoCapitalize="none"
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
            disabled={
              !name.trim() ||
              !email.trim() ||
              !inviteCode.trim() ||
              !password ||
              !passwordConfirm ||
              password.length < 8 ||
              passwordConfirm.length < 8
            }
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
