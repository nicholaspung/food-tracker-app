import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import {
  BackHeaderScreenScaffold,
  FeatureIntroScreenContent,
  type FeatureIntroConfig,
} from '../components/shared';
import {
  buildMoreOnboardingCardDismissedState,
  dismissMoreOnboardingCard,
  isMoreOnboardingCardDismissed,
} from '../features';
import { useDismissibleOnboardingCard } from '../hooks/useDismissibleOnboardingCard';
import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import type { MoreOnboardingCardId } from '../types/auth';

type MoreFeatureOnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'MoreFeatureOnboarding'>;
type MoreFeatureDestination = 'Lists' | 'Bills' | 'TipCalculator';

const MORE_FEATURE_ONBOARDING_CONFIG: Record<MoreOnboardingCardId, FeatureIntroConfig<MoreFeatureDestination>> = {
  lists: {
    title: 'Organize restaurants with lists',
    subtitle: 'Restaurant Lists',
    description: 'See how lists help you save restaurants, organize favorites, and keep ideas ready for later.',
    imageSource: FEATURE_ONBOARDING_ASSETS.lists,
    iconName: 'list-outline',
    iconTone: 'blue',
    destination: 'Lists',
    primaryLabel: 'View My Lists',
    analyticsFeature: 'restaurant_lists',
  },
  splitBill: {
    title: 'Split a bill',
    subtitle: 'Bills',
    description: 'See how to create a bill, assign items to friends, and track who has paid.',
    imageSource: FEATURE_ONBOARDING_ASSETS.splitBill,
    iconName: 'cash-outline',
    iconTone: 'green',
    destination: 'Bills',
    primaryLabel: 'Open Bills',
    analyticsFeature: 'bills',
  },
  tipCalculator: {
    title: 'Calculate tips quickly',
    subtitle: 'Tip Calculator',
    description: 'Enter the bill details, choose a tip style, and see the total before you split or pay.',
    imageSource: FEATURE_ONBOARDING_ASSETS.tipCalculator,
    iconName: 'calculator-outline',
    iconTone: 'green',
    destination: 'TipCalculator',
    primaryLabel: 'Open Tip Calculator',
    analyticsFeature: 'tip_calculator',
  },
};

export function MoreFeatureOnboardingScreen({ navigation, route }: MoreFeatureOnboardingScreenProps) {
  const { user } = useAuth();
  const { cardId } = route.params;
  const mode = route.params.mode ?? 'firstRun';
  const entrySource = route.params.source ?? 'more';
  const config = MORE_FEATURE_ONBOARDING_CONFIG[cardId];
  const { dismiss, errorMessage, isSubmitting } = useDismissibleOnboardingCard({
    buildOptimisticState: buildMoreOnboardingCardDismissedState,
    cardId,
    createOfflinePayload: (userId, input) => ({
      userId,
      cardId: input.cardId,
      dismissedAt: input.dismissedAt,
    }),
    currentOnboardingState: user?.mobileOnboardingState,
    dismissCard: dismissMoreOnboardingCard,
    operationName: 'onboarding.more-card.dismiss',
  });

  useEffect(() => {
    if (mode === 'firstRun' && isMoreOnboardingCardDismissed(user?.mobileOnboardingState, cardId)) {
      navigation.replace(config.destination);
    }
  }, [cardId, config.destination, mode, navigation, user?.mobileOnboardingState]);

  const handleBack = () => {
    if (mode === 'replay') {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }

      navigation.navigate(entrySource === 'profile' ? 'Profile' : 'Misc');
      return;
    }

    navigation.navigate('Misc');
  };

  const handleContinue = async () => {
    if (mode === 'replay') {
      trackObservabilityEvent('MORE_ONBOARDING_CARD_CTA_TAPPED', {
        cardId,
        destination: config.destination,
        entrySource,
        feature: config.analyticsFeature,
        mode,
        source: 'MoreFeatureOnboardingScreen',
      });
      navigation.navigate(config.destination);
      return;
    }

    const saveResult = await dismiss(user?.id ?? '');
    if (!saveResult) {
      return;
    }

    trackObservabilityEvent('MORE_ONBOARDING_CARD_CTA_TAPPED', {
      cardId,
      destination: config.destination,
      entrySource,
      feature: config.analyticsFeature,
      mode,
      queued: saveResult.status === 'queued',
      source: 'MoreFeatureOnboardingScreen',
    });
    navigation.replace(config.destination);
  };

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onBackPress={handleBack}
      subtitle={config.subtitle}
      testID="more-feature-onboarding-screen"
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
        primaryTestID="more-feature-onboarding-primary-button"
      />
    </BackHeaderScreenScaffold>
  );
}
