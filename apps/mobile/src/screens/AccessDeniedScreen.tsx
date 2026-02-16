import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Screen } from '../ui';

type AccessDeniedScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function AccessDeniedScreen({ navigation }: AccessDeniedScreenProps) {
  return (
    <Screen>
      <EmptyState
        actionLabel="Back to Home"
        description="This route is restricted to admin users."
        onAction={() => {
          navigation.navigate('Home');
        }}
        title="Access denied"
      />
    </Screen>
  );
}
