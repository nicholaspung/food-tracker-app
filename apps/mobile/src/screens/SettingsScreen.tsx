import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  SectionCard,
  SegmentedControl,
  Skeleton,
  VisibilityOptionSelector,
} from '../components/shared';
import {
  getCollectionRecord,
  getNotificationPreferences,
  mapUserSettings,
  settingsQueryKeys,
  useSettingsPreferencesWrites,
  type HomeFeedDefaultMode,
  type HomeFeedDefaultSort,
  type HomeFeedDefaultTypeFilter,
  type ListVisibility,
  type RestaurantVisibility,
  type UserSettings,
  type UserSettingsRecord,
  type VisitVisibility,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme, type ThemePreference } from '../theme';
import { Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const appearanceOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const satisfies readonly { label: string; value: ThemePreference }[];

const homeFeedModeOptions = [
  { label: 'Mine', value: 'mine' },
  { label: 'Friends', value: 'friends' },
] as const satisfies readonly { label: string; value: HomeFeedDefaultMode }[];

const homeFeedTypeOptions = [
  { label: 'All', value: 'all' },
  { label: 'Visits', value: 'visits' },
  { label: 'Food Products', value: 'food-products' },
] as const satisfies readonly { label: string; value: HomeFeedDefaultTypeFilter }[];

const homeFeedSortOptions = [
  { label: 'Date Created', value: 'created' },
  { label: 'Date Tracked', value: 'tracked' },
] as const satisfies readonly { label: string; value: HomeFeedDefaultSort }[];

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  optionList: {
    gap: theme.spacing.xs,
  },
}));

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const settingsWrites = useSettingsPreferencesWrites();
  const [visitVisibility, setVisitVisibility] = useState<VisitVisibility>('friends');
  const [restaurantVisibility, setRestaurantVisibility] = useState<RestaurantVisibility>('private');
  const [listVisibility, setListVisibility] = useState<ListVisibility>('friends');
  const [homeFeedMode, setHomeFeedMode] = useState<HomeFeedDefaultMode>('mine');
  const [homeFeedTypeFilter, setHomeFeedTypeFilter] = useState<HomeFeedDefaultTypeFilter>('visits');
  const [homeFeedSort, setHomeFeedSort] = useState<HomeFeedDefaultSort>('created');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const settingsQuery = useQuery({
    enabled: Boolean(user?.id),
    queryKey: settingsQueryKeys.detail(user?.id),
    queryFn: async ({ signal }): Promise<UserSettings> => {
      if (!user?.id) {
        throw new Error('Authentication required.');
      }

      const [record, notificationPreferences] = await Promise.all([
        getCollectionRecord<UserSettingsRecord>('users', user.id, { signal }),
        getNotificationPreferences(user.id, { signal }),
      ]);
      return {
        ...mapUserSettings(record),
        notificationPreferences,
      };
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setVisitVisibility(settingsQuery.data.visitVisibility);
    setRestaurantVisibility(settingsQuery.data.restaurantVisibility);
    setListVisibility(settingsQuery.data.listVisibility);
    setHomeFeedMode(settingsQuery.data.homeFeedMode);
    setHomeFeedTypeFilter(settingsQuery.data.homeFeedTypeFilter);
    setHomeFeedSort(settingsQuery.data.homeFeedSort);
  }, [settingsQuery.data]);

  const hasPendingChanges = useMemo(() => {
    if (!settingsQuery.data) {
      return false;
    }

    return (
      visitVisibility !== settingsQuery.data.visitVisibility ||
      restaurantVisibility !== settingsQuery.data.restaurantVisibility ||
      listVisibility !== settingsQuery.data.listVisibility ||
      homeFeedMode !== settingsQuery.data.homeFeedMode ||
      homeFeedTypeFilter !== settingsQuery.data.homeFeedTypeFilter ||
      homeFeedSort !== settingsQuery.data.homeFeedSort
    );
  }, [
    homeFeedMode,
    homeFeedSort,
    homeFeedTypeFilter,
    listVisibility,
    restaurantVisibility,
    settingsQuery.data,
    visitVisibility,
  ]);

  const handleSaveSettings = async () => {
    if (!user?.id) {
      trackObservabilityEvent('SETTINGS_SAVE_FAILED', {
        source: 'SettingsScreen',
        error: 'missing_user',
      });
      setErrorMessage('Authentication required.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_SAVE_STARTED', {
      source: 'SettingsScreen',
      userId: user.id,
      visitVisibility,
      restaurantVisibility,
      listVisibility,
      homeFeedMode,
      homeFeedTypeFilter,
      homeFeedSort,
      hasPendingChanges,
      isOnline,
    });
    setIsSaving(true);

    try {
      const saveResult = await settingsWrites.saveSettingsPreferences({
        userId: user.id,
        visitVisibility,
        restaurantVisibility,
        listVisibility,
        homeFeedMode,
        homeFeedTypeFilter,
        homeFeedSort,
        notificationPreferences: settingsQuery.data?.notificationPreferences ?? {
          notificationBillsEnabled: true,
          notificationMonthlyFriendsActivityEnabled: true,
          notificationTastingInvitesEnabled: true,
        },
      });

      if (saveResult.status === 'queued') {
        trackObservabilityEvent('SETTINGS_SAVE_SUCCEEDED', {
          source: 'SettingsScreen',
          userId: user.id,
          visitVisibility,
          restaurantVisibility,
          listVisibility,
          homeFeedMode,
          homeFeedTypeFilter,
          homeFeedSort,
          queued: true,
        });
        setSuccessMessage('Settings saved offline and will sync when you reconnect.');
        return;
      }

      trackObservabilityEvent('SETTINGS_SAVE_SUCCEEDED', {
        source: 'SettingsScreen',
        userId: user.id,
        visitVisibility,
        restaurantVisibility,
        listVisibility,
        homeFeedMode,
        homeFeedTypeFilter,
        homeFeedSort,
        queued: false,
      });
      setSuccessMessage('Settings saved successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update settings.';
      setErrorMessage(message);
      trackObservabilityEvent('SETTINGS_SAVE_FAILED', {
        source: 'SettingsScreen',
        userId: user.id,
        isOnline,
        error: message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectVisitVisibility = (value: VisitVisibility) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_VISIT_VISIBILITY_CHANGED', {
      source: 'SettingsScreen',
      previousValue: visitVisibility,
      nextValue: value,
    });
    setVisitVisibility(value);
  };

  const handleSelectRestaurantVisibility = (value: RestaurantVisibility) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_RESTAURANT_VISIBILITY_CHANGED', {
      source: 'SettingsScreen',
      previousValue: restaurantVisibility,
      nextValue: value,
    });
    setRestaurantVisibility(value);
  };

  const handleSelectListVisibility = (value: ListVisibility) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_LIST_VISIBILITY_CHANGED', {
      source: 'SettingsScreen',
      previousValue: listVisibility,
      nextValue: value,
    });
    setListVisibility(value);
  };

  const handleSelectHomeFeedMode = (value: HomeFeedDefaultMode) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_HOME_FEED_MODE_CHANGED', {
      source: 'SettingsScreen',
      previousValue: homeFeedMode,
      nextValue: value,
    });
    setHomeFeedMode(value);
  };

  const handleSelectHomeFeedTypeFilter = (value: HomeFeedDefaultTypeFilter) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_HOME_FEED_TYPE_FILTER_CHANGED', {
      source: 'SettingsScreen',
      previousValue: homeFeedTypeFilter,
      nextValue: value,
    });
    setHomeFeedTypeFilter(value);
  };

  const handleSelectHomeFeedSort = (value: HomeFeedDefaultSort) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    trackObservabilityEvent('SETTINGS_HOME_FEED_SORT_CHANGED', {
      source: 'SettingsScreen',
      previousValue: homeFeedSort,
      nextValue: value,
    });
    setHomeFeedSort(value);
  };

  const handleSelectAppearance = (value: ThemePreference) => {
    trackObservabilityEvent('SETTINGS_APPEARANCE_CHANGED', {
      source: 'SettingsScreen',
      previousValue: theme.preference,
      nextValue: value,
    });
    theme.setPreference(value);
  };

  const appearanceSection = (
    <SectionCard
      description="Choose how Yummy Recs looks on this device."
      title="Appearance"
    >
      <SegmentedControl
        getOptionTestID={(value) => `settings-appearance-${value}`}
        onChange={handleSelectAppearance}
        options={appearanceOptions}
        value={theme.preference}
      />
    </SectionCard>
  );

  const canShowSaveSettingsAction = !settingsQuery.isLoading && !settingsQuery.isError;
  const saveSettingsAction = canShowSaveSettingsAction
    ? {
        disabled: !hasPendingChanges || isSaving,
        label: isSaving ? 'Saving...' : 'Save Settings',
        loading: isSaving,
        onPress: () => {
          void handleSaveSettings();
        },
        testID: 'settings-save-button',
      }
    : undefined;

  const visitVisibilityDescriptions = useMemo(
    () =>
      ({
        friends: 'Friends can see your visits and the dishes you rated.',
        private: 'Only you can see your visits and ratings.',
      }) as const,
    [],
  );

  const restaurantVisibilityDescriptions = useMemo(
    () =>
      ({
        private: 'Only you can see restaurants you add.',
        friends: 'Friends can see restaurants you add.',
      }) as const,
    [],
  );

  const listVisibilityDescriptions = useMemo(
    () =>
      ({
        private: 'Only you can see lists you create.',
        friends: 'Friends can see lists you create.',
      }) as const,
    [],
  );

  if (!user?.id) {
    return (
      <BackHeaderScreenScaffold
        headerScrollMode="fixed"
        onBackPress={() => {
          navigation.navigate('Profile');
        }}
        subtitle="Set Home and content defaults"
        testID="settings-screen"
        title="Settings"
      >
        <View style={styles.body}>
          {appearanceSection}
          <PageErrorToast
            errorMessage="Please sign in again to view settings."
            title="Settings unavailable"
          />
          <EmptyState description="Please sign in again to view settings." title="Settings unavailable" />
        </View>
      </BackHeaderScreenScaffold>
    );
  }

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onBackPress={() => {
        navigation.navigate('Profile');
      }}
      primaryAction={saveSettingsAction}
      subtitle="Set Home and content defaults"
      testID="settings-screen"
      title="Settings"
    >
      <View style={styles.body}>
        {appearanceSection}

        {settingsQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        <PageErrorToast
          errorMessage={settingsQuery.isError ? 'Could not load settings.' : null}
          title="Settings unavailable"
          actionLabel="Retry"
          onAction={() => {
            void settingsQuery.refetch();
          }}
        />

        {settingsQuery.isError ? (
          <EmptyState
            description="Could not load settings."
            actionLabel="Retry"
            onAction={() => {
              void settingsQuery.refetch();
            }}
            title="Settings unavailable"
          />
        ) : null}

        {!settingsQuery.isLoading && !settingsQuery.isError ? (
          <>
            <SectionCard
              description="Choose how your Home tab opens when you start a new app session."
              title="Default Home Feed"
            >
              <View style={styles.optionList}>
                <Text tone="muted" variant="label">
                  Feed
                </Text>
                <SegmentedControl
                  getOptionTestID={(value) => `settings-home-feed-mode-${value}`}
                  onChange={handleSelectHomeFeedMode}
                  options={homeFeedModeOptions}
                  value={homeFeedMode}
                />
                <Text tone="muted" variant="label">
                  Type
                </Text>
                <SegmentedControl
                  getOptionTestID={(value) => `settings-home-feed-type-${value}`}
                  onChange={handleSelectHomeFeedTypeFilter}
                  options={homeFeedTypeOptions}
                  value={homeFeedTypeFilter}
                />
                <Text tone="muted" variant="label">
                  Sort
                </Text>
                <SegmentedControl
                  getOptionTestID={(value) => `settings-home-feed-sort-${value}`}
                  onChange={handleSelectHomeFeedSort}
                  options={homeFeedSortOptions}
                  value={homeFeedSort}
                />
              </View>
            </SectionCard>

            <SectionCard
              description="Choose who can see your visits by default. You can change this on each visit later."
              title="Default Visit Visibility"
            >
              <View style={styles.optionList}>
                <VisibilityOptionSelector
                  onChange={(selectedValue) => {
                    if (selectedValue === 'friends' || selectedValue === 'private') {
                      handleSelectVisitVisibility(selectedValue);
                    }
                  }}
                  optionDescriptions={visitVisibilityDescriptions}
                  options={['private', 'friends']}
                  value={visitVisibility}
                  variant="cards"
                />
              </View>
            </SectionCard>

            <SectionCard
              description="Choose who can see restaurants you add by default. You can change this per restaurant later."
              title="Default Restaurant Visibility"
            >
              <View style={styles.optionList}>
                <VisibilityOptionSelector
                  onChange={(selectedValue) => {
                    if (selectedValue === 'private' || selectedValue === 'friends') {
                      handleSelectRestaurantVisibility(selectedValue);
                    }
                  }}
                  optionDescriptions={restaurantVisibilityDescriptions}
                  options={['private', 'friends']}
                  value={restaurantVisibility}
                  variant="cards"
                />
              </View>
            </SectionCard>

            <SectionCard
              description="Choose who can see lists you create by default. You can change this on each list later."
              title="Default List Visibility"
            >
              <View style={styles.optionList}>
                <VisibilityOptionSelector
                  onChange={(selectedValue) => {
                    if (selectedValue === 'private' || selectedValue === 'friends') {
                      handleSelectListVisibility(selectedValue);
                    }
                  }}
                  optionDescriptions={listVisibilityDescriptions}
                  options={['private', 'friends']}
                  value={listVisibility}
                  variant="cards"
                />
              </View>
            </SectionCard>

            <PageErrorToast errorMessage={errorMessage} title="Settings update failed" />
            {successMessage ? (
              <Card tone="success">
                <Text tone="success" variant="label">
                  {successMessage}
                </Text>
              </Card>
            ) : null}
          </>
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
