import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, FeatureDetailScreenScaffold } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { navigateToTastingSession } from './tastingSessions/shared';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionDetail'>;

export function TastingSessionDetailScreen({ navigation, route }: TastingSessionDetailScreenProps) {
  const { sessionId } = route.params;
  const sessionQuery = useTastingSessionDetail(sessionId, false);

  useEffect(() => {
    if (sessionQuery.data) {
      navigateToTastingSession(navigation, sessionQuery.data);
    }
  }, [navigation, sessionQuery.data]);

  return (
    <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Tasting Session">
      <EmptyState description="Opening the right tasting step." title="Loading session" />
    </FeatureDetailScreenScaffold>
  );
}
