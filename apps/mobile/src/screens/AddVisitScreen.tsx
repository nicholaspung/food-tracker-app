import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AddOptionCard } from '../components/add';
import {
  SectionHeader,
  ScreenContentSection,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
} from '../components/shared';
import { isAddOnboardingCardDismissed, useMonthlyUsage } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { scheduleVisitReminderNotification, type VisitReminderMinutes } from '../notifications/notificationInteraction';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Modal, Text } from '../ui';
import type { AddOnboardingCardId } from '../types/auth';

type AddVisitScreenProps = NativeStackScreenProps<RootStackParamList, 'AddVisit'>;
type AddOptionId =
  | 'restaurant-visit'
  | 'food-discovery'
  | 'food-product'
  | 'log-note'
  | 'process-photos'
  | 'manage-notes';

interface AddOptionConfig {
  id: AddOptionId;
  onboardingCardId?: AddOnboardingCardId;
  title: string;
  description: string;
  icon: ComponentProps<typeof AddOptionCard>['icon'];
  iconBackground: string;
  iconColor: string;
  titleAccessory?: ComponentProps<typeof AddOptionCard>['titleAccessory'];
  disabled?: boolean;
}

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
  section: {
    gap: theme.spacing.sm,
  },
  trackActionRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  trackPrimaryAction: {
    flex: 3,
    minWidth: 0,
  },
  reminderAction: {
    flex: 1,
    minHeight: 92,
    minWidth: 0,
  },
  reminderButtonCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  reminderButtonCardPressed: {
    borderColor: theme.colors.border.brand,
  },
  reminderIconWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.text.brand,
    borderRadius: theme.radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  reminderOptions: {
    gap: theme.spacing.sm,
  },
  reminderError: {
    marginTop: theme.spacing.xs,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  quickGridItem: {
    flex: 1,
    minWidth: 0,
  },
}));

export function AddVisitScreen({ navigation }: AddVisitScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [isReminderModalVisible, setIsReminderModalVisible] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [schedulingReminderMinutes, setSchedulingReminderMinutes] = useState<VisitReminderMinutes | null>(null);
  const { actualUser, user } = useAuth();
  const canAccessFoodDiscovery = actualUser?.isAdmin === true || user?.isBetaUser === true;
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({
    viewAsTier: usagePreviewTier,
  });
  const shouldDisableProcessPhotos =
    !isActualAdmin &&
    isDisplayFreeUser &&
    typeof monthlyUsage.snapshot?.remaining.photoUploadsMonthly === 'number' &&
    monthlyUsage.snapshot.remaining.photoUploadsMonthly <= 0;

  const optionColors = {
    restaurant: theme.colors.text.info,
    foodDiscovery: theme.colors.text.brand,
    foodProduct: theme.colors.text.success,
    logNote: theme.colors.text.warning,
    processPhotos: theme.colors.text.brand,
    manageNotes: theme.colors.text.secondary,
    iconOnColor: theme.colors.text.inverse,
  } as const;

  const options: AddOptionConfig[] = [
    {
      id: 'restaurant-visit',
      onboardingCardId: 'trackRestaurantVisit',
      title: 'Track Restaurant Visit',
      description: 'Restaurant, dishes, photos, and ratings',
      icon: 'restaurant-outline',
      iconBackground: optionColors.restaurant,
      iconColor: optionColors.iconOnColor,
    },
    ...(canAccessFoodDiscovery
      ? [{
      id: 'food-discovery',
      title: 'Food Discovery',
      description: 'Find restaurants and scan menus',
          icon: 'compass-outline',
          iconBackground: optionColors.foodDiscovery,
          iconColor: optionColors.iconOnColor,
          titleAccessory: <StatusPill label="Beta" tone="brand" uppercase />,
        } satisfies AddOptionConfig]
      : []),
    {
      id: 'food-product',
      onboardingCardId: 'trackFoodProduct',
      title: 'Track Food Product',
      description: 'Rate a grocery or market item',
      icon: 'flash-outline',
      iconBackground: optionColors.foodProduct,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'log-note',
      onboardingCardId: 'logNote',
      title: 'Log a Note',
      description: 'Save a food or place note',
      icon: 'document-text-outline',
      iconBackground: optionColors.logNote,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'process-photos',
      onboardingCardId: 'processSavedPhotos',
      title: 'Process Saved Photos',
      description: shouldDisableProcessPhotos
        ? "You've reached this month's free photo limit. Photo processing unlocks again next month."
        : 'Rate items from saved photos',
      icon: 'images-outline',
      iconBackground: optionColors.processPhotos,
      iconColor: optionColors.iconOnColor,
      disabled: shouldDisableProcessPhotos,
      titleAccessory: shouldDisableProcessPhotos
        ? <StatusPill label="Limit reached" tone="warning" uppercase />
        : undefined,
    },
    {
      id: 'manage-notes',
      onboardingCardId: 'manageNotes',
      title: 'Manage Notes',
      description: 'View and edit saved notes',
      icon: 'folder-open-outline',
      iconBackground: optionColors.manageNotes,
      iconColor: optionColors.iconOnColor,
    },
  ];
  const getOption = (optionId: AddOptionId) => options.find((option) => option.id === optionId);
  const primaryOption = getOption('restaurant-visit');
  const quickOptions = [
    getOption('food-product'),
    getOption('log-note'),
  ].filter((option): option is AddOptionConfig => Boolean(option));
  const processPhotosOption = getOption('process-photos');
  const foodDiscoveryOption = getOption('food-discovery');
  const manageNotesOption = getOption('manage-notes');

  const renderOptionCard = (
    option: AddOptionConfig,
    cardOptions?: Pick<ComponentProps<typeof AddOptionCard>, 'layout' | 'showTrailing' | 'tone'> & {
      description?: string;
      title?: string;
    },
  ) => (
    <AddOptionCard
      description={cardOptions?.description ?? option.description}
      disabled={option.disabled}
      icon={option.icon}
      iconBackground={option.iconBackground}
      iconColor={option.iconColor}
      key={option.id}
      layout={cardOptions?.layout}
      onPress={() => {
        handleOptionPress(option.id);
      }}
      showTrailing={cardOptions?.showTrailing ?? false}
      testID={`add-option-${option.id}`}
      title={cardOptions?.title ?? option.title}
      titleAccessory={option.titleAccessory}
      tone={cardOptions?.tone}
    />
  );

  const closeReminderModal = () => {
    if (schedulingReminderMinutes) {
      return;
    }
    setIsReminderModalVisible(false);
    setReminderError(null);
  };

  const handleReminderPress = () => {
    setReminderError(null);
    setIsReminderModalVisible(true);
    trackObservabilityEvent('VISIT_REMINDER_ACTION_OPENED', {
      source: 'AddVisitScreen',
    });
  };

  const scheduleReminder = async (minutes: VisitReminderMinutes) => {
    setReminderError(null);
    setSchedulingReminderMinutes(minutes);

    const result = await scheduleVisitReminderNotification(minutes);
    setSchedulingReminderMinutes(null);

    if (result.status === 'scheduled') {
      setIsReminderModalVisible(false);
      trackObservabilityEvent('VISIT_REMINDER_ACTION_SCHEDULED', {
        minutes,
        source: 'AddVisitScreen',
      });
      return;
    }

    setReminderError(result.errorMessage ?? 'Could not schedule the reminder. Try again in a moment.');
  };

  const handleOptionPress = (optionId: AddOptionId) => {
    const selectedOption = options.find((option) => option.id === optionId);
    if (selectedOption?.disabled) {
      trackObservabilityEvent('ADD_VISIT_OPTION_DISABLED_SELECTED', {
        source: 'AddVisitScreen',
        option: optionId,
        reason: optionId === 'process-photos' ? 'photo_upload_limit_reached' : 'disabled',
      });
      return;
    }

    const normalizedOption =
      optionId === 'restaurant-visit'
        ? 'restaurant_visit'
        : optionId === 'food-discovery'
          ? 'food_discovery'
        : optionId === 'food-product'
          ? 'food_product'
          : optionId === 'process-photos'
            ? 'process_photos'
            : optionId === 'log-note'
              ? 'log_note'
              : 'manage_notes';

    trackObservabilityEvent('ADD_VISIT_OPTION_SELECTED', {
      source: 'AddVisitScreen',
      option: normalizedOption,
    });

    if (
      selectedOption?.onboardingCardId &&
      !isAddOnboardingCardDismissed(user?.mobileOnboardingState, selectedOption.onboardingCardId)
    ) {
      navigation.navigate('AddFeatureOnboarding', { cardId: selectedOption.onboardingCardId });
      return;
    }

    if (optionId === 'restaurant-visit') {
      trackObservabilityEvent('Visit Creation Started', { source: 'AddVisitScreen' });
      trackProductEvent('tracking.entry_started', {
        entryType: 'restaurant_visit',
        source: 'add_tab',
        hasPhoto: false,
        completed: false,
      });
      navigation.navigate('CreateVisit');
      return;
    }

    if (optionId === 'food-discovery') {
      trackObservabilityEvent('FOOD_DISCOVERY_STARTED', { source: 'AddVisitScreen' });
      navigation.navigate('RestaurantDiscovery');
      return;
    }

    if (optionId === 'food-product') {
      trackObservabilityEvent('Food Product Started', { source: 'AddVisitScreen' });
      trackProductEvent('tracking.entry_started', {
        entryType: 'food_product',
        source: 'add_tab',
        hasPhoto: false,
        completed: false,
      });
      navigation.navigate('FoodProduct');
      return;
    }

    if (optionId === 'process-photos') {
      trackObservabilityEvent('Photo Processing Started', { source: 'AddVisitScreen' });
      trackProductEvent('tracking.entry_started', {
        entryType: 'photo_batch',
        source: 'add_tab',
        hasPhoto: true,
        completed: false,
      });
      navigation.navigate('ProcessPhotos');
      return;
    }

    if (optionId === 'log-note') {
      trackObservabilityEvent('Note Creation Started', { source: 'AddVisitScreen' });
      trackProductEvent('tracking.entry_started', {
        entryType: 'note',
        source: 'add_tab',
        hasPhoto: false,
        completed: false,
      });
      navigation.navigate('NoteEditor');
      return;
    }

    trackObservabilityEvent('Notes Opened', { source: 'AddVisitScreen' });
    navigation.navigate('Notes');
  };

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      keyboardAware={false}
      scroll={false}
      scrollUnderlayColor={theme.colors.background.app}
      testID="add-visit-selector"
    >
      <TabBrandHeader
        showBrand={false}
        subtitle="Choose how you want to track your food"
        title="Add New"
        titleVariant="displayMd"
      />

      <ScreenContentSection fill testID="add-screen-content-section">
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          style={styles.bodyScroll}
        >
          {primaryOption ? (
            <View style={styles.section}>
              <SectionHeader title="Track" />
              <View style={styles.trackActionRow}>
                <View style={styles.trackPrimaryAction}>
                  {renderOptionCard(primaryOption)}
                </View>
                <Pressable
                  accessibilityLabel="Schedule visit reminder"
                  accessibilityRole="button"
                  onPress={handleReminderPress}
                  style={styles.reminderAction}
                  testID="add-option-visit-reminder"
                >
                  {({ pressed }) => (
                    <View style={[styles.reminderButtonCard, pressed ? styles.reminderButtonCardPressed : null]}>
                      <View style={styles.reminderIconWrap}>
                        <Ionicons color={theme.colors.text.inverse} name="alarm-outline" size={22} />
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="Quick Add" />
            <View style={styles.quickGrid}>
              {quickOptions.map((option) => (
                <View key={option.id} style={styles.quickGridItem}>
                  {renderOptionCard(option, {
                    description: option.id === 'food-product' ? 'Grocery or market item' : 'Food or place note',
                    layout: 'compact',
                    showTrailing: false,
                    title: option.id === 'food-product' ? 'Food Product' : 'Note',
                  })}
                </View>
              ))}
            </View>
          </View>

          {processPhotosOption ? (
            <View style={styles.section}>
              <SectionHeader title="Use Photos" />
              {renderOptionCard(processPhotosOption)}
            </View>
          ) : null}

          {foodDiscoveryOption ? (
            <View style={styles.section}>
              <SectionHeader title="Explore" />
              {renderOptionCard(foodDiscoveryOption)}
            </View>
          ) : null}

          {manageNotesOption ? (
            <View style={styles.section}>
              <SectionHeader title="Manage" />
              {renderOptionCard(manageNotesOption, { tone: 'muted' })}
            </View>
          ) : null}
        </ScrollView>
      </ScreenContentSection>
      <Modal
        description="Choose when to get a one-time reminder to start a restaurant visit."
        onRequestClose={closeReminderModal}
        secondaryAction={{
          accessibilityLabel: 'Cancel visit reminder',
          disabled: Boolean(schedulingReminderMinutes),
          label: 'Cancel',
          onPress: closeReminderModal,
          testID: 'visit-reminder-cancel',
        }}
        testID="visit-reminder-modal"
        title="Remind me to track this visit"
        visible={isReminderModalVisible}
      >
        <View style={styles.reminderOptions}>
          {VISIT_REMINDER_OPTIONS.map((option) => (
            <Button
              accessibilityLabel={`Remind me in ${option.accessibilityLabel}`}
              disabled={Boolean(schedulingReminderMinutes)}
              key={option.minutes}
              label={option.label}
              loading={schedulingReminderMinutes === option.minutes}
              onPress={() => {
                void scheduleReminder(option.minutes);
              }}
              testID={`visit-reminder-option-${option.minutes}`}
              variant="secondary"
            />
          ))}
        </View>
        {reminderError ? (
          <Text style={styles.reminderError} tone="danger" variant="bodySm">
            {reminderError}
          </Text>
        ) : null}
      </Modal>
    </TabRootScreenScaffold>
  );
}

const VISIT_REMINDER_OPTIONS: {
  minutes: VisitReminderMinutes;
  label: string;
  accessibilityLabel: string;
}[] = [
  {
    minutes: 15,
    label: '15 min',
    accessibilityLabel: '15 minutes',
  },
  {
    minutes: 30,
    label: '30 min',
    accessibilityLabel: '30 minutes',
  },
  {
    minutes: 60,
    label: '1 hr',
    accessibilityLabel: '1 hour',
  },
];
