import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import { BackHeaderScreenScaffold, EmptyState, SectionCard, Skeleton, VisibilityOptionSelector } from '../components/shared';
import { getCollectionRecord, saveAuthRecord, updateCollectionRecord } from '../features';
import { getAuthRecord } from '../features/store/pocketbaseGateway';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type VisitVisibility = 'friends' | 'private';
type RestaurantVisibility = 'private' | 'friends';
type ListVisibility = 'private' | 'friends';

interface UserSettingsRecord {
  defaultVisitVisibility?: unknown;
  defaultRestaurantVisibility?: unknown;
  defaultListVisibility?: unknown;
}

interface UserSettings {
  visitVisibility: VisitVisibility;
  restaurantVisibility: RestaurantVisibility;
  listVisibility: ListVisibility;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  optionList: {
    gap: theme.spacing.xs,
  },
}));

function normalizeVisitVisibility(value: unknown): VisitVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeRestaurantVisibility(
  value: unknown,
): RestaurantVisibility {
  if (value === 'private') {
    return 'private';
  }

  return 'friends';
}

function normalizeListVisibility(value: unknown): ListVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function mapUserSettings(record: UserSettingsRecord): UserSettings {
  return {
    visitVisibility: normalizeVisitVisibility(record.defaultVisitVisibility),
    restaurantVisibility: normalizeRestaurantVisibility(record.defaultRestaurantVisibility),
    listVisibility: normalizeListVisibility(record.defaultListVisibility),
  };
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const styles = useStyles();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const queryClient = useQueryClient();
  const [visitVisibility, setVisitVisibility] = useState<VisitVisibility>('friends');
  const [restaurantVisibility, setRestaurantVisibility] = useState<RestaurantVisibility>('private');
  const [listVisibility, setListVisibility] = useState<ListVisibility>('friends');
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
      return mapUserSettings(record);
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setVisitVisibility(settingsQuery.data.visitVisibility);
    setRestaurantVisibility(settingsQuery.data.restaurantVisibility);
    setListVisibility(settingsQuery.data.listVisibility);
  }, [settingsQuery.data]);

  const hasPendingChanges = useMemo(() => {
    if (!settingsQuery.data) {
      return false;
    }

    return (
      visitVisibility !== settingsQuery.data.visitVisibility ||
      restaurantVisibility !== settingsQuery.data.restaurantVisibility ||
      listVisibility !== settingsQuery.data.listVisibility
    );
  }, [listVisibility, restaurantVisibility, settingsQuery.data, visitVisibility]);

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
      hasPendingChanges,
      isOnline,
    });
    setIsSaving(true);

    try {
      const settingsUpdate = {
        defaultListVisibility: listVisibility,
        defaultRestaurantVisibility: restaurantVisibility,
        defaultVisitVisibility: visitVisibility,
      };

      if (!isOnline) {
        await queueFeatureOutbox('settings.visibility.save', {
          userId: user.id,
          ...settingsUpdate,
        });

        const currentAuthRecord = getAuthRecord();
        if (currentAuthRecord) {
          saveAuthRecord({
            ...(currentAuthRecord as RecordModel),
            ...settingsUpdate,
          } as RecordModel);
        }

        const nextSettings = mapUserSettings(settingsUpdate);
        queryClient.setQueryData(['feature', 'settings', user.id], nextSettings);
        trackObservabilityEvent('SETTINGS_SAVE_SUCCEEDED', {
          source: 'SettingsScreen',
          userId: user.id,
          visitVisibility,
          restaurantVisibility,
          listVisibility,
          queued: true,
        });
        setSuccessMessage('Settings saved offline and will sync when you reconnect.');
        return;
      }

      const updatedRecord = await updateCollectionRecord<RecordModel & UserSettingsRecord>(
        'users',
        user.id,
        settingsUpdate,
      );

      const nextSettings = mapUserSettings(updatedRecord);
      saveAuthRecord(updatedRecord);
      queryClient.setQueryData(['feature', 'settings', user.id], nextSettings);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'settings', user.id] });
      trackObservabilityEvent('SETTINGS_SAVE_SUCCEEDED', {
        source: 'SettingsScreen',
        userId: user.id,
        visitVisibility,
        restaurantVisibility,
        listVisibility,
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
        onBackPress={() => {
          navigation.navigate('Profile');
        }}
        subtitle="Set defaults for new visits, restaurants, and lists"
        testID="settings-screen"
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
      subtitle="Set defaults for new visits, restaurants, and lists"
      testID="settings-screen"
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
