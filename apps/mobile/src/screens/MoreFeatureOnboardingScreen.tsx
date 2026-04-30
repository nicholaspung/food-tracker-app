import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { BackHeaderScreenScaffold } from '../components/shared';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  buildMoreOnboardingCardDismissedState,
  dismissMoreOnboardingCard,
  isMoreOnboardingCardDismissed,
  saveOptimisticMobileOnboardingState,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import type { MoreOnboardingCardId } from '../types/auth';
import { Button, Text } from '../ui';

type MoreFeatureOnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'MoreFeatureOnboarding'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MoreFeatureDestination = 'Lists' | 'Bills' | 'TipCalculator';
type IconTone = 'blue' | 'green';

interface MoreFeatureOnboardingConfig {
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  iconName: IoniconName;
  iconTone: IconTone;
  destination: MoreFeatureDestination;
  primaryLabel: string;
  analyticsFeature: string;
}

const MORE_FEATURE_ONBOARDING_CONFIG: Record<MoreOnboardingCardId, MoreFeatureOnboardingConfig> = {
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

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  imageFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: 188,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  description: {
    color: theme.colors.text.secondary,
  },
  actions: {
    gap: theme.spacing.xs,
  },
}));

export function MoreFeatureOnboardingScreen({ navigation, route }: MoreFeatureOnboardingScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { user } = useAuth();
  const writeFeature = useOfflineAwareFeatureWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { cardId } = route.params;
  const mode = route.params.mode ?? 'firstRun';
  const entrySource = route.params.source ?? 'more';
  const config = MORE_FEATURE_ONBOARDING_CONFIG[cardId];

  const iconColor = useMemo(() => {
    if (config.iconTone === 'blue') {
      return theme.colors.text.info;
    }

    return theme.colors.text.success;
  }, [config.iconTone, theme.colors.text.info, theme.colors.text.success]);

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

    if (!user?.id) {
      setErrorMessage('Please sign in again to update onboarding.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    const dismissedAt = new Date().toISOString();

    try {
      const saveResult = await writeFeature({
        operationName: 'onboarding.more-card.dismiss',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId: user.id,
            cardId,
            dismissedAt,
          },
        },
        execute: () =>
          dismissMoreOnboardingCard(user.id, {
            cardId,
            dismissedAt,
          }),
      });

      if (saveResult.status === 'queued') {
        saveOptimisticMobileOnboardingState(
          buildMoreOnboardingCardDismissedState(user.mobileOnboardingState, {
            cardId,
            dismissedAt,
          }),
        );
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update onboarding.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onBackPress={handleBack}
      subtitle={config.subtitle}
      testID="more-feature-onboarding-screen"
      title={mode === 'replay' ? 'Tutorial' : 'Feature Intro'}
    >
      <View style={styles.body}>
        <View style={styles.imageFrame}>
          <Image resizeMode="cover" source={config.imageSource} style={styles.image} />
        </View>
        <View style={styles.titleRow}>
          <Ionicons color={iconColor} name={config.iconName} size={22} />
          <Text variant="titleMd">{config.title}</Text>
        </View>
        <Text style={styles.description} variant="bodyMd">
          {config.description}
        </Text>
        <PageErrorToast errorMessage={errorMessage} title="Onboarding update failed" />
        <View style={styles.actions}>
          <Button
            disabled={isSubmitting}
            label={config.primaryLabel}
            loading={isSubmitting}
            onPress={() => {
              void handleContinue();
            }}
            testID="more-feature-onboarding-primary-button"
          />
          <Button
            disabled={isSubmitting}
            label={mode === 'replay' && entrySource === 'profile' ? 'Back to Tutorials' : 'Back to More'}
            onPress={handleBack}
            testID="more-feature-onboarding-back-button"
            variant="secondary"
          />
        </View>
      </View>
    </BackHeaderScreenScaffold>
  );
}
