import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, FeatureDetailScreenScaffold } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTastingSessionLifecycleReadState } from './tastingSessions/useTastingSessionLifecycleReadState';

type TastingSessionDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionDetail'>;

export function TastingSessionDetailScreen({ navigation, route }: TastingSessionDetailScreenProps) {
  const { sessionId } = route.params;
  const { user } = useAuth();
  const lifecycle = useTastingSessionLifecycleReadState({
    currentUserId: user?.id,
    screen: 'detail',
    sessionId,
  });

  useEffect(() => {
    const destination = lifecycle.redirectDestination;
    if (!destination) {
      return;
    }

    if (destination.name === 'TastingSessions') {
      navigation.navigate(destination.name, destination.params);
    } else {
      navigation.navigate(destination.name, destination.params);
    }
  }, [lifecycle.redirectDestination, navigation]);

  return (
    <FeatureDetailScreenScaffold
      headerScrollMode="fixed"
      onBackPress={() => navigation.navigate('TastingSessions')}
      title="Tasting Session"
    >
      <EmptyState description="Opening the right tasting step." title="Loading session" />
    </FeatureDetailScreenScaffold>
  );
}
