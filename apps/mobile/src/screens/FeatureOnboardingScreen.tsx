import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { BackHeaderScreenScaffold, Skeleton } from '../components/shared';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  MAIN_ONBOARDING_VERSION,
  buildMainOnboardingCompletedState,
  completeMainOnboarding,
  saveOptimisticMobileOnboardingState,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Screen, Text } from '../ui';

type FeatureOnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'FeatureOnboarding'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MainOnboardingCardId =
  | 'track_restaurant_visit'
  | 'track_food_product'
  | 'log_note'
  | 'process_saved_photos'
  | 'manage_notes';

interface MainOnboardingCard {
  id: MainOnboardingCardId;
  title: string;
  description: string;
  icon: IoniconName;
  imageSource: ImageSourcePropType;
  ctaLabel: string;
}

function resolveOnboardingImageSource(key: keyof typeof FEATURE_ONBOARDING_ASSETS) {
  return FEATURE_ONBOARDING_ASSETS[key];
}

const MAIN_ONBOARDING_CARDS: MainOnboardingCard[] = [
  {
    id: 'track_restaurant_visit',
    title: 'Track a restaurant visit',
    description: 'Add a restaurant, rate dishes, attach photos, and keep the visit ready for your feed.',
    icon: 'restaurant-outline',
    imageSource: resolveOnboardingImageSource('trackRestaurantVisit'),
    ctaLabel: 'Try Visit Tracking',
  },
  {
    id: 'track_food_product',
    title: 'Track a food product',
    description: 'Save groceries, market finds, snacks, and drinks without creating a full restaurant visit.',
    icon: 'bag-outline',
    imageSource: resolveOnboardingImageSource('trackFoodProduct'),
    ctaLabel: 'Try Food Product',
  },
  {
    id: 'log_note',
    title: 'Log a note',
    description: 'Capture food ideas, places, recipes, and reminders before turning them into entries later.',
    icon: 'create-outline',
    imageSource: resolveOnboardingImageSource('logNote'),
    ctaLabel: 'Write a Note',
  },
  {
    id: 'process_saved_photos',
    title: 'Process saved photos',
    description: 'Review saved food photos one by one and decide whether each should become a visit or product.',
    icon: 'images-outline',
    imageSource: resolveOnboardingImageSource('processSavedPhotos'),
    ctaLabel: 'Process Photos',
  },
  {
    id: 'manage_notes',
    title: 'Manage notes',
    description: 'Search, edit, and convert your notes when you are ready to track what they describe.',
    icon: 'document-text-outline',
    imageSource: resolveOnboardingImageSource('manageNotes'),
    ctaLabel: 'View Notes',
  },
];

type CardViewTrigger = 'initial' | 'swipe' | 'indicator' | 'arrow';

const useStyles = createThemedStyles((theme, carouselCardWidth: number, mediaHeight: number) => ({
  requiredContent: {
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  header: {
    gap: theme.spacing.xs,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  eyebrow: {
    color: theme.colors.text.brand,
  },
  carouselViewport: {
    width: '100%',
  },
  carouselContent: {
    alignItems: 'stretch',
  },
  carouselItem: {
    width: carouselCardWidth,
  },
  card: {
    gap: theme.spacing.sm,
  },
  imageFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: mediaHeight,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  cardCopy: {
    color: theme.colors.text.secondary,
  },
  indicatorControlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
  },
  arrowButton: {
    alignItems: 'center',
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  arrowButtonDisabled: {
    opacity: 0.35,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  indicatorButton: {
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.xxs,
    paddingVertical: theme.spacing.xs,
  },
  indicatorDot: {
    backgroundColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    height: 8,
    width: 8,
  },
  indicatorDotActive: {
    backgroundColor: theme.colors.fill.brand,
    width: 20,
  },
  requiredActionsSlot: {
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
    minHeight: theme.sizes.buttonHeight,
  },
  replayBody: {
    gap: theme.spacing.md,
  },
  skeletonBody: {
    gap: theme.spacing.md,
  },
}));

function FeatureOnboardingCardView({
  card,
  mode,
  onCtaPress,
  styles,
}: {
  card: MainOnboardingCard;
  mode: 'required' | 'replay';
  onCtaPress: (cardId: MainOnboardingCardId) => void;
  styles: ReturnType<typeof useStyles>;
}) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.imageFrame}>
        <Image resizeMode="cover" source={card.imageSource} style={styles.image} />
      </View>
      <View style={styles.cardTitleRow}>
        <View style={styles.cardIcon}>
          <Ionicons color={theme.colors.text.info} name={card.icon} size={22} />
        </View>
        <Text variant="cardTitle">{card.title}</Text>
      </View>
      <Text style={styles.cardCopy} variant="bodyMd">
        {card.description}
      </Text>
      {mode === 'replay' ? (
        <Button
          label={card.ctaLabel}
          onPress={() => {
            onCtaPress(card.id);
          }}
          variant="secondary"
        />
      ) : null}
    </Card>
  );
}

export function FeatureOnboardingScreen({ navigation, route }: FeatureOnboardingScreenProps) {
  const mode = route.params?.mode ?? 'required';
  const theme = useTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const writeFeature = useOfflineAwareFeatureWrite();
  const carouselRef = useRef<ScrollView | null>(null);
  const lastTrackedCardKeyRef = useRef<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const carouselCardWidth = Math.min(viewportWidth - theme.spacing.lg * 2, theme.sizes.modalMaxWidth);
  const mediaHeight = Math.min(Math.max(320, Math.round(viewportHeight * 0.42)), 430);
  const boundedActiveCardIndex = Math.min(activeCardIndex, MAIN_ONBOARDING_CARDS.length - 1);
  const isFinalCard = boundedActiveCardIndex === MAIN_ONBOARDING_CARDS.length - 1;
  const styles = useStyles(carouselCardWidth, mediaHeight);

  useEffect(() => {
    trackObservabilityEvent('FEATURE_ONBOARDING_STARTED', {
      mode,
      source: 'FeatureOnboardingScreen',
      version: MAIN_ONBOARDING_VERSION,
    });
  }, [mode]);

  const trackCardViewed = useCallback((index: number, trigger: CardViewTrigger) => {
    const card = MAIN_ONBOARDING_CARDS[index];
    if (!card) {
      return;
    }

    const trackingKey = `${mode}:${card.id}:${index}:${trigger}`;
    if (lastTrackedCardKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedCardKeyRef.current = trackingKey;
    trackObservabilityEvent('FEATURE_ONBOARDING_CARD_VIEWED', {
      cardId: card.id,
      index,
      mode,
      source: 'FeatureOnboardingScreen',
    });
  }, [mode]);

  useEffect(() => {
    carouselRef.current?.scrollTo({
      animated: false,
      x: boundedActiveCardIndex * carouselCardWidth,
      y: 0,
    });
  }, [boundedActiveCardIndex, carouselCardWidth]);

  useEffect(() => {
    trackCardViewed(boundedActiveCardIndex, 'initial');
  }, [boundedActiveCardIndex, trackCardViewed]);

  const navigateToCardIndex = useCallback((index: number, trigger: 'indicator' | 'arrow') => {
    const boundedIndex = Math.max(0, Math.min(index, MAIN_ONBOARDING_CARDS.length - 1));
    setActiveCardIndex(boundedIndex);
    trackCardViewed(boundedIndex, trigger);
    carouselRef.current?.scrollTo({
      animated: true,
      x: boundedIndex * carouselCardWidth,
      y: 0,
    });
  }, [carouselCardWidth, trackCardViewed]);

  const navigateToCardDestination = useCallback(
    (cardId: MainOnboardingCardId) => {
      switch (cardId) {
        case 'track_restaurant_visit':
          navigation.navigate('CreateVisit');
          return;
        case 'track_food_product':
          navigation.navigate('FoodProduct');
          return;
        case 'log_note':
          navigation.navigate('NoteEditor');
          return;
        case 'process_saved_photos':
          navigation.navigate('ProcessPhotos');
          return;
        case 'manage_notes':
          navigation.navigate('Notes');
          return;
      }
    },
    [navigation],
  );

  const handleReplayCtaPress = useCallback(
    (cardId: MainOnboardingCardId) => {
      trackObservabilityEvent('FEATURE_ONBOARDING_CARD_CTA_TAPPED', {
        cardId,
        mode,
        source: 'FeatureOnboardingScreen',
      });
      navigateToCardDestination(cardId);
    },
    [mode, navigateToCardDestination],
  );

  const handleFinish = async () => {
    if (!user?.id) {
      setErrorMessage('Please sign in again to finish onboarding.');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    const completedAt = new Date().toISOString();

    try {
      const saveResult = await writeFeature({
        operationName: 'onboarding.main.complete',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId: user.id,
            version: MAIN_ONBOARDING_VERSION,
            completedAt,
          },
        },
        execute: () =>
          completeMainOnboarding(user.id, {
            version: MAIN_ONBOARDING_VERSION,
            completedAt,
          }),
      });

      if (saveResult.status === 'queued') {
        saveOptimisticMobileOnboardingState(
          buildMainOnboardingCompletedState(user.mobileOnboardingState, {
            version: MAIN_ONBOARDING_VERSION,
            completedAt,
          }),
        );
      }

      trackObservabilityEvent('FEATURE_ONBOARDING_COMPLETED', {
        queued: saveResult.status === 'queued',
        source: 'FeatureOnboardingScreen',
        version: MAIN_ONBOARDING_VERSION,
      });
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not finish onboarding.';
      setErrorMessage(message);
      trackObservabilityEvent('FEATURE_ONBOARDING_COMPLETE_FAILED', {
        error: message,
        isOnline,
        source: 'FeatureOnboardingScreen',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cardCarousel = useMemo(
    () => (
      <>
        <View style={styles.carouselViewport}>
          <ScrollView
            horizontal
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / carouselCardWidth);
              const boundedNextIndex = Math.max(0, Math.min(nextIndex, MAIN_ONBOARDING_CARDS.length - 1));
              setActiveCardIndex(boundedNextIndex);
              trackCardViewed(boundedNextIndex, 'swipe');
            }}
            pagingEnabled
            ref={carouselRef}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
          >
            {MAIN_ONBOARDING_CARDS.map((card) => (
              <View key={card.id} style={styles.carouselItem}>
                <FeatureOnboardingCardView
                  card={card}
                  mode={mode}
                  onCtaPress={handleReplayCtaPress}
                  styles={styles}
                />
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={styles.indicatorControlsRow}>
          <Pressable
            accessibilityLabel="Show previous onboarding card"
            accessibilityRole="button"
            disabled={boundedActiveCardIndex === 0}
            onPress={() => {
              navigateToCardIndex(boundedActiveCardIndex - 1, 'arrow');
            }}
            style={[
              styles.arrowButton,
              boundedActiveCardIndex === 0 ? styles.arrowButtonDisabled : null,
            ]}
            testID="feature-onboarding-previous-button"
          >
            <Ionicons color={theme.colors.text.primary} name="chevron-back" size={20} />
          </Pressable>

          <View style={styles.dotsRow}>
            {MAIN_ONBOARDING_CARDS.map((card, index) => {
              const isActive = index === boundedActiveCardIndex;

              return (
                <Pressable
                  accessibilityLabel={`Show onboarding card ${index + 1}`}
                  accessibilityRole="button"
                  key={card.id}
                  onPress={() => {
                    navigateToCardIndex(index, 'indicator');
                  }}
                  style={styles.indicatorButton}
                  testID={`feature-onboarding-indicator-${card.id}`}
                >
                  <View style={[styles.indicatorDot, isActive ? styles.indicatorDotActive : null]} />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityLabel="Show next onboarding card"
            accessibilityRole="button"
            disabled={isFinalCard}
            onPress={() => {
              navigateToCardIndex(boundedActiveCardIndex + 1, 'arrow');
            }}
            style={[
              styles.arrowButton,
              isFinalCard ? styles.arrowButtonDisabled : null,
            ]}
            testID="feature-onboarding-next-button"
          >
            <Ionicons color={theme.colors.text.primary} name="chevron-forward" size={20} />
          </Pressable>
        </View>
      </>
    ),
    [
      boundedActiveCardIndex,
      carouselCardWidth,
      handleReplayCtaPress,
      isFinalCard,
      mode,
      navigateToCardIndex,
      styles,
      theme.colors.text.primary,
      trackCardViewed,
    ],
  );

  if (!user?.id) {
    return (
      <Screen contentStyle={styles.requiredContent} testID="feature-onboarding-screen">
        <View style={styles.skeletonBody}>
          <Skeleton height={28} />
          <Skeleton height={220} />
          <Skeleton height={44} />
        </View>
      </Screen>
    );
  }

  if (mode === 'replay') {
    return (
      <BackHeaderScreenScaffold
        headerScrollMode="fixed"
        onBackPress={() => {
          navigation.goBack();
        }}
        subtitle="Review how to use Yummy Recs features"
        testID="feature-onboarding-screen"
        title="Onboarding tutorials"
      >
        <View style={styles.replayBody}>{cardCarousel}</View>
      </BackHeaderScreenScaffold>
    );
  }

  return (
    <Screen contentStyle={styles.requiredContent} testID="feature-onboarding-screen">
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <Ionicons color={theme.colors.text.brand} name="sparkles-outline" size={18} />
          <Text style={styles.eyebrow} variant="labelMdBold">
            Get started
          </Text>
        </View>
        <Text variant="displayMd">Learn the main ways to track food</Text>
      </View>

      {cardCarousel}

      <View style={styles.requiredActionsSlot} testID="feature-onboarding-actions-slot">
        <PageErrorToast errorMessage={errorMessage} title="Onboarding update failed" />
        {isFinalCard ? (
          <Button
            disabled={isSaving}
            label="Finish"
            loading={isSaving}
            onPress={() => {
              void handleFinish();
            }}
            testID="feature-onboarding-finish-button"
          />
        ) : null}
      </View>
    </Screen>
  );
}
