import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { BackHeaderScreenScaffold } from '../components/shared';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  buildAddOnboardingCardDismissedState,
  dismissAddOnboardingCard,
  isAddOnboardingCardDismissed,
  saveOptimisticMobileOnboardingState,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import type { AddOnboardingCardId } from '../types/auth';
import { Button, Text } from '../ui';

type AddFeatureOnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'AddFeatureOnboarding'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type AddFeatureDestination = 'CreateVisit' | 'FoodProduct' | 'NoteEditor' | 'ProcessPhotos' | 'Notes';
type IconTone = 'blue' | 'green' | 'orange' | 'brand' | 'muted';

interface AddFeatureOnboardingConfig {
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  iconName: IoniconName;
  iconTone: IconTone;
  destination: AddFeatureDestination;
  primaryLabel: string;
  analyticsFeature: string;
}

const ADD_FEATURE_ONBOARDING_CONFIG: Record<AddOnboardingCardId, AddFeatureOnboardingConfig> = {
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
  const styles = useStyles();
  const theme = useTheme();
  const { user } = useAuth();
  const writeFeature = useOfflineAwareFeatureWrite();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { cardId } = route.params;
  const mode = route.params.mode ?? 'firstRun';
  const entrySource = route.params.source ?? 'add';
  const config = ADD_FEATURE_ONBOARDING_CONFIG[cardId];

  const iconColor = useMemo(() => {
    switch (config.iconTone) {
      case 'green':
        return theme.colors.text.success;
      case 'orange':
        return theme.colors.text.warning;
      case 'brand':
        return theme.colors.text.brand;
      case 'muted':
        return theme.colors.text.secondary;
      case 'blue':
      default:
        return theme.colors.text.info;
    }
  }, [
    config.iconTone,
    theme.colors.text.brand,
    theme.colors.text.info,
    theme.colors.text.secondary,
    theme.colors.text.success,
    theme.colors.text.warning,
  ]);

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

    if (!user?.id) {
      setErrorMessage('Please sign in again to update onboarding.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    const dismissedAt = new Date().toISOString();

    try {
      const saveResult = await writeFeature({
        operationName: 'onboarding.add-card.dismiss',
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
          dismissAddOnboardingCard(user.id, {
            cardId,
            dismissedAt,
          }),
      });

      if (saveResult.status === 'queued') {
        saveOptimisticMobileOnboardingState(
          buildAddOnboardingCardDismissedState(user.mobileOnboardingState, {
            cardId,
            dismissedAt,
          }),
        );
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
      testID="add-feature-onboarding-screen"
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
            testID="add-feature-onboarding-primary-button"
          />
          <Button
            disabled={isSubmitting}
            label={mode === 'replay' && entrySource === 'profile' ? 'Back to Tutorials' : 'Back to Add'}
            onPress={handleBack}
            testID="add-feature-onboarding-back-button"
            variant="secondary"
          />
        </View>
      </View>
    </BackHeaderScreenScaffold>
  );
}
