import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '../ui/AppIcon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import type { ComponentProps } from 'react';

import type { RootStackParamList } from '../navigation/RootNavigator';
import { AuthTopBar, FormScaffold } from '../components/shared';
import { BRAND_LOGO } from '../lib/branding';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Screen, Text } from '../ui';

type OnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type BadgeTone = 'info' | 'success' | 'warning';

interface OnboardingCardConfig {
  id: 'track' | 'offline' | 'friends';
  title: string;
  description: string;
  heroIcon?: IoniconName;
  heroLogo?: boolean;
  badges: {
    icon: IoniconName;
    tone: BadgeTone;
    position: 'topLeft' | 'topRight' | 'bottom';
  }[];
}

const ONBOARDING_CARDS: OnboardingCardConfig[] = [
  {
    id: 'track',
    title: 'Track Meals. Rate Smarter.',
    description: 'Keep your food records organized, synced, and ready whenever you need them.',
    heroLogo: true,
    badges: [
      { icon: 'compass-outline', position: 'topLeft', tone: 'info' },
      { icon: 'people-outline', position: 'topRight', tone: 'success' },
      { icon: 'cloud-done-outline', position: 'bottom', tone: 'warning' },
    ],
  },
  {
    id: 'offline',
    title: 'Works Great Offline.',
    description: 'Log dishes anywhere and let Yummy Recs replay your updates when you reconnect.',
    heroIcon: 'cloud-done-outline',
    badges: [
      { icon: 'phone-portrait-outline', position: 'topLeft', tone: 'info' },
      { icon: 'sync-outline', position: 'topRight', tone: 'success' },
      { icon: 'checkmark-done-outline', position: 'bottom', tone: 'warning' },
    ],
  },
  {
    id: 'friends',
    title: 'Share Better Recs.',
    description: 'Compare ratings, share favorites, and build food plans together with friends.',
    heroIcon: 'people-outline',
    badges: [
      { icon: 'chatbubble-ellipses-outline', position: 'topLeft', tone: 'info' },
      { icon: 'heart-outline', position: 'topRight', tone: 'success' },
      { icon: 'location-outline', position: 'bottom', tone: 'warning' },
    ],
  },
];

const useStyles = createThemedStyles((theme, carouselCardWidth: number) => ({
  screenContent: {
    paddingTop: theme.spacing.xl,
  },
  titleSection: {
    gap: theme.spacing.xs,
  },
  title: {
    textAlign: 'left',
  },
  subtitle: {
    textAlign: 'left',
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
  heroCard: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  heroVisual: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    height: 176,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  heroBadge: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    width: 30,
  },
  heroBadgeTopLeft: {
    left: theme.spacing.md,
    top: theme.spacing.md,
  },
  heroBadgeTopRight: {
    right: theme.spacing.md,
    top: theme.spacing.md,
  },
  heroBadgeBottom: {
    bottom: theme.spacing.md,
    right: theme.spacing.xl,
  },
  heroIconFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  heroLogo: {
    height: 52,
    width: 52,
  },
  heroTitle: {
    textAlign: 'center',
  },
  heroDescription: {
    textAlign: 'center',
  },
  indicatorRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    width: '100%',
  },
  indicatorDot: {
    backgroundColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    height: 8,
    width: 8,
  },
  indicatorDotActive: {
    backgroundColor: theme.colors.fill.brand,
    width: 18,
  },
  indicatorButton: {
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.xxs,
    paddingVertical: theme.spacing.xs,
  },
  actions: {
    gap: theme.spacing.sm,
  },
}));

export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const theme = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const carouselRef = useRef<ScrollView | null>(null);
  const lastTrackedCardViewKeyRef = useRef<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const carouselCardWidth = Math.min(viewportWidth - theme.spacing.lg * 2, theme.sizes.modalMaxWidth);
  const boundedActiveCardIndex = Math.min(activeCardIndex, ONBOARDING_CARDS.length - 1);
  const styles = useStyles(carouselCardWidth);

  useEffect(() => {
    carouselRef.current?.scrollTo({
      animated: false,
      x: boundedActiveCardIndex * carouselCardWidth,
      y: 0,
    });
  }, [boundedActiveCardIndex, carouselCardWidth]);

  const trackCardViewed = useCallback((index: number, trigger: 'initial' | 'swipe' | 'indicator') => {
    const card = ONBOARDING_CARDS[index];
    if (!card) {
      return;
    }

    const trackingKey = `${card.id}::${index}::${trigger}`;
    if (lastTrackedCardViewKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedCardViewKeyRef.current = trackingKey;
    trackObservabilityEvent('AUTH_ONBOARDING_CARD_VIEWED', {
      source: 'OnboardingScreen',
      card: card.id,
      index,
      trigger,
    });
  }, []);

  useEffect(() => {
    trackCardViewed(boundedActiveCardIndex, 'initial');
  }, [boundedActiveCardIndex, trackCardViewed]);

  const handleCardIndicatorPress = (index: number) => {
    setActiveCardIndex(index);
    trackCardViewed(index, 'indicator');
    carouselRef.current?.scrollTo({
      animated: true,
      x: index * carouselCardWidth,
      y: 0,
    });
  };

  const resolveBadgeColors = (tone: BadgeTone) => {
    switch (tone) {
      case 'success':
        return {
          backgroundColor: theme.colors.status.successBg,
          borderColor: theme.colors.status.successBorder,
          iconColor: theme.colors.text.success,
        };
      case 'warning':
        return {
          backgroundColor: theme.colors.status.warningBg,
          borderColor: theme.colors.status.warningBorder,
          iconColor: theme.colors.text.warning,
        };
      case 'info':
      default:
        return {
          backgroundColor: theme.colors.status.infoBg,
          borderColor: theme.colors.status.infoBorder,
          iconColor: theme.colors.text.info,
        };
    }
  };

  return (
    <Screen background="app" contentStyle={styles.screenContent} scroll testID="onboarding-screen">
      <FormScaffold
        lead={<AuthTopBar />}
        showHeader={false}
        title=""
      >
        <View style={styles.carouselViewport}>
          <ScrollView
            horizontal
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / carouselCardWidth);
              const boundedIndex = Math.max(0, Math.min(ONBOARDING_CARDS.length - 1, nextIndex));
              setActiveCardIndex(boundedIndex);
              trackCardViewed(boundedIndex, 'swipe');
            }}
            pagingEnabled
            ref={carouselRef}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={styles.carouselViewport}
            contentContainerStyle={styles.carouselContent}
          >
            {ONBOARDING_CARDS.map((card) => (
              <View key={card.id} style={styles.carouselItem}>
                <Card style={styles.heroCard}>
                  <View style={styles.heroVisual}>
                    {card.badges.map((badge) => {
                      const badgeColors = resolveBadgeColors(badge.tone);
                      const positionStyle =
                        badge.position === 'topLeft'
                          ? styles.heroBadgeTopLeft
                          : badge.position === 'topRight'
                            ? styles.heroBadgeTopRight
                            : styles.heroBadgeBottom;

                      return (
                        <View
                          key={`${card.id}-${badge.position}-${badge.icon}`}
                          style={[
                            styles.heroBadge,
                            positionStyle,
                            {
                              backgroundColor: badgeColors.backgroundColor,
                              borderColor: badgeColors.borderColor,
                            },
                          ]}
                        >
                          <Ionicons color={badgeColors.iconColor} name={badge.icon} size={16} />
                        </View>
                      );
                    })}
                    <View style={styles.heroIconFrame}>
                      {card.heroLogo ? (
                        <Image resizeMode="contain" source={BRAND_LOGO} style={styles.heroLogo} />
                      ) : (
                        <Ionicons color={theme.colors.text.brand} name={card.heroIcon ?? 'restaurant-outline'} size={40} />
                      )}
                    </View>
                  </View>

                  <Text style={styles.heroTitle} variant="titleMd">
                    {card.title}
                  </Text>
                  <Text style={styles.heroDescription} tone="secondary">
                    {card.description}
                  </Text>
                </Card>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.indicatorRow}>
          {ONBOARDING_CARDS.map((card, index) => (
            <Pressable
              key={card.id}
              accessibilityLabel={`Show onboarding card ${index + 1}`}
              accessibilityRole="button"
              onPress={() => {
                handleCardIndicatorPress(index);
              }}
              style={styles.indicatorButton}
            >
              <View style={[styles.indicatorDot, index === boundedActiveCardIndex ? styles.indicatorDotActive : null]} />
            </Pressable>
          ))}
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title} variant="titleLg">
            Discover Great Food
          </Text>
          <Text style={styles.subtitle} tone="secondary">
            Capture every dish, even when you're offline, and share your best finds with friends.
          </Text>
          <View>
            <Text tone="secondary">Swipe the cards to preview core features.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            label="Create Account"
            onPress={() => {
              trackObservabilityEvent('AUTH_ONBOARDING_CTA_TAPPED', {
                source: 'OnboardingScreen',
                destination: 'SignUp',
              });
              navigation.navigate('SignUp');
            }}
            testID="onboarding-create-account-button"
          />
          <Button
            label="Sign In"
            onPress={() => {
              trackObservabilityEvent('AUTH_ONBOARDING_CTA_TAPPED', {
                source: 'OnboardingScreen',
                destination: 'Login',
              });
              navigation.navigate('Login');
            }}
            testID="onboarding-sign-in-button"
            variant="secondary"
          />
        </View>
      </FormScaffold>
    </Screen>
  );
}
