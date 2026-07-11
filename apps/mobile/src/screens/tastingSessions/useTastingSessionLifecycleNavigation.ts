import { useEffect, useRef } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/RootNavigator';
import type {
  TastingSessionLifecycleMissingAccessFacts,
  TastingSessionLifecycleRedirectDestination,
} from './useTastingSessionLifecycleReadState';

type TastingSessionLifecycleNavigation = NativeStackNavigationProp<RootStackParamList>;

export function executeTastingSessionLifecycleRedirect(
  navigation: TastingSessionLifecycleNavigation,
  destination: TastingSessionLifecycleRedirectDestination,
): void {
  switch (destination.name) {
    case 'TastingSessions':
      navigation.navigate(destination.name, destination.params);
      return;
    case 'TastingSessionLobby':
      navigation.replace(destination.name, destination.params);
      return;
    case 'TastingSessionPlanning':
      navigation.replace(destination.name, destination.params);
      return;
    case 'TastingSessionTasting':
      navigation.replace(destination.name, destination.params);
      return;
    case 'TastingSessionResults':
      navigation.replace(destination.name, destination.params);
  }
}

export function useTastingSessionLifecycleNavigation(input: {
  applyMissingAccessPolicy?: () => void;
  missingAccess?: TastingSessionLifecycleMissingAccessFacts;
  navigation: TastingSessionLifecycleNavigation;
  redirectDestination: TastingSessionLifecycleRedirectDestination | null;
}): void {
  const {
    applyMissingAccessPolicy,
    missingAccess,
    navigation,
    redirectDestination,
  } = input;
  const hasHandledMissingAccessRef = useRef(false);

  useEffect(() => {
    if (
      hasHandledMissingAccessRef.current ||
      !missingAccess?.shouldHandle ||
      !applyMissingAccessPolicy
    ) {
      return;
    }

    hasHandledMissingAccessRef.current = true;
    applyMissingAccessPolicy();
    executeTastingSessionLifecycleRedirect(
      navigation,
      missingAccess.redirectDestination,
    );
  }, [applyMissingAccessPolicy, missingAccess, navigation]);

  useEffect(() => {
    if (redirectDestination) {
      executeTastingSessionLifecycleRedirect(navigation, redirectDestination);
    }
  }, [navigation, redirectDestination]);
}
