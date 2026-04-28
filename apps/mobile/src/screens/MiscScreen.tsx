import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import {
  OptionList,
  OptionListRow,
  ScreenContentSection,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
  TabSectionCard,
} from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  buildMoreOnboardingCardDismissedState,
  dismissMoreOnboardingCard,
  isMoreOnboardingCardDismissed,
  saveOptimisticMobileOnboardingState,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import type { MoreOnboardingCardId } from '../types/auth';
import { Button, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type MiscScreenProps = NativeStackScreenProps<RootStackParamList, 'Misc'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface TipItem {
  title: string;
  description: string;
}

interface ActionItem {
  title: string;
  description: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  testID: string;
}

const TIPS: TipItem[] = [
  {
    title: 'Food Products for Fast Logging',
    description:
      'Use Food Product when you want to save a grocery, convenience-store, or market item without creating a full restaurant visit. Add notes or a photo if you want extra context.',
  },
  {
    title: 'Process Multiple Photos',
    description:
      'Use Process Photos to step through several saved food photos more easily. You still review each photo, add details, and decide how each entry should be tracked.',
  },
  {
    title: 'Save Notes for Later',
    description:
      'Use Notes to jot down food ideas, places, or recipes. When you are ready, tap "Use Note" to convert it into a visit or food product entry.',
  },
  {
    title: 'Share with Friends',
    description:
      'Connect with friends to see their food recommendations in your home feed. Save restaurants from their lists to your own with one tap.',
  },
  {
    title: 'Organize with Lists',
    description:
      'Create restaurant lists to organize your favorites. Share them with friends or keep them private. Your "Saved" list is a quick way to bookmark places.',
  },
  {
    title: 'Split Bills Easily',
    description:
      'Use the Bill Splitter to divide bills evenly or by item. Assign specific items to each person and set custom tip amounts.',
  },
  {
    title: '"I Went There" Shortcut',
    description:
      'See a bookmarked restaurant from a friend? Tap "I went there" to quickly create a visit and rate the dishes yourself.',
  },
  {
    title: 'Rate Everything',
    description:
      'Use the 5-star rating system to remember which dishes were amazing and which to skip.',
  },
] as const;

const useStyles = createThemedStyles((theme) => ({
  screenContent: {
    backgroundColor: theme.colors.background.surface,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bodyScroll: {
    backgroundColor: theme.colors.background.app,
    flex: 1,
  },
  body: {
    flexGrow: 1,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  sectionCard: {
    borderColor: theme.colors.border.subtle,
  },
  sectionDescription: {
    color: theme.colors.text.muted,
  },
  optionList: {
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featureRow: {
    backgroundColor: theme.colors.background.app,
  },
  sectionActions: {
    gap: theme.spacing.sm,
  },
  onboardingCard: {
    gap: theme.spacing.sm,
  },
  onboardingImageFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: 132,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  onboardingImage: {
    height: '100%',
    width: '100%',
  },
  onboardingTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  onboardingDescription: {
    color: theme.colors.text.secondary,
  },
  onboardingActions: {
    gap: theme.spacing.xs,
  },
  featureIconWrap: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  tipCard: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  tipTitle: {
    color: theme.colors.text.primary,
  },
  tipDescription: {
    color: theme.colors.text.secondary,
  },
  tipsToggle: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
  },
  tipsTogglePressed: {
    backgroundColor: theme.colors.status.infoBg,
  },
  tipsToggleLabel: {
    color: theme.colors.text.info,
  },
}));

interface MoreOnboardingCardProps {
  title: string;
  description: string;
  imageSource: ImageSourcePropType;
  iconName: IoniconName;
  iconColor: string;
  onPrimaryPress: () => void;
  onDismissPress: () => void;
  primaryLabel: string;
  dismissLabel: string;
  testID: string;
}

function resolveMoreOnboardingImageSource(key: 'lists' | 'splitBill') {
  return FEATURE_ONBOARDING_ASSETS[key];
}

function MoreOnboardingCard({
  title,
  description,
  imageSource,
  iconName,
  iconColor,
  onPrimaryPress,
  onDismissPress,
  primaryLabel,
  dismissLabel,
  testID,
}: MoreOnboardingCardProps) {
  const styles = useStyles();

  return (
    <View style={styles.onboardingCard} testID={testID}>
      <View style={styles.onboardingImageFrame}>
        <Image resizeMode="cover" source={imageSource} style={styles.onboardingImage} />
      </View>
      <View style={styles.onboardingTitleRow}>
        <Ionicons color={iconColor} name={iconName} size={20} />
        <Text variant="labelMdBold">{title}</Text>
      </View>
      <Text style={styles.onboardingDescription} variant="bodyMd">
        {description}
      </Text>
      <View style={styles.onboardingActions}>
        <Button label={primaryLabel} onPress={onPrimaryPress} />
        <Button label={dismissLabel} onPress={onDismissPress} variant="secondary" />
      </View>
    </View>
  );
}

export function MiscScreen({ navigation }: MiscScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const writeFeature = useOfflineAwareFeatureWrite();
  const isAdmin = Boolean(user?.isAdmin);
  const [expandedTips, setExpandedTips] = useState(false);
  const [dismissedMoreCards, setDismissedMoreCards] = useState<Partial<Record<MoreOnboardingCardId, true>>>({});
  const [onboardingErrorMessage, setOnboardingErrorMessage] = useState<string | null>(null);

  const sectionColors = {
    cardBorder: theme.colors.border.subtle,
    rowBackground: theme.colors.background.app,
    title: theme.colors.text.primary,
    subtitle: theme.colors.text.muted,
    blue: theme.colors.text.info,
    blueSoft: theme.colors.status.infoBg,
    purple: theme.colors.text.brand,
    purpleSoft: theme.colors.background.muted,
    green: theme.colors.text.success,
    greenSoft: theme.colors.status.successBg,
    yellow: theme.colors.text.warning,
    yellowSoft: theme.colors.status.warningBg,
    yellowBorder: theme.colors.border.warning,
    tipTitle: theme.colors.text.primary,
    tipBody: theme.colors.text.secondary,
    tipsTogglePressed: theme.colors.status.infoBg,
  } as const;

  const restaurantListActions: ActionItem[] = [
    {
      title: 'View My Lists',
      description: 'Browse and manage your saved lists',
      icon: 'list-outline',
      iconColor: sectionColors.blue,
      iconBackground: sectionColors.blueSoft,
      onPress: () => {
        trackObservabilityEvent('MISC_FEATURE_TAPPED', {
          source: 'MiscScreen',
          feature: 'restaurant_lists',
          destination: 'Lists',
        });
        navigation.navigate('Lists');
      },
      testID: 'feature-restaurant-lists',
    },
  ];

  const groupTastingsActions: ActionItem[] = [
    {
      title: 'View Sessions',
      description: 'Create or join a tasting session',
      icon: 'people-outline',
      iconColor: sectionColors.purple,
      iconBackground: sectionColors.purpleSoft,
      onPress: () => {
        trackObservabilityEvent('MISC_FEATURE_TAPPED', {
          source: 'MiscScreen',
          feature: 'group_tastings',
          destination: 'TastingSessions',
        });
        navigation.navigate('TastingSessions');
      },
      testID: 'feature-group-tastings',
    },
  ];

  const billsAndTipsActions: ActionItem[] = [
    {
      title: 'Split a Bill',
      description: 'Create and manage bill splits',
      icon: 'cash-outline',
      iconColor: sectionColors.green,
      iconBackground: sectionColors.greenSoft,
      onPress: () => {
        trackObservabilityEvent('MISC_FEATURE_TAPPED', {
          source: 'MiscScreen',
          feature: 'bills',
          destination: 'Bills',
        });
        navigation.navigate('Bills');
      },
      testID: 'feature-bill-splitter',
    },
    {
      title: 'Tip Calculator',
      description: 'Figure out how much to tip',
      icon: 'calculator-outline',
      iconColor: sectionColors.green,
      iconBackground: sectionColors.greenSoft,
      onPress: () => {
        trackObservabilityEvent('MISC_FEATURE_TAPPED', {
          source: 'MiscScreen',
          feature: 'tip_calculator',
          destination: 'TipCalculator',
        });
        navigation.navigate('TipCalculator');
      },
      testID: 'feature-tip-calculator',
    },
  ];

  const visibleTips = expandedTips ? TIPS : TIPS.slice(0, 3);
  const showListsOnboarding =
    !dismissedMoreCards.lists &&
    !isMoreOnboardingCardDismissed(user?.mobileOnboardingState, 'lists');
  const showSplitBillOnboarding =
    !dismissedMoreCards.splitBill &&
    !isMoreOnboardingCardDismissed(user?.mobileOnboardingState, 'splitBill');

  const handleDismissMoreOnboardingCard = async (cardId: MoreOnboardingCardId): Promise<boolean> => {
    if (!user?.id) {
      setOnboardingErrorMessage('Please sign in again to update onboarding.');
      return false;
    }

    setOnboardingErrorMessage(null);
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

      setDismissedMoreCards((current) => ({
        ...current,
        [cardId]: true,
      }));
      trackObservabilityEvent('MORE_ONBOARDING_CARD_DISMISSED', {
        cardId,
        queued: saveResult.status === 'queued',
        source: 'MiscScreen',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update onboarding.';
      setOnboardingErrorMessage(message);
      return false;
    }
  };

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      keyboardAware={false}
      scroll={false}
      scrollUnderlayColor={theme.colors.background.app}
      testID="misc-page"
    >
      <TabBrandHeader
        showBrand={false}
        subtitle="Additional features and helpful tips"
        title="More"
        titleVariant="displayMd"
      />

      <ScreenContentSection fill testID="misc-screen-content-section">
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          style={styles.bodyScroll}
        >
          <TabSectionCard
            description="Create and organize lists of your favorite restaurants"
            descriptionStyle={styles.sectionDescription}
            style={styles.sectionCard}
            title="Restaurant Lists"
            titleLeading={<Ionicons color={sectionColors.blue} name="list-outline" size={20} />}
          >
            {showListsOnboarding ? (
              <MoreOnboardingCard
                description="See how lists help you save restaurants, organize favorites, and keep ideas ready for later."
                dismissLabel="Got It"
                iconColor={sectionColors.blue}
                iconName="list-outline"
                imageSource={resolveMoreOnboardingImageSource('lists')}
                onDismissPress={() => {
                  void handleDismissMoreOnboardingCard('lists');
                }}
                onPrimaryPress={() => {
                  trackObservabilityEvent('MORE_ONBOARDING_CARD_CTA_TAPPED', {
                    cardId: 'lists',
                    destination: 'Lists',
                    source: 'MiscScreen',
                  });
                  void handleDismissMoreOnboardingCard('lists').then((didDismiss) => {
                    if (didDismiss) {
                      navigation.navigate('Lists');
                    }
                  });
                }}
                primaryLabel="View Lists"
                testID="more-onboarding-lists-card"
                title="Organize restaurants with lists"
              />
            ) : null}
            <OptionList style={styles.optionList}>
              {restaurantListActions.map((action, index) => (
                <OptionListRow
                  isLast={index === restaurantListActions.length - 1}
                  key={action.title}
                  leading={
                    <View style={[styles.featureIconWrap, { backgroundColor: action.iconBackground }]}>
                      <Ionicons color={action.iconColor} name={action.icon} size={18} />
                    </View>
                  }
                  onPress={action.onPress}
                  style={styles.featureRow}
                  subtitle={action.description}
                  testID={action.testID}
                  title={action.title}
                />
              ))}
            </OptionList>
          </TabSectionCard>

          {isAdmin ? (
            <TabSectionCard
              description="Organize group food tasting sessions and rate together"
              descriptionStyle={styles.sectionDescription}
              style={styles.sectionCard}
              title="Group Tastings"
              titleAccessory={<StatusPill label="Beta" tone="brand" uppercase />}
              titleLeading={<Ionicons color={sectionColors.purple} name="people-outline" size={20} />}
            >
              <OptionList style={styles.optionList}>
                {groupTastingsActions.map((action, index) => (
                  <OptionListRow
                    isLast={index === groupTastingsActions.length - 1}
                    key={action.title}
                    leading={
                      <View style={[styles.featureIconWrap, { backgroundColor: action.iconBackground }]}>
                        <Ionicons color={action.iconColor} name={action.icon} size={18} />
                      </View>
                    }
                    onPress={action.onPress}
                    style={styles.featureRow}
                    subtitle={action.description}
                    testID={action.testID}
                    title={action.title}
                  />
                ))}
              </OptionList>
            </TabSectionCard>
          ) : null}

          <TabSectionCard
            description="Split bills and calculate tips quickly"
            descriptionStyle={styles.sectionDescription}
            style={styles.sectionCard}
            title="Bills & Tips"
            titleLeading={<Ionicons color={sectionColors.green} name="cash-outline" size={20} />}
          >
            {showSplitBillOnboarding ? (
              <MoreOnboardingCard
                description="See how to create a bill, assign items to friends, and track who has paid."
                dismissLabel="Got It"
                iconColor={sectionColors.green}
                iconName="cash-outline"
                imageSource={resolveMoreOnboardingImageSource('splitBill')}
                onDismissPress={() => {
                  void handleDismissMoreOnboardingCard('splitBill');
                }}
                onPrimaryPress={() => {
                  trackObservabilityEvent('MORE_ONBOARDING_CARD_CTA_TAPPED', {
                    cardId: 'splitBill',
                    destination: 'Bills',
                    source: 'MiscScreen',
                  });
                  void handleDismissMoreOnboardingCard('splitBill').then((didDismiss) => {
                    if (didDismiss) {
                      navigation.navigate('Bills');
                    }
                  });
                }}
                primaryLabel="Open Bills"
                testID="more-onboarding-split-bill-card"
                title="Split a bill"
              />
            ) : null}
            <OptionList style={styles.optionList}>
              {billsAndTipsActions.map((action, index) => (
                <OptionListRow
                  isLast={index === billsAndTipsActions.length - 1}
                  key={action.title}
                  leading={
                    <View style={[styles.featureIconWrap, { backgroundColor: action.iconBackground }]}>
                      <Ionicons color={action.iconColor} name={action.icon} size={18} />
                    </View>
                  }
                  onPress={action.onPress}
                  style={styles.featureRow}
                  subtitle={action.description}
                  testID={action.testID}
                  title={action.title}
                />
              ))}
            </OptionList>
          </TabSectionCard>

          <TabSectionCard
            description="Get the most out of Yummy Recs"
            descriptionStyle={styles.sectionDescription}
            style={styles.sectionCard}
            title="Tips & Tricks"
            titleLeading={<Ionicons color={sectionColors.yellow} name="bulb-outline" size={20} />}
          >
            <View style={styles.sectionActions}>
              <PageErrorToast errorMessage={onboardingErrorMessage} title="Onboarding update failed" />
              {visibleTips.map((tip) => (
                <View key={tip.title} style={styles.tipCard}>
                  <Text style={styles.tipTitle} variant="label">{tip.title}</Text>
                  <Text style={styles.tipDescription} variant="bodyMd">{tip.description}</Text>
                </View>
              ))}

              {TIPS.length > 3 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const nextExpanded = !expandedTips;
                    trackObservabilityEvent('MISC_TIPS_TOGGLED', {
                      source: 'MiscScreen',
                      expanded: nextExpanded,
                    });
                    setExpandedTips(nextExpanded);
                  }}
                  style={({ pressed }) => [styles.tipsToggle, pressed ? styles.tipsTogglePressed : null]}
                >
                  <Text style={styles.tipsToggleLabel} variant="bodyMdSemiBold">
                    {expandedTips ? 'Show Less' : `Show ${TIPS.length - 3} More Tips`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </TabSectionCard>
        </ScrollView>
      </ScreenContentSection>
    </TabRootScreenScaffold>
  );
}
