import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  FeatureActionListRow,
  OptionList,
  ScreenContentSection,
  TabBrandHeader,
  TabRootScreenScaffold,
  TabSectionCard,
} from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  getMoreFeatureSignalSummary,
  isMoreOnboardingCardDismissed,
  moreFeatureSignalQueryKeys,
  type NotificationSignalIndicator,
} from '../features';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import type { MoreOnboardingCardId } from '../types/auth';
import { Text } from '../ui';

type MiscScreenProps = NativeStackScreenProps<RootStackParamList, 'Misc'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MoreFeatureDestination = 'Lists' | 'Bills' | 'TipCalculator';

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
    title: 'Turn Tastings into Bills',
    description:
      'After a group tasting is completed, open the results and tap "Create Bill from Session" to start a bill with the session name and tasters already filled in.',
  },
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
      'Connect with friends to see their food recommendations in your home feed, compare shared Want to Try matches, and save their recommendations to your own list.',
  },
  {
    title: 'Organize with Lists',
    description:
      'Use your Want to Try list as a quick restaurant bookmark, then create focused lists for favorites, trips, or shared recommendations.',
  },
  {
    title: 'Split Bills Easily',
    description:
      'Use the Bill Splitter to divide bills evenly or by item, assign friends or custom participants, and track who still has a balance due.',
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
  sectionActions: {
    gap: theme.spacing.sm,
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
  signalDot: {
    backgroundColor: theme.colors.fill.danger,
    borderRadius: theme.radii.pill,
    height: 10,
    width: 10,
  },
  signalCountDot: {
    alignItems: 'center',
    backgroundColor: theme.colors.fill.danger,
    borderRadius: theme.radii.pill,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
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

function MoreFeatureSignalIndicator({
  accessibilityLabelPrefix,
  indicator,
  testIDPrefix,
}: {
  accessibilityLabelPrefix: string;
  indicator: NotificationSignalIndicator;
  testIDPrefix: string;
}) {
  const styles = useStyles();

  if (indicator.kind === 'none') {
    return null;
  }

  if (indicator.kind === 'dot') {
    return (
      <View
        accessibilityLabel={accessibilityLabelPrefix}
        style={styles.signalDot}
        testID={`${testIDPrefix}-signal-dot`}
      />
    );
  }

  return (
    <View
      accessibilityLabel={`${indicator.count} ${accessibilityLabelPrefix}`}
      style={styles.signalCountDot}
      testID={`${testIDPrefix}-signal-count-dot`}
    >
      <Text tone="inverse" variant="captionStrong">
        {indicator.count > 9 ? '9+' : indicator.count}
      </Text>
    </View>
  );
}

export function MiscScreen({ navigation }: MiscScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const [expandedTips, setExpandedTips] = useState(false);
  const featureSignalQuery = useQuery({
    queryKey: moreFeatureSignalQueryKeys.summary,
    queryFn: ({ signal }) => getMoreFeatureSignalSummary({ signal }),
    enabled: Boolean(user?.id),
  });
  const tastingSessionSignalIndicator =
    featureSignalQuery.data?.tastingSessions.indicator ?? { kind: 'none' };
  const billOwedSignalIndicator = featureSignalQuery.data?.bills.indicator ?? { kind: 'none' };

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

  function navigateToMoreFeature(cardId: MoreOnboardingCardId, destination: MoreFeatureDestination) {
    if (isMoreOnboardingCardDismissed(user?.mobileOnboardingState, cardId)) {
      navigation.navigate(destination);
      return;
    }

    navigation.navigate('MoreFeatureOnboarding', { cardId });
  }

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
        navigateToMoreFeature('lists', 'Lists');
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
        navigateToMoreFeature('splitBill', 'Bills');
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
        navigateToMoreFeature('tipCalculator', 'TipCalculator');
      },
      testID: 'feature-tip-calculator',
    },
  ];

  const visibleTips = expandedTips ? TIPS : TIPS.slice(0, 3);

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
            <OptionList style={styles.optionList}>
              {restaurantListActions.map((action, index) => (
                <FeatureActionListRow
                  description={action.description}
                  iconBackground={action.iconBackground}
                  iconColor={action.iconColor}
                  iconName={action.icon}
                  isLast={index === restaurantListActions.length - 1}
                  key={action.title}
                  onPress={action.onPress}
                  testID={action.testID}
                  title={action.title}
                />
              ))}
            </OptionList>
          </TabSectionCard>

          <TabSectionCard
            description="Organize group food tasting sessions and rate together"
            descriptionStyle={styles.sectionDescription}
            style={styles.sectionCard}
            title="Group Tastings"
            titleLeading={<Ionicons color={sectionColors.purple} name="people-outline" size={20} />}
          >
            <OptionList style={styles.optionList}>
              {groupTastingsActions.map((action, index) => (
                <FeatureActionListRow
                  description={action.description}
                  iconBackground={action.iconBackground}
                  iconColor={action.iconColor}
                  iconName={action.icon}
                  isLast={index === groupTastingsActions.length - 1}
                  key={action.title}
                  onPress={action.onPress}
                  rightAccessory={
                    tastingSessionSignalIndicator.kind === 'none' ? undefined : (
                      <MoreFeatureSignalIndicator
                        accessibilityLabelPrefix={
                          tastingSessionSignalIndicator.kind === 'count'
                            ? `pending tasting ${tastingSessionSignalIndicator.count === 1 ? 'invite' : 'invites'}`
                            : 'Group tasting activity'
                        }
                        indicator={tastingSessionSignalIndicator}
                        testIDPrefix="tasting"
                      />
                    )
                  }
                  testID={action.testID}
                  title={action.title}
                />
              ))}
            </OptionList>
          </TabSectionCard>

          <TabSectionCard
            description="Split bills and calculate tips quickly"
            descriptionStyle={styles.sectionDescription}
            style={styles.sectionCard}
            title="Bills & Tips"
            titleLeading={<Ionicons color={sectionColors.green} name="cash-outline" size={20} />}
          >
            <OptionList style={styles.optionList}>
              {billsAndTipsActions.map((action, index) => (
                <FeatureActionListRow
                  description={action.description}
                  iconBackground={action.iconBackground}
                  iconColor={action.iconColor}
                  iconName={action.icon}
                  isLast={index === billsAndTipsActions.length - 1}
                  key={action.title}
                  onPress={action.onPress}
                  rightAccessory={
                    action.testID === 'feature-bill-splitter' && billOwedSignalIndicator.kind !== 'none' ? (
                      <MoreFeatureSignalIndicator
                        accessibilityLabelPrefix={`active ${billOwedSignalIndicator.kind === 'count' && billOwedSignalIndicator.count === 1 ? 'bill' : 'bills'} with a balance due`}
                        indicator={billOwedSignalIndicator}
                        testIDPrefix="bill-owed"
                      />
                    ) : undefined
                  }
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
