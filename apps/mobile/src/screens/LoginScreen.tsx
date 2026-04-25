import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE, useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: theme.spacing.xs,
  },
  secondaryActions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
}));

export function LoginScreen({ navigation, route }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInWithPassword, isSubmitting, authError } = useAuth();
  const prefilledEmail = route.params?.email?.trim().toLowerCase() ?? '';
  const normalizedEmail = email.trim().toLowerCase();
  const signInErrorMessage = authError;
  const shouldShowVerifyEmailAction =
    authError === AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE && Boolean(normalizedEmail);
  const styles = useStyles();

  const handleSignIn = async () => {
    trackObservabilityEvent('AUTH_LOGIN_SUBMIT_STARTED', {
      source: 'LoginScreen',
      hasEmail: Boolean(normalizedEmail),
    });

    try {
      await signInWithPassword(normalizedEmail, password);
    } catch {}
  };

  useEffect(() => {
    if (!prefilledEmail) {
      return;
    }

    setEmail(prefilledEmail);
    setPassword('');
  }, [prefilledEmail]);

  return (
    <Screen background="app" keyboardAware scroll testID="login-screen">
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
          description="Sign in with your email and password."
          iconName="key-outline"
          title="Welcome Back"
        />

        <Card style={styles.formCard}>
          <Input
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            testID="login-email-input"
            textContentType="username"
            value={email}
          />

          <Input
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            label="Password"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            testID="login-password-input"
            textContentType="password"
            value={password}
          />

          <Pressable
            accessibilityLabel="Forgot Password"
            accessibilityRole="button"
            onPress={() => {
              trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
                source: 'LoginScreen',
                destination: 'ForgotPassword',
              });
              navigation.navigate('ForgotPassword');
            }}
            style={styles.forgotLink}
            testID="login-forgot-password-button"
          >
            <Text tone="muted" variant="bodySm">
              Forgot Password?
            </Text>
          </Pressable>

          <PageErrorToast errorMessage={signInErrorMessage} title="Cannot log in" />

          <Button
            disabled={!email.trim() || !password}
            label="Sign In"
            loading={isSubmitting}
            onPress={() => {
              void handleSignIn();
            }}
            testID="login-submit-button"
          />

          {shouldShowVerifyEmailAction ? (
            <Button
              label="Verify Email"
              onPress={() => {
                navigation.navigate('VerifyEmail', {
                  email: normalizedEmail,
                  password,
                  source: 'expired_entry',
                });
              }}
              variant="secondary"
            />
          ) : null}
        </Card>

        <View style={styles.secondaryActions}>
          <Text tone="muted" variant="bodySm">
            New to Yummy Recs?
          </Text>
          <Button
            label="Create Account"
            onPress={() => {
              trackObservabilityEvent('AUTH_NAVIGATION_CTA_TAPPED', {
                source: 'LoginScreen',
                destination: 'SignUp',
              });
              navigation.navigate('SignUp');
            }}
            testID="login-create-account-button"
            variant="secondary"
          />
        </View>
      </FormScaffold>
      <LoadingOverlay label="Signing in..." visible={isSubmitting} />
    </Screen>
  );
}
