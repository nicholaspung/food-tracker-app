import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

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
import { MAIN_ONBOARDING_PUBLISHED_ASSETS } from '../lib/onboardingPublishedAssets';
import { BRAND_LOGO } from '../lib/branding';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import type { MainOnboardingCardId } from '../types/onboarding';
import { Button, Card, Screen, Text } from '../ui';

type FeatureOnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'FeatureOnboarding'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface MainOnboardingCard {
  id: MainOnboardingCardId;
  title: string;
  description: string;
  icon: IoniconName;
  imageAssetKey?: keyof typeof FEATURE_ONBOARDING_ASSETS;
  heroLogo?: boolean;
  accentIcons?: IoniconName[];
}

function resolvePublishedMainOnboardingImageSource(
  cardId: MainOnboardingCardId,
  key: keyof typeof FEATURE_ONBOARDING_ASSETS,
) {
  return MAIN_ONBOARDING_PUBLISHED_ASSETS[cardId] ? FEATURE_ONBOARDING_ASSETS[key] : undefined;
}

const MAIN_ONBOARDING_CARDS: MainOnboardingCard[] = [
  {
    id: 'welcome',
    title: 'Welcome to Yummy Recs',
    description:
      'Track restaurant visits, food products, and notes so you can remember what you liked and share useful recommendations with friends.',
    icon: 'restaurant-outline',
    imageAssetKey: 'gettingStartedWelcome',
    heroLogo: true,
    accentIcons: ['fast-food-outline', 'people-outline', 'star-outline'],
  },
  {
    id: 'month_privacy',
    title: 'Shared by month',
    description:
      'Tracked items show the month they were added, so recommendations stay useful without making every meal feel watched in real time.',
    icon: 'calendar-outline',
    imageAssetKey: 'gettingStartedMonthPrivacy',
    accentIcons: ['calendar-number-outline', 'eye-off-outline', 'time-outline'],
  },
  {
    id: 'tutorials',
    title: 'Watch feature tutorials',
    description:
      'Some sections include short tutorial GIFs before you use them. Watching the full tutorial first will make the feature easier to use.',
    icon: 'play-circle-outline',
    imageAssetKey: 'gettingStartedTutorials',
    accentIcons: ['phone-portrait-outline', 'play-outline', 'sparkles-outline'],
  },
  {
    id: 'friends',
    title: 'Add friends intentionally',
    description:
      'There is no contact-list import. Add friends with codes when you are together, ideally over food or drinks.',
    icon: 'people-outline',
    imageAssetKey: 'gettingStartedFriends',
    accentIcons: ['qr-code-outline', 'person-add-outline', 'restaurant-outline'],
  },
  {
    id: 'more_tools',
    title: 'More than tracking',
    description:
      'You can organize restaurants into lists, split bills with friends, and use the tip calculator when you do not want to do the math.',
    icon: 'apps-outline',
    imageAssetKey: 'gettingStartedMoreTools',
    accentIcons: ['list-outline', 'cash-outline', 'calculator-outline'],
  },
  {
    id: 'lists_intro',
    title: 'Use lists for ideas',
    description:
      'Lists can group restaurants, show your ratings and recommended menu items, or bookmark food your friends shared for later.',
    icon: 'list-outline',
    imageAssetKey: 'gettingStartedListsIntro',
  },
  {
    id: 'bills_tips',
    title: 'Split bills and calculate tips',
    description:
      'Bills help one person organize the split and keep payment details remembered. The tip calculator is there for quick totals.',
    icon: 'cash-outline',
    imageAssetKey: 'gettingStartedBillsTips',
  },
  {
    id: 'settings',
    title: 'Personalize your experience',
    description:
      'Settings let you choose appearance, default visibility, and Home feed preferences so Yummy Recs fits how you track and share food.',
    icon: 'settings-outline',
    imageAssetKey: 'gettingStartedSettings',
    accentIcons: ['color-palette-outline', 'eye-outline', 'options-outline'],
  },
  {
    id: 'support_invites',
    title: 'Invite friends and get help',
    description:
      'The app is invite-only. Each user has 5 invite links, and can automatically add the inviter as a friend. For help, go to Feedback and Support.',
    icon: 'restaurant-outline',
    imageAssetKey: 'gettingStartedSupportInvites',
    accentIcons: ['ticket-outline', 'help-circle-outline', 'chatbubble-ellipses-outline'],
  },
];

function findMainOnboardingCardIndex(cardId: MainOnboardingCardId | undefined): number {
  if (!cardId) {
    return 0;
  }

  const cardIndex = MAIN_ONBOARDING_CARDS.findIndex((card) => card.id === cardId);
  return cardIndex >= 0 ? cardIndex : 0;
}

type CardViewTrigger = 'initial' | 'swipe' | 'indicator' | 'arrow';

const useStyles = createThemedStyles((
  theme,
  carouselCardWidth: number,
  mediaHeight: number,
  carouselCardHeight: number,
) => ({
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
    height: carouselCardHeight,
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
  iconVisual: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: mediaHeight,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  heroLogo: {
    height: 64,
    width: 64,
  },
  heroIconFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  accentIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    width: 38,
  },
  accentIconTopLeft: {
    left: theme.spacing.lg,
    top: theme.spacing.lg,
  },
  accentIconTopRight: {
    right: theme.spacing.lg,
    top: theme.spacing.lg,
  },
  accentIconBottom: {
    bottom: theme.spacing.lg,
    right: theme.spacing.lg,
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
    minHeight: 40,
  },
  cardTitle: {
    flex: 1,
  },
  cardCopy: {
    color: theme.colors.text.secondary,
    minHeight: 72,
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
  styles,
}: {
  card: MainOnboardingCard;
  styles: ReturnType<typeof useStyles>;
}) {
  const theme = useTheme();
  const accentPositions = [styles.accentIconTopLeft, styles.accentIconTopRight, styles.accentIconBottom];
  const imageSource = card.imageAssetKey
    ? resolvePublishedMainOnboardingImageSource(card.id, card.imageAssetKey)
    : undefined;

  return (
    <Card style={styles.card}>
      {imageSource ? (
        <View style={styles.imageFrame}>
          <Image resizeMode="cover" source={imageSource} style={styles.image} />
        </View>
      ) : (
        <View style={styles.iconVisual}>
          {(card.accentIcons ?? []).map((iconName, index) => (
            <View key={`${card.id}-${iconName}`} style={[styles.accentIcon, accentPositions[index]]}>
              <Ionicons color={theme.colors.text.info} name={iconName} size={18} />
            </View>
          ))}
          <View style={styles.heroIconFrame}>
            {card.heroLogo ? (
              <Image resizeMode="contain" source={BRAND_LOGO} style={styles.heroLogo} />
            ) : (
              <Ionicons color={theme.colors.text.brand} name={card.icon} size={44} />
            )}
          </View>
        </View>
      )}
      <View style={styles.cardTitleRow}>
        <View style={styles.cardIcon}>
          <Ionicons color={theme.colors.text.info} name={card.icon} size={22} />
        </View>
        <Text numberOfLines={2} style={styles.cardTitle} variant="cardTitle">
          {card.title}
        </Text>
      </View>
      <Text ellipsizeMode="tail" numberOfLines={3} style={styles.cardCopy} variant="bodyMd">
        {card.description}
      </Text>
    </Card>
  );
}

export function FeatureOnboardingScreen({ navigation, route }: FeatureOnboardingScreenProps) {
  const mode = route.params?.mode ?? 'required';
  const initialCardId = route.params?.initialCardId;
  const theme = useTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const writeFeature = useOfflineAwareFeatureWrite();
  const carouselRef = useRef<ScrollView | null>(null);
  const lastTrackedCardKeyRef = useRef<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(() => findMainOnboardingCardIndex(initialCardId));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const carouselCardWidth = Math.min(viewportWidth - theme.spacing.lg * 2, theme.sizes.modalMaxWidth);
  const mediaHeight = Math.min(Math.max(320, Math.round(viewportHeight * 0.42)), 430);
  const cardCopyHeight = 72;
  const cardTitleAreaHeight = 40;
  const cardVerticalChrome = theme.spacing.md * 2 + theme.spacing.sm * 2;
  const carouselCardHeight = mediaHeight + cardTitleAreaHeight + cardCopyHeight + cardVerticalChrome;
  const boundedActiveCardIndex = Math.min(activeCardIndex, MAIN_ONBOARDING_CARDS.length - 1);
  const activeCard = MAIN_ONBOARDING_CARDS[boundedActiveCardIndex] ?? MAIN_ONBOARDING_CARDS[0];
  const isFinalCard = boundedActiveCardIndex === MAIN_ONBOARDING_CARDS.length - 1;
  const styles = useStyles(carouselCardWidth, mediaHeight, carouselCardHeight);

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
                <FeatureOnboardingCardView card={card} styles={styles} />
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
      isFinalCard,
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
        title={initialCardId ? activeCard.title : 'Welcome tutorial'}
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
