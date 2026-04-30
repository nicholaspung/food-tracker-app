import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthIntroCard, AuthTopBar, FormScaffold, LoadingOverlay } from '../components/shared';
import { createCollectionRecord, sendApiRequest } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  isAuthRateLimitError,
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
import { getErrorMessage } from '../lib/errorUtils';
import { savePendingFriendSuggestion, type PendingFriendSuggestion } from '../lib/pendingFriendSuggestion';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SignUpScreenProps = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

interface InviteCodeInviterResponse {
  hasInviter?: boolean;
  inviter?: {
    id?: string;
    displayName?: string;
  };
}

const EMAIL_CONSENT_VERSION = '2026-04-27';

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  screenContent: {
    flexGrow: 0,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  helperText: {
    marginTop: -theme.spacing.xs,
  },
  consentGroup: {
    gap: theme.spacing.xs,
  },
  consentRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.button.primaryBg,
    borderColor: theme.colors.button.primaryBg,
  },
  checkboxDisabled: {
    opacity: 0.7,
  },
  consentText: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  supportActions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  waitlistCard: {
    gap: theme.spacing.sm,
  },
}));

export function SignUpScreen({ navigation, route }: SignUpScreenProps) {
  const { signInWithPassword } = useAuth();
  const { isOnline } = useConnectivity();
  const prefilledInviteCode =
    route.params?.inviteCode?.trim() ?? route.params?.code?.trim() ?? '';
  const prefilledEmail = route.params?.email?.trim().toLowerCase() ?? '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [productUpdatesConsent, setProductUpdatesConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [onboardingEmailsAcknowledged] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitlistErrorMessage, setWaitlistErrorMessage] = useState<string | null>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const {
    decision: signupRateLimitDecision,
    refresh: refreshSignupRateLimit,
    setDecision: setSignupRateLimitDecision,
  } = useAuthRateLimit('signup', normalizedEmail);
  const {
    decision: waitlistRateLimitDecision,
    refresh: refreshWaitlistRateLimit,
    setDecision: setWaitlistRateLimitDecision,
  } = useAuthRateLimit('waitlist', normalizedEmail);
  const isSignupRateLimited = !signupRateLimitDecision.allowed;
  const isWaitlistRateLimited = !waitlistRateLimitDecision.allowed;
  const signupSubmitLabel = isSignupRateLimited
    ? `Try Again in ${Math.max(1, Math.ceil(signupRateLimitDecision.remainingMs / 1000))}s`
    : 'Create Account';
  const waitlistSubmitLabel = isWaitlistRateLimited
    ? `Try Again in ${Math.max(1, Math.ceil(waitlistRateLimitDecision.remainingMs / 1000))}s`
    : isOnline ? 'Join Waitlist' : 'Waitlist Requires Internet';

  useEffect(() => {
    if (!prefilledInviteCode) {
      return;
    }

    setInviteCode(prefilledInviteCode);
  }, [prefilledInviteCode]);

  useEffect(() => {
    if (!prefilledEmail) {
      return;
    }

    setEmail(prefilledEmail);
  }, [prefilledEmail]);
  const styles = useStyles();

  const handleSignUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedInviteCode = inviteCode.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'missing_required_fields',
      });
      setErrorMessage('Name, email, and password are required.');
      return;
    }

    if (!trimmedInviteCode) {
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'missing_invite_code',
      });
      setErrorMessage('Invite code is required to create an account.');
      return;
    }

    if (!onboardingEmailsAcknowledged) {
      trackObservabilityEvent('AUTH_SIGNUP_VALIDATION_FAILED', {
        source: 'SignUpScreen',
        reason: 'missing_email_acknowledgement',
      });
      setErrorMessage('Required onboarding and account emails must be acknowledged.');
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

    const rateLimitDecision = await refreshSignupRateLimit();
    if (!rateLimitDecision.allowed) {
      setErrorMessage(formatAuthSubmitRateLimitMessage('create account', rateLimitDecision.remainingMs));
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

      if (trimmedInviteCode) {
        try {
          const inviteLookup = await sendApiRequest<InviteCodeInviterResponse>(
            `/api/invite-codes/inviter/${encodeURIComponent(trimmedInviteCode)}`,
            { method: 'GET' },
          );

          if (
            inviteLookup?.hasInviter &&
            typeof inviteLookup.inviter?.id === 'string' &&
            inviteLookup.inviter.id.trim().length > 0
          ) {
            pendingFriendSuggestion = {
              inviterId: inviteLookup.inviter.id,
              inviterDisplayName:
                typeof inviteLookup.inviter.displayName === 'string'
                  ? inviteLookup.inviter.displayName
                  : undefined,
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
      }

      await createCollectionRecord('users', {
        name: trimmedName,
        email: trimmedEmail,
        ...(trimmedInviteCode ? { inviteCode: trimmedInviteCode } : {}),
        defaultListVisibility: 'friends',
        defaultVisitVisibility: 'friends',
        defaultRestaurantVisibility: 'friends',
        defaultHomeFeedMode: 'mine',
        defaultHomeFeedTypeFilter: 'visits',
        defaultHomeFeedSort: 'created',
        productUpdatesConsent,
        marketingConsent,
        onboardingEmailsAcknowledged,
        emailConsentVersion: EMAIL_CONSENT_VERSION,
        password,
        passwordConfirm,
        username: `${trimmedEmail.split('@')[0]}_${Date.now().toString(36)}`,
      });
      await recordAuthRateLimitSuccess('signup', trimmedEmail);
      await refreshSignupRateLimit();

      if (pendingFriendSuggestion) {
        await savePendingFriendSuggestion(pendingFriendSuggestion);
      }

      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_SUCCEEDED', {
        source: 'SignUpScreen',
        hasInviter: Boolean(pendingFriendSuggestion),
      });

      try {
        await signInWithPassword(trimmedEmail, password);
      } catch (signInError) {
        trackObservabilityEvent('AUTH_SIGNUP_POST_CREATE_SIGNIN_FAILED', {
          source: 'SignUpScreen',
          errorMessage: signInError instanceof Error ? signInError.message : String(signInError),
        });
        navigation.navigate('VerifyEmail', {
          email: trimmedEmail,
          password,
          source: 'sign_up',
        });
      }
    } catch (error) {
      trackObservabilityEvent('AUTH_SIGNUP_SUBMIT_FAILED', {
        source: 'SignUpScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const message = resolveSignUpErrorMessage(error);
      const nextDecision = isAuthRateLimitError(error)
        ? await recordServerAuthRateLimit('signup', trimmedEmail)
        : await recordAuthRateLimitFailure('signup', trimmedEmail);
      setSignupRateLimitDecision(nextDecision);
      setErrorMessage(
        nextDecision.allowed ? message : formatAuthSubmitRateLimitMessage('create account', nextDecision.remainingMs),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinWaitlist = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setWaitlistErrorMessage('Email is required to join the waitlist.');
      return;
    }

    if (!onboardingEmailsAcknowledged) {
      setWaitlistErrorMessage('Required onboarding and account emails must be acknowledged.');
      return;
    }

    if (!isOnline) {
      setWaitlistErrorMessage('Joining the waitlist requires an internet connection.');
      return;
    }

    if (inviteCode.trim()) {
      setWaitlistErrorMessage('Remove the invite code to join the waitlist.');
      return;
    }

    const rateLimitDecision = await refreshWaitlistRateLimit();
    if (!rateLimitDecision.allowed) {
      setWaitlistErrorMessage(formatAuthSubmitRateLimitMessage('join waitlist', rateLimitDecision.remainingMs));
      return;
    }

    setWaitlistErrorMessage(null);
    setIsJoiningWaitlist(true);

    try {
      await sendApiRequest('/api/waitlist', {
        method: 'POST',
        body: {
          email: trimmedEmail,
          source: 'mobile_signup',
          productUpdatesConsent,
          marketingConsent,
          onboardingEmailsAcknowledged,
          consentVersion: EMAIL_CONSENT_VERSION,
        },
      });
      trackObservabilityEvent('AUTH_WAITLIST_JOIN_SUCCEEDED', {
        source: 'SignUpScreen',
      });
      await recordAuthRateLimitSuccess('waitlist', trimmedEmail);
      await refreshWaitlistRateLimit();
      navigation.navigate('WaitlistConfirmation', {
        email: trimmedEmail,
      });
    } catch (error) {
      const message = getErrorMessage(error, 'Could not join the waitlist.');
      const nextDecision = isAuthRateLimitError(error)
        ? await recordServerAuthRateLimit('waitlist', trimmedEmail)
        : await recordAuthRateLimitFailure('waitlist', trimmedEmail);
      setWaitlistRateLimitDecision(nextDecision);
      setWaitlistErrorMessage(
        nextDecision.allowed ? message : formatAuthSubmitRateLimitMessage('join waitlist', nextDecision.remainingMs),
      );
      trackObservabilityEvent('AUTH_WAITLIST_JOIN_FAILED', {
        source: 'SignUpScreen',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  const resolveSignUpErrorMessage = (error: unknown): string => {
    const message = getErrorMessage(error, 'Sign up failed.');
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes('invite code is required')) {
      return 'Invite code is required, or this email must be approved from the waitlist.';
    }

    if (normalizedMessage.includes('invalid or already used invite code')) {
      return 'Invite code is invalid or already used.';
    }

    if (normalizedMessage.includes('email is not approved for signup')) {
      return 'This email is not approved yet. Join the waitlist and we will email you when your account is ready.';
    }

    if (normalizedMessage.includes('too many failed attempts')) {
      return 'Too many invalid invite code attempts. Please try again later.';
    }

    return message;
  };

  return (
    <Screen
      background="app"
      contentStyle={styles.screenContent}
      keyboardAware
      scroll
      testID="signup-screen"
    >
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
          <Input
            label="Name"
            onChangeText={setName}
            placeholder="Your name"
            testID="signup-name-input"
            value={name}
          />
          <Input
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            testID="signup-email-input"
            textContentType="username"
            value={email}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            label="Invite Code"
            onChangeText={setInviteCode}
            placeholder="Enter invite code"
            testID="signup-invite-code-input"
            value={inviteCode}
          />
          <Text style={styles.helperText} tone="muted" variant="bodySm">
            Have an invite code? Enter it here. If not, join the waitlist below.
          </Text>
          <Input
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            label="Password"
            onChangeText={setPassword}
            passwordRules="minlength: 8;"
            placeholder="Create password"
            secureTextEntry
            testID="signup-password-input"
            textContentType="newPassword"
            value={password}
          />
          <Input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            label="Confirm Password"
            onChangeText={setPasswordConfirm}
            placeholder="Repeat password"
            secureTextEntry
            testID="signup-confirm-password-input"
            textContentType="none"
            value={passwordConfirm}
          />

          <View style={styles.consentGroup}>
            <ConsentRow
              checked={onboardingEmailsAcknowledged}
              disabled
              label="Required onboarding and account emails"
              onPress={() => {}}
              testID="signup-onboarding-emails-checkbox"
              helperText="These include account, security, onboarding, and service messages needed to use Yummy Recs."
            />
            <ConsentRow
              checked={productUpdatesConsent}
              label="Occasional product update emails"
              onPress={() => setProductUpdatesConsent((value) => !value)}
              testID="signup-product-updates-checkbox"
              helperText="You can unsubscribe later."
            />
            <ConsentRow
              checked={marketingConsent}
              label="Marketing emails"
              onPress={() => setMarketingConsent((value) => !value)}
              testID="signup-marketing-checkbox"
              helperText="Promotions and launch updates are optional."
            />
          </View>

          <PageErrorToast errorMessage={errorMessage} title="Could not create account" />

          <Button
            disabled={
              !name.trim() ||
              !email.trim() ||
              !inviteCode.trim() ||
              !password ||
              !passwordConfirm ||
              password.length < 8 ||
              passwordConfirm.length < 8 ||
              !onboardingEmailsAcknowledged ||
              isSignupRateLimited
            }
            label={signupSubmitLabel}
            loading={isSubmitting}
            onPress={() => {
              void handleSignUp();
            }}
            testID="signup-submit-button"
          />
        </Card>

        <Card style={styles.waitlistCard}>
          <Text variant="label">No invite code?</Text>
          <Text tone="secondary" variant="bodySm">
            Join the waitlist with the email above. When approved, you can create an account with that email.
          </Text>
          <PageErrorToast errorMessage={waitlistErrorMessage} title="Could not join waitlist" />
          <Button
            disabled={
              !email.trim() ||
              Boolean(inviteCode.trim()) ||
              !isOnline ||
              !onboardingEmailsAcknowledged ||
              isWaitlistRateLimited
            }
            label={waitlistSubmitLabel}
            loading={isJoiningWaitlist}
            onPress={() => {
              void handleJoinWaitlist();
            }}
            testID="signup-waitlist-submit-button"
            variant="secondary"
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
            testID="signup-login-instead-button"
            variant="secondary"
          />
        </View>
      </FormScaffold>
      <LoadingOverlay label="Creating account..." visible={isSubmitting} />
    </Screen>
  );
}

function formatAuthSubmitRateLimitMessage(action: string, remainingMs: number): string {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Too many attempts to ${action}. Try again in ${remainingSeconds} seconds.`;
}

function ConsentRow({
  checked,
  disabled = false,
  helperText,
  label,
  onPress,
  testID,
}: {
  checked: boolean;
  disabled?: boolean;
  helperText: string;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.consentRow}
      testID={testID}
    >
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : null, disabled ? styles.checkboxDisabled : null]} />
      <View style={styles.consentText}>
        <Text variant="label">{label}</Text>
        <Text tone="muted" variant="bodySm">
          {helperText}
        </Text>
      </View>
    </Pressable>
  );
}
