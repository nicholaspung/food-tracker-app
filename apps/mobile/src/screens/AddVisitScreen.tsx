import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  FeatureActionListRow,
  OptionList,
  ScreenContentSection,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
  TabSectionCard,
} from '../components/shared';
import { isAddOnboardingCardDismissed, useMonthlyUsage } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  getVisitReminderNotificationStatus,
  scheduleVisitReminderNotification,
  type VisitReminderMinutes,
} from '../notifications/notificationInteraction';
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
  icon: ComponentProps<typeof FeatureActionListRow>['iconName'];
  iconBackground: string;
  iconColor: string;
  titleAccessory?: ComponentProps<typeof FeatureActionListRow>['titleAccessory'];
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
  reminderOptions: {
    gap: theme.spacing.sm,
  },
  reminderStatus: {
    marginTop: theme.spacing.xs,
  },
  reminderError: {
    marginTop: theme.spacing.xs,
  },
}));

export function AddVisitScreen({ navigation }: AddVisitScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [isReminderModalVisible, setIsReminderModalVisible] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderModalState, setReminderModalState] = useState<
    'checking' | 'available' | 'alreadyScheduled' | 'confirmed'
  >('available');
  const [reminderConfirmation, setReminderConfirmation] = useState<string | null>(null);
  const [schedulingReminderMinutes, setSchedulingReminderMinutes] = useState<VisitReminderMinutes | null>(null);
  const { actualUser, user } = useAuth();
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
    restaurantSoft: theme.colors.status.infoBg,
    reminder: theme.colors.text.brand,
    reminderSoft: theme.colors.background.muted,
    foodDiscovery: theme.colors.text.brand,
    foodDiscoverySoft: theme.colors.background.muted,
    foodProduct: theme.colors.text.success,
    foodProductSoft: theme.colors.status.successBg,
    logNote: theme.colors.text.warning,
    logNoteSoft: theme.colors.status.warningBg,
    processPhotos: theme.colors.text.brand,
    processPhotosSoft: theme.colors.background.muted,
    manageNotes: theme.colors.text.secondary,
    manageNotesSoft: theme.colors.background.muted,
  } as const;

  const options: AddOptionConfig[] = [
    {
      id: 'restaurant-visit',
      onboardingCardId: 'trackRestaurantVisit',
      title: 'Track Restaurant Visit',
      description: 'Restaurant, dishes, photos, and ratings',
      icon: 'restaurant-outline',
      iconBackground: optionColors.restaurantSoft,
      iconColor: optionColors.restaurant,
    },
    {
      id: 'food-discovery',
      title: 'Food Discovery',
      description: 'Find restaurants and scan menus',
      icon: 'compass-outline',
      iconBackground: optionColors.foodDiscoverySoft,
      iconColor: optionColors.foodDiscovery,
    },
    {
      id: 'food-product',
      onboardingCardId: 'trackFoodProduct',
      title: 'Track Food Product',
      description: 'Rate a grocery or market item',
      icon: 'flash-outline',
      iconBackground: optionColors.foodProductSoft,
      iconColor: optionColors.foodProduct,
    },
    {
      id: 'log-note',
      onboardingCardId: 'logNote',
      title: 'Log a Note',
      description: 'Save a food or place note',
      icon: 'document-text-outline',
      iconBackground: optionColors.logNoteSoft,
      iconColor: optionColors.logNote,
    },
    {
      id: 'process-photos',
      onboardingCardId: 'processSavedPhotos',
      title: 'Process Saved Photos',
      description: shouldDisableProcessPhotos
        ? "You've reached this month's free photo limit. Photo processing unlocks again next month."
        : 'Rate items from saved photos',
      icon: 'images-outline',
      iconBackground: optionColors.processPhotosSoft,
      iconColor: optionColors.processPhotos,
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
      iconBackground: optionColors.manageNotesSoft,
      iconColor: optionColors.manageNotes,
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

  const renderOptionRow = (
    option: AddOptionConfig,
    rowOptions?: {
      description?: string;
      title?: string;
      isLast?: boolean;
    },
  ) => (
    <FeatureActionListRow
      description={rowOptions?.description ?? option.description}
      disabled={option.disabled}
      iconBackground={option.iconBackground}
      iconColor={option.iconColor}
      iconName={option.icon}
      isLast={rowOptions?.isLast}
      key={option.id}
      onPress={() => {
        handleOptionPress(option.id);
      }}
      testID={`add-option-${option.id}`}
      title={rowOptions?.title ?? option.title}
      titleAccessory={option.titleAccessory}
    />
  );

  const closeReminderModal = () => {
    if (schedulingReminderMinutes) {
      return;
    }
    setIsReminderModalVisible(false);
  };

  const handleReminderPress = () => {
    setReminderError(null);
    setReminderConfirmation(null);
    setReminderModalState('checking');
    setIsReminderModalVisible(true);
    trackObservabilityEvent('VISIT_REMINDER_ACTION_OPENED', {
      source: 'AddVisitScreen',
    });

    void getVisitReminderNotificationStatus().then((result) => {
      if (result.status === 'scheduled') {
        setReminderModalState('alreadyScheduled');
        return;
      }

      setReminderModalState('available');
      if (result.status === 'failed' || result.status === 'unavailable') {
        setReminderError(result.errorMessage ?? 'Could not check scheduled reminders. Try again in a moment.');
      }
    });
  };

  const scheduleReminder = async (minutes: VisitReminderMinutes) => {
    setReminderError(null);
    setSchedulingReminderMinutes(minutes);

    const result = await scheduleVisitReminderNotification(minutes);
    setSchedulingReminderMinutes(null);

    if (result.status === 'scheduled') {
      setReminderConfirmation(`Reminder scheduled for ${formatReminderDelay(minutes)} from now.`);
      setReminderModalState('confirmed');
      trackObservabilityEvent('VISIT_REMINDER_ACTION_SCHEDULED', {
        minutes,
        source: 'AddVisitScreen',
      });
      return;
    }

    if (result.status === 'already_scheduled') {
      setReminderError(null);
      setReminderModalState('alreadyScheduled');
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
            <TabSectionCard
              description="Restaurant visits, reminders, dishes, photos, and ratings"
              descriptionStyle={styles.sectionDescription}
              style={styles.sectionCard}
              title="Track"
              titleLeading={<Ionicons color={optionColors.restaurant} name="restaurant-outline" size={20} />}
            >
              <OptionList style={styles.optionList}>
                {renderOptionRow(primaryOption)}
                <FeatureActionListRow
                  description="Get a one-time prompt to start a visit"
                  iconBackground={optionColors.reminderSoft}
                  iconColor={optionColors.reminder}
                  iconName="alarm-outline"
                  isLast
                  onPress={handleReminderPress}
                  testID="add-option-visit-reminder"
                  title="Visit Reminder"
                />
              </OptionList>
            </TabSectionCard>
          ) : null}

          <TabSectionCard
            description="Save simple entries without creating a restaurant visit"
            descriptionStyle={styles.sectionDescription}
            style={styles.sectionCard}
            title="Quick Add"
            titleLeading={<Ionicons color={optionColors.foodProduct} name="flash-outline" size={20} />}
          >
            <OptionList style={styles.optionList}>
              {quickOptions.map((option) =>
                renderOptionRow(option, {
                  description: option.id === 'food-product' ? 'Grocery or market item' : 'Food or place note',
                  isLast: option.id === quickOptions[quickOptions.length - 1]?.id,
                  title: option.id === 'food-product' ? 'Food Product' : 'Note',
                }),
              )}
            </OptionList>
          </TabSectionCard>

          {processPhotosOption ? (
            <TabSectionCard
              description="Turn saved food photos into tracked entries"
              descriptionStyle={styles.sectionDescription}
              style={styles.sectionCard}
              title="Use Photos"
              titleLeading={<Ionicons color={optionColors.processPhotos} name="images-outline" size={20} />}
            >
              <OptionList style={styles.optionList}>
                {renderOptionRow(processPhotosOption, { isLast: true })}
              </OptionList>
            </TabSectionCard>
          ) : null}

          {foodDiscoveryOption ? (
            <TabSectionCard
              description="Find restaurants and scan menus"
              descriptionStyle={styles.sectionDescription}
              style={styles.sectionCard}
              title="Explore"
              titleLeading={<Ionicons color={optionColors.foodDiscovery} name="compass-outline" size={20} />}
            >
              <OptionList style={styles.optionList}>
                {renderOptionRow(foodDiscoveryOption, { isLast: true })}
              </OptionList>
            </TabSectionCard>
          ) : null}

          {manageNotesOption ? (
            <TabSectionCard
              description="Browse and update saved notes"
              descriptionStyle={styles.sectionDescription}
              style={styles.sectionCard}
              title="Manage"
              titleLeading={<Ionicons color={optionColors.manageNotes} name="folder-open-outline" size={20} />}
            >
              <OptionList style={styles.optionList}>
                {renderOptionRow(manageNotesOption, { isLast: true })}
              </OptionList>
            </TabSectionCard>
          ) : null}
        </ScrollView>
      </ScreenContentSection>
      <Modal
        description={
          reminderModalState === 'confirmed' || reminderModalState === 'alreadyScheduled'
            ? undefined
            : 'Choose when to get a one-time reminder to start a restaurant visit.'
        }
        onRequestClose={closeReminderModal}
        secondaryAction={{
          accessibilityLabel:
            reminderModalState === 'confirmed' || reminderModalState === 'alreadyScheduled'
              ? 'Done'
              : 'Cancel visit reminder',
          disabled: Boolean(schedulingReminderMinutes),
          label:
            reminderModalState === 'confirmed' || reminderModalState === 'alreadyScheduled'
              ? 'Done'
              : 'Cancel',
          onPress: closeReminderModal,
          testID: 'visit-reminder-cancel',
        }}
        testID="visit-reminder-modal"
        title="Remind me to track this visit"
        visible={isReminderModalVisible}
      >
        {reminderModalState === 'checking' ? (
          <Text style={styles.reminderStatus} tone="secondary" variant="bodyMd">
            Checking scheduled reminders...
          </Text>
        ) : null}
        {reminderModalState === 'alreadyScheduled' ? (
          <Text style={styles.reminderStatus} tone="secondary" variant="bodyMd">
            You already have a visit reminder scheduled.
          </Text>
        ) : null}
        {reminderModalState === 'confirmed' ? (
          <Text style={styles.reminderStatus} tone="secondary" variant="bodyMd">
            {reminderConfirmation}
          </Text>
        ) : null}
        {reminderModalState === 'available' ? (
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
        ) : null}
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

function formatReminderDelay(minutes: VisitReminderMinutes): string {
  return minutes === 60 ? '1 hour' : `${minutes} minutes`;
}
