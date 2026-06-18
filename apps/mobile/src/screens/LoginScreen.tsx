import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import {
  clearRememberedLoginEmail,
  loadRememberedLoginEmail,
  saveRememberedLoginEmail,
} from '../lib/rememberedLoginEmail';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  formatAuthRateLimitActionLabel,
  formatAuthRateLimitMessage,
  isAuthRateLimitError,
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
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
  emailField: {
    gap: theme.spacing.xs,
  },
  emailLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  emailLabel: {
    flex: 1,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginRight: theme.spacing.xs,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.button.primaryBg,
    borderColor: theme.colors.button.primaryBg,
  },
  rememberEmailToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    flexShrink: 0,
    marginLeft: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
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
  const [rememberEmail, setRememberEmail] = useState(false);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  const { signInWithPassword, isSubmitting, authError } = useAuth();
  const prefilledEmail = route.params?.email?.trim().toLowerCase() ?? '';
  const normalizedEmail = email.trim().toLowerCase();
  const {
    decision: loginRateLimitDecision,
    refresh: refreshLoginRateLimit,
    setDecision: setLoginRateLimitDecision,
  } = useAuthRateLimit('login', normalizedEmail);
  const signInErrorMessage = localErrorMessage ?? authError;
  const isLoginRateLimited = !loginRateLimitDecision.allowed;
  const loginSubmitLabel = isLoginRateLimited
    ? formatAuthRateLimitActionLabel('Try Again', loginRateLimitDecision.remainingMs)
    : 'Sign In';
  const shouldShowVerifyEmailAction =
    authError === AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE && Boolean(normalizedEmail);
  const styles = useStyles();

  const handleSignIn = async () => {
    const rateLimitDecision = await refreshLoginRateLimit();
    if (!rateLimitDecision.allowed) {
      setLocalErrorMessage(formatAuthRateLimitMessage('Too many sign-in attempts', rateLimitDecision.remainingMs));
      return;
    }

    trackObservabilityEvent('AUTH_LOGIN_SUBMIT_STARTED', {
      source: 'LoginScreen',
      hasEmail: Boolean(normalizedEmail),
    });

    try {
      setLocalErrorMessage(null);
      await signInWithPassword(normalizedEmail, password);
      await recordAuthRateLimitSuccess('login', normalizedEmail);
      await refreshLoginRateLimit();

      if (rememberEmail) {
        await saveRememberedLoginEmail(normalizedEmail);
      } else {
        await clearRememberedLoginEmail();
      }
    } catch (error) {
      const nextDecision = isAuthRateLimitError(error)
        ? await recordServerAuthRateLimit('login', normalizedEmail)
        : await recordAuthRateLimitFailure('login', normalizedEmail);
      setLoginRateLimitDecision(nextDecision);

      if (!nextDecision.allowed) {
        setLocalErrorMessage(formatAuthRateLimitMessage('Too many sign-in attempts', nextDecision.remainingMs));
      }
    }
  };

  useEffect(() => {
    if (!prefilledEmail) {
      return;
    }

    setEmail(prefilledEmail);
    setPassword('');
  }, [prefilledEmail]);

  useEffect(() => {
    let isMounted = true;

    const hydrateRememberedEmail = async () => {
      const rememberedEmail = await loadRememberedLoginEmail();

      if (!isMounted) {
        return;
      }

      setRememberEmail(Boolean(rememberedEmail));

      if (!prefilledEmail && rememberedEmail) {
        setEmail(rememberedEmail);
        setPassword('');
      }
    };

    void hydrateRememberedEmail();

    return () => {
      isMounted = false;
    };
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
          <View style={styles.emailField}>
            <View style={styles.emailLabelRow}>
              <Text style={styles.emailLabel} variant="label">
                Email
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberEmail }}
                onPress={() => {
                  setRememberEmail((value) => {
                    const nextValue = !value;

                    if (!nextValue) {
                      void clearRememberedLoginEmail();
                    }

                    return nextValue;
                  });
                }}
                style={styles.rememberEmailToggle}
                testID="login-remember-email-checkbox"
              >
                <View style={[styles.checkbox, rememberEmail ? styles.checkboxChecked : null]} />
                <Text variant="label">Remember</Text>
              </Pressable>
            </View>
            <Input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              testID="login-email-input"
              textContentType="username"
              value={email}
            />
          </View>

          <Input
            label="Password"
            onChangeText={setPassword}
            passwordMode="current"
            placeholder="Password"
            testID="login-password-input"
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
            disabled={!email.trim() || !password || isLoginRateLimited}
            label={loginSubmitLabel}
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
