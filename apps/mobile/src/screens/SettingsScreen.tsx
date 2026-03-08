import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BackHeaderScreenScaffold, EmptyState, SectionCard, Skeleton, VisibilityOptionSelector } from '../components/shared';
import { getCollectionRecord, updateCollectionRecord } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type VisitVisibility = 'friends' | 'private';
type RestaurantVisibility = 'private' | 'friends' | 'public';

interface UserSettingsRecord {
  defaultVisitVisibility?: unknown;
  defaultRestaurantVisibility?: unknown;
}

interface UserSettings {
  visitVisibility: VisitVisibility;
  restaurantVisibility: RestaurantVisibility;
}

function normalizeVisitVisibility(value: unknown): VisitVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeRestaurantVisibility(
  value: unknown,
  isAdmin: boolean,
): RestaurantVisibility {
  if (value === 'private' || value === 'friends') {
    return value;
  }

  if (value === 'public' && isAdmin) {
    return 'public';
  }

  return 'private';
}

function mapUserSettings(record: UserSettingsRecord, isAdmin: boolean): UserSettings {
  return {
    visitVisibility: normalizeVisitVisibility(record.defaultVisitVisibility),
    restaurantVisibility: normalizeRestaurantVisibility(record.defaultRestaurantVisibility, isAdmin),
  };
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();
  const isAdmin = user?.isAdmin === true;
  const [visitVisibility, setVisitVisibility] = useState<VisitVisibility>('friends');
  const [restaurantVisibility, setRestaurantVisibility] = useState<RestaurantVisibility>('private');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const settingsQuery = useQuery({
    enabled: Boolean(user?.id),
    queryKey: ['feature', 'settings', user?.id],
    queryFn: async (): Promise<UserSettings> => {
      if (!user?.id) {
        throw new Error('Authentication required.');
      }

      const record = await getCollectionRecord<UserSettingsRecord>('users', user.id);
      return mapUserSettings(record, isAdmin);
    },
  });

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    optionList: {
      gap: theme.spacing.xs,
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setVisitVisibility(settingsQuery.data.visitVisibility);
    setRestaurantVisibility(settingsQuery.data.restaurantVisibility);
  }, [settingsQuery.data]);

  const hasPendingChanges = useMemo(() => {
    if (!settingsQuery.data) {
      return false;
    }

    return (
      visitVisibility !== settingsQuery.data.visitVisibility ||
      restaurantVisibility !== settingsQuery.data.restaurantVisibility
    );
  }, [restaurantVisibility, settingsQuery.data, visitVisibility]);

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
      hasPendingChanges,
    });
    setIsSaving(true);

    try {
      await queueWrite('settings.visibility.save');

      const updatedRecord = await updateCollectionRecord<UserSettingsRecord>('users', user.id, {
        defaultRestaurantVisibility: restaurantVisibility,
        defaultVisitVisibility: visitVisibility,
      });

      const nextSettings = mapUserSettings(updatedRecord, isAdmin);
      queryClient.setQueryData(['feature', 'settings', user.id], nextSettings);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'settings', user.id] });
      trackObservabilityEvent('SETTINGS_SAVE_SUCCEEDED', {
        source: 'SettingsScreen',
        userId: user.id,
        visitVisibility,
        restaurantVisibility,
      });
      setSuccessMessage('Settings saved successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update settings.';
      setErrorMessage(message);
      trackObservabilityEvent('SETTINGS_SAVE_FAILED', {
        source: 'SettingsScreen',
        userId: user.id,
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
      isAdmin,
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
      isAdmin,
    });
    setRestaurantVisibility(value);
  };

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
        public: 'Everyone can see restaurants you add.',
      }) as const,
    [],
  );

  const restaurantVisibilityBadgeLabels = useMemo(
    () =>
      ({
        public: isAdmin ? 'Admin' : undefined,
      }) as const,
    [isAdmin],
  );

  if (!user?.id) {
    return (
      <BackHeaderScreenScaffold
        onBackPress={() => {
          navigation.navigate('Profile');
        }}
        subtitle="Set defaults for new visits and restaurants"
        title="Settings"
      >
        <View style={styles.body}>
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
      onBackPress={() => {
        navigation.navigate('Profile');
      }}
      subtitle="Set defaults for new visits and restaurants"
      title="Settings"
    >
      <View style={styles.body}>
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
                  options={['friends', 'private']}
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
                    if (
                      selectedValue === 'private' ||
                      selectedValue === 'friends' ||
                      (selectedValue === 'public' && isAdmin)
                    ) {
                      handleSelectRestaurantVisibility(selectedValue);
                    }
                  }}
                  optionBadgeLabels={restaurantVisibilityBadgeLabels}
                  optionDescriptions={restaurantVisibilityDescriptions}
                  options={isAdmin ? ['private', 'friends', 'public'] : ['private', 'friends']}
                  value={restaurantVisibility}
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

            <Button
              disabled={!hasPendingChanges || isSaving}
              label={isSaving ? 'Saving...' : 'Save Settings'}
              loading={isSaving}
              onPress={() => {
                void handleSaveSettings();
              }}
            />
          </>
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
