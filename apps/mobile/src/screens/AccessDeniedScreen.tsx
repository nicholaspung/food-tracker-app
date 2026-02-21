import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackHeaderScreenScaffold, EmptyState } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type AccessDeniedScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function AccessDeniedScreen({ navigation }: AccessDeniedScreenProps) {
  return (
    <BackHeaderScreenScaffold
      onBackPress={() => {
        navigation.navigate('Home');
      }}
      title="Access denied"
    >
      <EmptyState
        actionLabel="Back to Home"
        description="This route is restricted to admin users."
        onAction={() => {
          navigation.navigate('Home');
        }}
        title="Access denied"
      />
    </BackHeaderScreenScaffold>
  );
}
