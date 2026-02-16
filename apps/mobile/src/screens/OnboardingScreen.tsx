import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/RootNavigator';
import { FormScaffold } from '../components/shared';
import { Button, Screen, Text } from '../ui';

type OnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  return (
    <Screen background="surface">
      <FormScaffold
        subtitle="Track meals, sync offline, and share food experiences with friends."
        title="Welcome to Food Tracker"
      >
        <Button
          label="Create Account"
          onPress={() => {
            navigation.navigate('SignUp');
          }}
        />
        <Button
          label="Sign In"
          onPress={() => {
            navigation.navigate('Login');
          }}
          variant="secondary"
        />
        <Button
          label="Verify Email"
          onPress={() => {
            navigation.navigate('VerifyEmail');
          }}
          variant="secondary"
        />
        <Text tone="muted">
          If you already requested a password reset, you can jump directly to the reset screen.
        </Text>
        <Button
          label="Reset Password"
          onPress={() => {
            navigation.navigate('ResetPassword');
          }}
          variant="secondary"
        />
      </FormScaffold>
    </Screen>
  );
}
