import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import {
  BackHeaderScreenScaffold,
  FeatureIntroScreenContent,
  type FeatureIntroConfig,
} from '../components/shared';
import {
  buildAddOnboardingCardDismissedState,
  dismissAddOnboardingCard,
  isAddOnboardingCardDismissed,
} from '../features';
import { useDismissibleOnboardingCard } from '../hooks/useDismissibleOnboardingCard';
import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import type { AddOnboardingCardId } from '../types/auth';

type AddFeatureOnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'AddFeatureOnboarding'>;
type AddFeatureDestination = 'CreateVisit' | 'FoodProduct' | 'NoteEditor' | 'ProcessPhotos' | 'Notes';

const ADD_FEATURE_ONBOARDING_CONFIG: Record<AddOnboardingCardId, FeatureIntroConfig<AddFeatureDestination>> = {
  trackRestaurantVisit: {
    title: 'Track a restaurant visit',
    subtitle: 'Restaurant Visit',
    description: 'Add the restaurant, rate what you ordered, attach photos, and keep the visit ready for your feed.',
    imageSource: FEATURE_ONBOARDING_ASSETS.trackRestaurantVisit,
    iconName: 'restaurant-outline',
    iconTone: 'blue',
    destination: 'CreateVisit',
    primaryLabel: 'Start Visit',
    analyticsFeature: 'track_restaurant_visit',
  },
  trackFoodProduct: {
    title: 'Track a food product',
    subtitle: 'Food Product',
    description: 'Save groceries, market finds, snacks, and drinks without creating a full restaurant visit.',
    imageSource: FEATURE_ONBOARDING_ASSETS.trackFoodProduct,
    iconName: 'bag-outline',
    iconTone: 'green',
    destination: 'FoodProduct',
    primaryLabel: 'Track Product',
    analyticsFeature: 'track_food_product',
  },
  logNote: {
    title: 'Log a note',
    subtitle: 'Notes',
    description: 'Capture food ideas, places, recipes, and reminders before turning them into entries later.',
    imageSource: FEATURE_ONBOARDING_ASSETS.logNote,
    iconName: 'create-outline',
    iconTone: 'orange',
    destination: 'NoteEditor',
    primaryLabel: 'Write Note',
    analyticsFeature: 'log_note',
  },
  processSavedPhotos: {
    title: 'Process saved photos',
    subtitle: 'Saved Photos',
    description: 'Review saved food photos and decide whether each one should become a visit or food product.',
    imageSource: FEATURE_ONBOARDING_ASSETS.processSavedPhotos,
    iconName: 'images-outline',
    iconTone: 'brand',
    destination: 'ProcessPhotos',
    primaryLabel: 'Process Photos',
    analyticsFeature: 'process_saved_photos',
  },
  manageNotes: {
    title: 'Manage notes',
    subtitle: 'Notes',
    description: 'Search, edit, delete, and convert your notes when you are ready to track what they describe.',
    imageSource: FEATURE_ONBOARDING_ASSETS.manageNotes,
    iconName: 'document-text-outline',
    iconTone: 'muted',
    destination: 'Notes',
    primaryLabel: 'View Notes',
    analyticsFeature: 'manage_notes',
  },
};

function trackDestinationStarted(destination: AddFeatureDestination) {
  switch (destination) {
    case 'CreateVisit':
      trackObservabilityEvent('Visit Creation Started', { source: 'AddFeatureOnboardingScreen' });
      return;
    case 'FoodProduct':
      trackObservabilityEvent('Food Product Started', { source: 'AddFeatureOnboardingScreen' });
      return;
    case 'ProcessPhotos':
      trackObservabilityEvent('Photo Processing Started', { source: 'AddFeatureOnboardingScreen' });
      return;
    case 'NoteEditor':
      trackObservabilityEvent('Note Creation Started', { source: 'AddFeatureOnboardingScreen' });
      return;
    case 'Notes':
      trackObservabilityEvent('Notes Opened', { source: 'AddFeatureOnboardingScreen' });
      return;
  }
}

export function AddFeatureOnboardingScreen({ navigation, route }: AddFeatureOnboardingScreenProps) {
  const { user } = useAuth();
  const { cardId } = route.params;
  const mode = route.params.mode ?? 'firstRun';
  const entrySource = route.params.source ?? 'add';
  const config = ADD_FEATURE_ONBOARDING_CONFIG[cardId];
  const { dismiss, errorMessage, isSubmitting } = useDismissibleOnboardingCard({
    buildOptimisticState: buildAddOnboardingCardDismissedState,
    cardId,
    createOfflinePayload: (userId, input) => ({
      userId,
      cardId: input.cardId,
      dismissedAt: input.dismissedAt,
    }),
    currentOnboardingState: user?.mobileOnboardingState,
    dismissCard: dismissAddOnboardingCard,
    operationName: 'onboarding.add-card.dismiss',
  });

  useEffect(() => {
    if (mode === 'firstRun' && isAddOnboardingCardDismissed(user?.mobileOnboardingState, cardId)) {
      navigation.replace(config.destination);
    }
  }, [cardId, config.destination, mode, navigation, user?.mobileOnboardingState]);

  const handleBack = () => {
    if (mode === 'replay') {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }

      navigation.navigate(entrySource === 'profile' ? 'Profile' : 'AddVisit');
      return;
    }

    navigation.navigate('AddVisit');
  };

  const handleContinue = async () => {
    if (mode === 'replay') {
      trackObservabilityEvent('ADD_ONBOARDING_CARD_CTA_TAPPED', {
        cardId,
        destination: config.destination,
        entrySource,
        feature: config.analyticsFeature,
        mode,
        source: 'AddFeatureOnboardingScreen',
      });
      trackDestinationStarted(config.destination);
      navigation.navigate(config.destination);
      return;
    }

    const saveResult = await dismiss(user?.id ?? '');
    if (!saveResult) {
      return;
    }

    trackObservabilityEvent('ADD_ONBOARDING_CARD_CTA_TAPPED', {
      cardId,
      destination: config.destination,
      entrySource,
      feature: config.analyticsFeature,
      mode,
      queued: saveResult.status === 'queued',
      source: 'AddFeatureOnboardingScreen',
    });
    trackDestinationStarted(config.destination);
    navigation.replace(config.destination);
  };

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onBackPress={handleBack}
      subtitle={config.subtitle}
      testID="add-feature-onboarding-screen"
      title={mode === 'replay' ? 'Tutorial' : 'Feature Intro'}
    >
      <FeatureIntroScreenContent
        config={config}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        layout="immersive"
        onPrimaryPress={() => {
          void handleContinue();
        }}
        primaryTestID="add-feature-onboarding-primary-button"
      />
    </BackHeaderScreenScaffold>
  );
}
