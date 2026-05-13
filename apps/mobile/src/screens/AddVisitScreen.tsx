import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { ScrollView } from 'react-native';

import { AddOptionCard } from '../components/add';
import {
  ScreenContentSection,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
} from '../components/shared';
import { isAddOnboardingCardDismissed, useMonthlyUsage } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
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
}));

export function AddVisitScreen({ navigation }: AddVisitScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
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
      description: 'Full experience with restaurant, menu items, and ratings',
      icon: 'restaurant-outline',
      iconBackground: optionColors.restaurant,
      iconColor: optionColors.iconOnColor,
    },
    ...(canAccessFoodDiscovery
      ? [{
          id: 'food-discovery',
          title: 'Food Discovery',
          description: 'Find restaurants abroad, scan menus, and add menu items',
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
      description: 'Rate a grocery, convenience-store, or market item',
      icon: 'flash-outline',
      iconBackground: optionColors.foodProduct,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'log-note',
      onboardingCardId: 'logNote',
      title: 'Log a Note',
      description: 'Jot down notes about food/places for later',
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
        : 'Upload multiple photos and rate each one',
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
      description: 'View, edit, or delete your saved notes',
      icon: 'folder-open-outline',
      iconBackground: optionColors.manageNotes,
      iconColor: optionColors.iconOnColor,
    },
  ];

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
      navigation.navigate('FoodProduct');
      return;
    }

    if (optionId === 'process-photos') {
      trackObservabilityEvent('Photo Processing Started', { source: 'AddVisitScreen' });
      navigation.navigate('ProcessPhotos');
      return;
    }

    if (optionId === 'log-note') {
      trackObservabilityEvent('Note Creation Started', { source: 'AddVisitScreen' });
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
          {options.map((option) => (
            <AddOptionCard
              description={option.description}
              disabled={option.disabled}
              icon={option.icon}
              iconBackground={option.iconBackground}
              iconColor={option.iconColor}
              key={option.id}
              onPress={() => {
                handleOptionPress(option.id);
              }}
              testID={`add-option-${option.id}`}
              title={option.title}
              titleAccessory={option.titleAccessory}
            />
          ))}
        </ScrollView>
      </ScreenContentSection>
    </TabRootScreenScaffold>
  );
}
