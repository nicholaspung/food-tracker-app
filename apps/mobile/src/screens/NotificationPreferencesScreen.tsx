import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Switch, View } from 'react-native';
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
import { Button, Card, Text, type CardTone } from '../ui';

type NotificationPreferencesScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'NotificationPreferences'
>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  systemNotificationAction: {
    alignItems: 'flex-start',
    marginTop: theme.spacing.xs,
  },
  systemNotificationCard: {
    gap: theme.spacing.sm,
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

type SystemNotificationPermissionTone = Extract<CardTone, 'danger' | 'info' | 'success' | 'warning'>;

interface SystemNotificationPermissionContent {
  actionLabel?: string;
  description: string;
  statusLabel: string;
  testID: string;
  tone: SystemNotificationPermissionTone;
}

function getSystemNotificationPermissionContent(
  status: RemoteNotificationPermissionStatus,
): SystemNotificationPermissionContent {
  switch (status) {
    case 'granted':
      return {
        description: 'System notification permission is enabled on this device.',
        statusLabel: 'Enabled',
        testID: 'system-notification-permission-granted',
        tone: 'success',
      };
    case 'denied':
      return {
        actionLabel: 'Open Settings',
        description: 'System notification permission is off. Notifications cannot be delivered until permission is enabled in system settings.',
        statusLabel: 'Off in Settings',
        testID: 'system-notification-permission-denied',
        tone: 'warning',
      };
    case 'undetermined':
      return {
        actionLabel: 'Enable Notifications',
        description: 'System notification permission has not been requested for this device yet.',
        statusLabel: 'Not Enabled',
        testID: 'system-notification-permission-undetermined',
        tone: 'info',
      };
    case 'unavailable':
      return {
        actionLabel: 'Retry',
        description: 'System notification permission cannot be checked on this device right now.',
        statusLabel: 'Unavailable',
        testID: 'system-notification-permission-unavailable',
        tone: 'warning',
      };
    case 'failed':
    default:
      return {
        actionLabel: 'Retry',
        description: 'Could not check system notification permission. Try again in a moment.',
        statusLabel: 'Check Failed',
        testID: 'system-notification-permission-failed',
        tone: 'danger',
      };
  }
}

interface NotificationPreferenceToggleProps {
  disabled: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  statusText: string;
  testID: string;
  value: boolean;
}

function NotificationPreferenceToggle({
  disabled,
  label,
  onValueChange,
  statusText,
  testID,
  value,
}: NotificationPreferenceToggleProps) {
  const styles = useStyles();
  return (
    <View style={[styles.toggleRow, disabled ? styles.toggleRowDisabled : null]}>
      <View style={styles.toggleText}>
        <Text variant="label">{label}</Text>
        <Text tone="secondary" variant="bodySmTight" testID={`${testID}-status`}>
          {statusText}
        </Text>
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

function getNotificationPreferenceDeliveryStatusText(
  isPreferenceEnabled: boolean,
  permissionStatus: RemoteNotificationPermissionStatus,
) {
  if (!isPreferenceEnabled) {
    return 'Off';
  }

  switch (permissionStatus) {
    case 'granted':
      return 'On';
    case 'denied':
      return 'On, blocked by system settings.';
    case 'undetermined':
      return 'On, notifications not enabled yet.';
    case 'unavailable':
      return 'On, delivery cannot currently be confirmed.';
    case 'failed':
    default:
      return 'On, delivery cannot currently be confirmed.';
  }
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
  const [isCheckingNotificationPermission, setIsCheckingNotificationPermission] = useState(false);
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

  const refreshNotificationPermissionStatus = useCallback(async () => {
    setIsCheckingNotificationPermission(true);
    const status = await getRemoteNotificationPermissionStatus();
    setRemoteNotificationPermissionStatus(status);
    setIsCheckingNotificationPermission(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setIsCheckingNotificationPermission(true);
      void getRemoteNotificationPermissionStatus().then((status) => {
        if (isActive) {
          setRemoteNotificationPermissionStatus(status);
          setIsCheckingNotificationPermission(false);
        }
      });

      return () => {
        isActive = false;
      };
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshNotificationPermissionStatus();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshNotificationPermissionStatus]);

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

  const canOptInToNotificationPreferences =
    remoteNotificationPermissionStatus === 'granted' && !isCheckingNotificationPermission;

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

  const handleToggleNotificationPreference = (
    preferenceName: 'tasting_invites' | 'bills' | 'monthly_friends_activity',
    nextValue: boolean,
    currentValue: boolean,
    setValue: (value: boolean) => void,
  ) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (nextValue && !currentValue && !canOptInToNotificationPreferences) {
      setErrorMessage('Enable system notifications before turning on a notification preference.');
      return;
    }

    trackObservabilityEvent('SETTINGS_NOTIFICATION_PREFERENCE_CHANGED', {
      source: 'NotificationPreferencesScreen',
      preferenceName,
      nextValue,
    });
    setValue(nextValue);
  };

  const handleSystemNotificationPermissionAction = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (remoteNotificationPermissionStatus === 'denied') {
      void Linking.openSettings();
      return;
    }

    if (remoteNotificationPermissionStatus === 'undetermined') {
      setIsCheckingNotificationPermission(true);
      const nextPermissionStatus = await requestRemoteNotificationPermission();
      setRemoteNotificationPermissionStatus(nextPermissionStatus);
      setIsCheckingNotificationPermission(false);
      if (nextPermissionStatus === 'granted') {
        void registerCurrentRemoteNotificationDevice('settings');
      }
      return;
    }

    await refreshNotificationPermissionStatus();
  };

  const systemNotificationPermissionContent = getSystemNotificationPermissionContent(
    remoteNotificationPermissionStatus,
  );

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
              description="Controls whether this device can receive push notifications from Yummy Recs."
              title="System Notifications"
            >
              <Card
                style={styles.systemNotificationCard}
                testID={systemNotificationPermissionContent.testID}
                tone={systemNotificationPermissionContent.tone}
              >
                <Text tone={systemNotificationPermissionContent.tone} variant="label">
                  {systemNotificationPermissionContent.statusLabel}
                </Text>
                <Text tone={systemNotificationPermissionContent.tone} variant="bodySmTight">
                  {systemNotificationPermissionContent.description}
                </Text>
                {systemNotificationPermissionContent.actionLabel ? (
                  <View style={styles.systemNotificationAction}>
                    <Button
                      disabled={isCheckingNotificationPermission}
                      label={
                        isCheckingNotificationPermission
                          ? 'Checking...'
                          : systemNotificationPermissionContent.actionLabel
                      }
                      loading={isCheckingNotificationPermission}
                      onPress={() => {
                        void handleSystemNotificationPermissionAction();
                      }}
                      testID="system-notification-permission-action"
                      variant="secondary"
                    />
                  </View>
                ) : null}
              </Card>
            </SectionCard>

            <SectionCard
              description="Choose which notifications Yummy Recs may send. In-app indicators stay visible."
              title="Notification Preferences"
            >
              <View style={styles.toggleList}>
                <NotificationPreferenceToggle
                  disabled={!notificationTastingInvitesEnabled && !canOptInToNotificationPreferences}
                  label="Tasting invites"
                  onValueChange={(nextValue) => {
                    handleToggleNotificationPreference(
                      'tasting_invites',
                      nextValue,
                      notificationTastingInvitesEnabled,
                      setNotificationTastingInvitesEnabled,
                    );
                  }}
                  statusText={getNotificationPreferenceDeliveryStatusText(
                    notificationTastingInvitesEnabled,
                    remoteNotificationPermissionStatus,
                  )}
                  testID="notification-preferences-tasting-invites-toggle"
                  value={notificationTastingInvitesEnabled}
                />
                <NotificationPreferenceToggle
                  disabled={!notificationBillsEnabled && !canOptInToNotificationPreferences}
                  label="Bills and payment reminders"
                  onValueChange={(nextValue) => {
                    handleToggleNotificationPreference(
                      'bills',
                      nextValue,
                      notificationBillsEnabled,
                      setNotificationBillsEnabled,
                    );
                  }}
                  statusText={getNotificationPreferenceDeliveryStatusText(
                    notificationBillsEnabled,
                    remoteNotificationPermissionStatus,
                  )}
                  testID="notification-preferences-bills-toggle"
                  value={notificationBillsEnabled}
                />
                <NotificationPreferenceToggle
                  disabled={
                    !notificationMonthlyFriendsActivityEnabled && !canOptInToNotificationPreferences
                  }
                  label="Monthly friends activity"
                  onValueChange={(nextValue) => {
                    handleToggleNotificationPreference(
                      'monthly_friends_activity',
                      nextValue,
                      notificationMonthlyFriendsActivityEnabled,
                      setNotificationMonthlyFriendsActivityEnabled,
                    );
                  }}
                  statusText={getNotificationPreferenceDeliveryStatusText(
                    notificationMonthlyFriendsActivityEnabled,
                    remoteNotificationPermissionStatus,
                  )}
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
