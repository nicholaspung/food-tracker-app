import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  SectionCard,
  Skeleton,
} from '../components/shared';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import {
  getCollectionRecord,
  getNotificationPreferences,
  mapUserSettings,
  settingsQueryKeys,
  useSettingsPreferencesWrites,
  type UserSettings,
  type UserSettingsRecord,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  getRemoteNotificationPermissionStatus,
  registerCurrentRemoteNotificationDevice,
  requestRemoteNotificationPermission,
  type RemoteNotificationPermissionStatus,
} from '../notifications/notificationInteraction';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Card, Text } from '../ui';

type NotificationPreferencesScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'NotificationPreferences'
>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  calloutActions: {
    alignItems: 'flex-start',
    marginTop: theme.spacing.xs,
  },
  toggleList: {
    gap: theme.spacing.sm,
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  toggleRowDisabled: {
    opacity: 0.6,
  },
  toggleText: {
    flex: 1,
  },
}));

interface NotificationPreferenceToggleProps {
  disabled: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  testID: string;
  value: boolean;
}

function NotificationPreferenceToggle({
  disabled,
  label,
  onValueChange,
  testID,
  value,
}: NotificationPreferenceToggleProps) {
  const styles = useStyles();
  return (
    <View style={[styles.toggleRow, disabled ? styles.toggleRowDisabled : null]}>
      <View style={styles.toggleText}>
        <Text variant="label">{label}</Text>
      </View>
      <Switch
        disabled={disabled}
        onValueChange={onValueChange}
        testID={testID}
        value={value}
      />
    </View>
  );
}

export function NotificationPreferencesScreen({ navigation }: NotificationPreferencesScreenProps) {
  const styles = useStyles();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const settingsWrites = useSettingsPreferencesWrites();
  const [notificationTastingInvitesEnabled, setNotificationTastingInvitesEnabled] = useState(true);
  const [notificationBillsEnabled, setNotificationBillsEnabled] = useState(true);
  const [notificationMonthlyFriendsActivityEnabled, setNotificationMonthlyFriendsActivityEnabled] = useState(true);
  const [remoteNotificationPermissionStatus, setRemoteNotificationPermissionStatus] =
    useState<RemoteNotificationPermissionStatus>('undetermined');
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
    let isMounted = true;
    void getRemoteNotificationPermissionStatus().then((status) => {
      if (isMounted) {
        setRemoteNotificationPermissionStatus(status);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setNotificationTastingInvitesEnabled(
      settingsQuery.data.notificationPreferences.notificationTastingInvitesEnabled,
    );
    setNotificationBillsEnabled(settingsQuery.data.notificationPreferences.notificationBillsEnabled);
    setNotificationMonthlyFriendsActivityEnabled(
      settingsQuery.data.notificationPreferences.notificationMonthlyFriendsActivityEnabled,
    );
  }, [settingsQuery.data]);

  const hasPendingChanges = useMemo(() => {
    if (!settingsQuery.data) {
      return false;
    }

    return (
      notificationTastingInvitesEnabled !==
        settingsQuery.data.notificationPreferences.notificationTastingInvitesEnabled ||
      notificationBillsEnabled !== settingsQuery.data.notificationPreferences.notificationBillsEnabled ||
      notificationMonthlyFriendsActivityEnabled !==
        settingsQuery.data.notificationPreferences.notificationMonthlyFriendsActivityEnabled
    );
  }, [
    notificationBillsEnabled,
    notificationMonthlyFriendsActivityEnabled,
    notificationTastingInvitesEnabled,
    settingsQuery.data,
  ]);

  const handleSavePreferences = async () => {
    if (!user?.id || !settingsQuery.data) {
      setErrorMessage('Authentication required.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    trackObservabilityEvent('SETTINGS_NOTIFICATION_SAVE_STARTED', {
      source: 'NotificationPreferencesScreen',
      notificationTastingInvitesEnabled,
      notificationBillsEnabled,
      notificationMonthlyFriendsActivityEnabled,
      hasPendingChanges,
      isOnline,
    });

    try {
      const saveResult = await settingsWrites.saveSettingsPreferences({
        userId: user.id,
        visitVisibility: settingsQuery.data.visitVisibility,
        restaurantVisibility: settingsQuery.data.restaurantVisibility,
        listVisibility: settingsQuery.data.listVisibility,
        homeFeedMode: settingsQuery.data.homeFeedMode,
        homeFeedTypeFilter: settingsQuery.data.homeFeedTypeFilter,
        homeFeedSort: settingsQuery.data.homeFeedSort,
        notificationPreferences: {
          notificationBillsEnabled,
          notificationMonthlyFriendsActivityEnabled,
          notificationTastingInvitesEnabled,
        },
      });

      trackObservabilityEvent('SETTINGS_NOTIFICATION_SAVE_SUCCEEDED', {
        source: 'NotificationPreferencesScreen',
        queued: saveResult.status === 'queued',
      });
      setSuccessMessage(
        saveResult.status === 'queued'
          ? 'Notification preferences saved offline and will sync when you reconnect.'
          : 'Notification preferences saved successfully.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update notification preferences.';
      setErrorMessage(message);
      trackObservabilityEvent('SETTINGS_NOTIFICATION_SAVE_FAILED', {
        source: 'NotificationPreferencesScreen',
        isOnline,
        error: message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleNotificationPreference = async (
    preferenceName: 'tasting_invites' | 'bills' | 'monthly_friends_activity',
    nextValue: boolean,
    setValue: (value: boolean) => void,
  ) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (nextValue && remoteNotificationPermissionStatus !== 'granted') {
      const nextPermissionStatus = await requestRemoteNotificationPermission();
      setRemoteNotificationPermissionStatus(nextPermissionStatus);
      if (nextPermissionStatus !== 'granted') {
        setErrorMessage('Notification permission is off. Enable notifications in system settings to turn on notifications.');
        return;
      }
      void registerCurrentRemoteNotificationDevice('settings');
    }

    trackObservabilityEvent('SETTINGS_NOTIFICATION_PREFERENCE_CHANGED', {
      source: 'NotificationPreferencesScreen',
      preferenceName,
      nextValue,
    });
    setValue(nextValue);
  };

  const notificationsDisabledByOs =
    remoteNotificationPermissionStatus === 'denied' ||
    remoteNotificationPermissionStatus === 'unavailable' ||
    remoteNotificationPermissionStatus === 'failed';
  const notificationPermissionMessage =
    remoteNotificationPermissionStatus === 'denied'
      ? 'System notification permission is off. Your saved preferences are shown below, but notifications cannot be delivered until permission is enabled.'
      : remoteNotificationPermissionStatus === 'unavailable'
        ? 'System notifications are unavailable on this device. Your saved preferences are still shown below.'
        : remoteNotificationPermissionStatus === 'failed'
          ? 'Could not check system notification permission. Your saved preferences are still shown below.'
          : null;

  const canShowSaveAction = !settingsQuery.isLoading && !settingsQuery.isError;
  const saveAction = canShowSaveAction
    ? {
        disabled: !hasPendingChanges || isSaving,
        label: isSaving ? 'Saving...' : 'Save Preferences',
        loading: isSaving,
        onPress: () => {
          void handleSavePreferences();
        },
        testID: 'notification-preferences-save-button',
      }
    : undefined;

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onBackPress={() => {
        navigation.navigate('Profile');
      }}
      primaryAction={saveAction}
      subtitle="Choose device notifications"
      testID="notification-preferences-screen"
      title="Notifications"
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
          errorMessage={settingsQuery.isError ? 'Could not load notification preferences.' : null}
          title="Notifications unavailable"
          actionLabel="Retry"
          onAction={() => {
            void settingsQuery.refetch();
          }}
        />

        {settingsQuery.isError ? (
          <EmptyState
            description="Could not load notification preferences."
            actionLabel="Retry"
            onAction={() => {
              void settingsQuery.refetch();
            }}
            title="Notifications unavailable"
          />
        ) : null}

        {!settingsQuery.isLoading && !settingsQuery.isError ? (
          <>
            <SectionCard
              description="Choose which notifications Yummy Recs may send. In-app indicators stay visible."
              title="Notification Preferences"
            >
              <View style={styles.toggleList}>
                {notificationPermissionMessage ? (
                  <Card tone="warning">
                    <Text tone="warning" variant="bodySmTight">
                      {notificationPermissionMessage}
                    </Text>
                    {remoteNotificationPermissionStatus === 'denied' ? (
                      <View style={styles.calloutActions}>
                        <Text
                          onPress={() => {
                            void Linking.openSettings();
                          }}
                          tone="warning"
                          variant="label"
                        >
                          Open Settings
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                ) : null}
                <NotificationPreferenceToggle
                  disabled={notificationsDisabledByOs}
                  label="Tasting invites"
                  onValueChange={(nextValue) => {
                    void handleToggleNotificationPreference(
                      'tasting_invites',
                      nextValue,
                      setNotificationTastingInvitesEnabled,
                    );
                  }}
                  testID="notification-preferences-tasting-invites-toggle"
                  value={notificationTastingInvitesEnabled}
                />
                <NotificationPreferenceToggle
                  disabled={notificationsDisabledByOs}
                  label="Bills and payment reminders"
                  onValueChange={(nextValue) => {
                    void handleToggleNotificationPreference(
                      'bills',
                      nextValue,
                      setNotificationBillsEnabled,
                    );
                  }}
                  testID="notification-preferences-bills-toggle"
                  value={notificationBillsEnabled}
                />
                <NotificationPreferenceToggle
                  disabled={notificationsDisabledByOs}
                  label="Monthly friends activity"
                  onValueChange={(nextValue) => {
                    void handleToggleNotificationPreference(
                      'monthly_friends_activity',
                      nextValue,
                      setNotificationMonthlyFriendsActivityEnabled,
                    );
                  }}
                  testID="notification-preferences-monthly-friends-activity-toggle"
                  value={notificationMonthlyFriendsActivityEnabled}
                />
              </View>
            </SectionCard>

            <PageErrorToast errorMessage={errorMessage} title="Notification preferences update failed" />
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
