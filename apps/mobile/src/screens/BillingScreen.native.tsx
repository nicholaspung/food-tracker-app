import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackHeaderScreenScaffold, EmptyState } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type BillingScreenProps = NativeStackScreenProps<RootStackParamList, 'Billing'>;

export function BillingScreen({ navigation }: BillingScreenProps) {
  return (
    <BackHeaderScreenScaffold
      onBackPress={() => {
        navigation.goBack();
      }}
      title="Subscription & Billing"
    >
      <EmptyState
        description="Subscription changes are handled outside the iOS and Android app for now."
        title="Unavailable on mobile"
      />
    </BackHeaderScreenScaffold>
  );
}
