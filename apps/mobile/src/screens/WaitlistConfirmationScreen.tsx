import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthIntroCard, AuthTopBar, FormScaffold } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createThemedStyles } from '../theme';
import { Button, Card, Screen, Text } from '../ui';

type WaitlistConfirmationScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'WaitlistConfirmation'
>;

const useStyles = createThemedStyles((theme) => ({
  formContent: {
    paddingTop: theme.spacing.sm,
  },
  confirmationCard: {
    gap: theme.spacing.sm,
  },
  emailText: {
    textAlign: 'center',
  },
  actions: {
    gap: theme.spacing.sm,
  },
}));

export function WaitlistConfirmationScreen({
  navigation,
  route,
}: WaitlistConfirmationScreenProps) {
  const styles = useStyles();
  const email = route.params.email.trim().toLowerCase();
  const sharedListParams = {
    source: route.params.source,
    sharedListToken: route.params.sharedListToken,
  };

  return (
    <Screen background="app" scroll testID="waitlist-confirmation-screen">
      <FormScaffold
        lead={
          <AuthTopBar
            onBackPress={() => {
              navigation.navigate('SignUp', { email, mode: 'join_waitlist', ...sharedListParams });
            }}
          />
        }
        showHeader={false}
        title=""
        contentStyle={styles.formContent}
      >
        <AuthIntroCard
          description="We saved your spot and will email you when your account is ready."
          iconName="mail-outline"
          title="You're on the waitlist"
        />

        <Card style={styles.confirmationCard}>
          <Text tone="muted" variant="bodySm">
            Waitlist email
          </Text>
          <Text style={styles.emailText} variant="titleMd">
            {email}
          </Text>
          <Text tone="secondary">
            When this email is approved, you can return to create an account with it.
          </Text>
        </Card>

        <Card style={styles.actions}>
          <Button
            label="Back to Sign Up"
            onPress={() => {
              navigation.navigate('SignUp', { email, mode: 'join_waitlist', ...sharedListParams });
            }}
            testID="waitlist-confirmation-signup-button"
          />
          <Button
            label="Log In Instead"
            onPress={() => {
              navigation.navigate('Login', { email, ...sharedListParams });
            }}
            testID="waitlist-confirmation-login-button"
            variant="secondary"
          />
        </Card>
      </FormScaffold>
    </Screen>
  );
}
