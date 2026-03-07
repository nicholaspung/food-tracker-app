import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthTopBar, FormScaffold, LoadingOverlay, OtaUpdateCard } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { AUTH_EMAIL_UNVERIFIED_ERROR, useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation, route }: LoginScreenProps) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInWithPassword, isSubmitting, authError } = useAuth();
  const prefilledEmail = route.params?.email?.trim().toLowerCase() ?? '';

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
    forgotLink: {
      alignSelf: 'flex-end',
      paddingVertical: theme.spacing.xs,
    },
    secondaryActions: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    errorCard: {
      gap: theme.spacing.xs,
    },
  });

  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    trackObservabilityEvent('AUTH_LOGIN_SUBMIT_STARTED', {
      source: 'LoginScreen',
      hasEmail: Boolean(normalizedEmail),
    });

    try {
      await signInWithPassword(normalizedEmail, password);
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_EMAIL_UNVERIFIED_ERROR) {
        navigation.navigate('VerifyEmail', {
          email: normalizedEmail,
          password,
          source: 'login',
        });
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
              <Ionicons color={theme.colors.text.brand} name="key-outline" size={28} />
            </View>
          </View>
          <Text variant="titleMd">Welcome Back</Text>
          <Text tone="secondary">Sign in with your email and password.</Text>
        </Card>

        <OtaUpdateCard
          description="If beta sign-in works on the web but not on mobile, verify the running OTA here and update this app before trying again."
          source="LoginScreen"
          title="Login build status"
        />

        <Card style={styles.formCard}>
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
          >
            <Text tone="muted" variant="bodySm">
              Forgot Password?
            </Text>
          </Pressable>

          <PageErrorToast errorMessage={authError} title="Sign in failed" />

          {authError ? (
            <Card style={styles.errorCard} tone="danger">
              <Text tone="danger" variant="label">
                Sign-in diagnostics
              </Text>
              <Text tone="danger" variant="bodySm">
                {authError}
              </Text>
            </Card>
          ) : null}

          <Button
            disabled={!email.trim() || !password}
            label="Sign In"
            loading={isSubmitting}
            onPress={() => {
              void handleSignIn();
            }}
          />
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
            variant="secondary"
          />
        </View>
      </FormScaffold>
      <LoadingOverlay label="Signing in..." visible={isSubmitting} />
    </Screen>
  );
}
