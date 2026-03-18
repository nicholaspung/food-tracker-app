import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import { FeatureFormScreenScaffold, LoadingState } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type EditVisitScreenProps = NativeStackScreenProps<RootStackParamList, 'EditVisit'>;

export function EditVisitScreen({ navigation, route }: EditVisitScreenProps) {
  useEffect(() => {
    navigation.replace('CreateVisit', {
      editVisitId: route.params.visitId,
      returnToStep: 2,
    });
  }, [navigation, route.params.visitId]);

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('Home');
      }}
      primaryAction={{
        label: 'Loading',
        disabled: true,
        onPress: () => {},
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: () => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }

          navigation.navigate('Home');
        },
      }}
      subtitle="Opening the visit editor."
      title="Edit Restaurant Visit"
    >
      <LoadingState label="Opening visit..." />
    </FeatureFormScreenScaffold>
  );
}
