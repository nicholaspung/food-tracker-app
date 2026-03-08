import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  SectionCard,
  RoleBadge,
  StatusPill,
} from '../components/shared';
import { getCollectionCount, sendApiRequest } from '../features';
import { getErrorMessage } from '../lib/errorUtils';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type AdminFeaturesScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminFeatures'>;
type ExpandablePanel = 'subscriberManagement';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminFeaturesScreen({ navigation }: AdminFeaturesScreenProps) {
  const theme = useTheme();
  const { actualUser, rolePreviewSettings, setRolePreviewSetting, user } = useAuth();
  const { isOnline } = useConnectivity();
  const isActualAdmin = actualUser?.isAdmin === true;
  const isAdmin = user?.isAdmin === true;
  const isActualSubscriber = actualUser?.isSubscriber === true;
  const isRolePreviewActive =
    rolePreviewSettings.viewAsNonAdmin || rolePreviewSettings.viewAsNonSubscriber;
  const [expandedPanels, setExpandedPanels] = useState<Record<ExpandablePanel, boolean>>({
    subscriberManagement: true,
  });
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberErrorMessage, setSubscriberErrorMessage] = useState<string | null>(null);
  const [subscriberSuccessMessage, setSubscriberSuccessMessage] = useState<string | null>(null);

  const pendingReviewCountQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['feature', 'admin', 'pending-menu-review-count'],
    queryFn: async (): Promise<number> => {
      return getCollectionCount('menu_review_requests', 'status = "pending"');
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void pendingReviewCountQuery.refetch();
      }
    }, [isAdmin, pendingReviewCountQuery]),
  );

  const elevateSubscriberMutation = useMutation({
    mutationFn: async (email: string) => {
      return sendApiRequest('/api/users/elevate-subscriber', {
        method: 'POST',
        body: { email },
      });
    },
    onSuccess: () => {
      setSubscriberErrorMessage(null);
      setSubscriberSuccessMessage('User successfully elevated to subscriber.');
      setSubscriberEmail('');
    },
    onError: (error: unknown) => {
      setSubscriberSuccessMessage(null);
      setSubscriberErrorMessage(getErrorMessage(error, 'Failed to elevate user to subscriber.'));
    },
  });

  const togglePanel = (panel: ExpandablePanel) => {
    setExpandedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  };

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Profile');
  };

  const handleElevateSubscriber = () => {
    const trimmedEmail = subscriberEmail.trim();

    setSubscriberErrorMessage(null);
    setSubscriberSuccessMessage(null);

    if (!trimmedEmail) {
      setSubscriberErrorMessage('Please enter an email address.');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setSubscriberErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!isOnline) {
      setSubscriberErrorMessage('Subscriber elevation requires internet connection.');
      return;
    }

    elevateSubscriberMutation.mutate(trimmedEmail);
  };

  const handleToggleAdminPreview = () => {
    setRolePreviewSetting('viewAsNonAdmin', !rolePreviewSettings.viewAsNonAdmin);
  };

  const handleToggleSubscriberPreview = () => {
    if (!isActualSubscriber) {
      return;
    }

    setRolePreviewSetting('viewAsNonSubscriber', !rolePreviewSettings.viewAsNonSubscriber);
  };

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    warningPanel: {
      backgroundColor: theme.colors.status.warningBg,
      borderColor: theme.colors.border.warning,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    warningText: {
      color: theme.colors.text.warning,
      fontSize: 13,
      lineHeight: 18,
    },
    successPanel: {
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.border.success,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    successText: {
      color: theme.colors.text.success,
      fontSize: 13,
      lineHeight: 18,
    },
    hiddenToolsPanel: {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    hiddenToolsText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    previewHint: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
  });

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      rightAccessory={isAdmin ? <RoleBadge /> : undefined}
      subtitle="Administrative tools and controls."
      title="Admin Features"
    >
      {!isActualAdmin ? (
        <EmptyState
          actionLabel="Back to Profile"
          description="This route is restricted to admin users."
          onAction={() => {
            navigation.navigate('Profile');
          }}
          title="Access denied"
        />
      ) : (
        <>
          <SectionCard
            description="Manage subscribers and review flagged menus."
            title="Admin Tools"
          >
            {isAdmin ? (
              <OptionList>
                <OptionListRow
                  chevron={expandedPanels.subscriberManagement ? 'up' : 'down'}
                  connected={expandedPanels.subscriberManagement}
                  iconName="star-outline"
                  onPress={() => {
                    togglePanel('subscriberManagement');
                  }}
                  subtitle="Elevate users for unlimited photo parsing"
                  title="Subscriber Management"
                />

                {expandedPanels.subscriberManagement ? (
                  <OptionListInlineBody>
                    {!isOnline ? (
                      <View style={styles.warningPanel}>
                        <Text style={styles.warningText}>
                          You are offline. Admin operations require internet connection.
                        </Text>
                      </View>
                    ) : null}

                    {subscriberSuccessMessage ? (
                      <View style={styles.successPanel}>
                        <Text style={styles.successText}>{subscriberSuccessMessage}</Text>
                      </View>
                    ) : null}

                    <PageErrorToast
                      errorMessage={subscriberErrorMessage}
                      title="Subscriber update failed"
                    />

                    <Input
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      label="User Email"
                      onChangeText={setSubscriberEmail}
                      placeholder="user@example.com"
                      value={subscriberEmail}
                    />

                    <Button
                      disabled={!isOnline || elevateSubscriberMutation.isPending}
                      label={
                        !isOnline
                          ? 'Elevate (Offline)'
                          : elevateSubscriberMutation.isPending
                            ? 'Elevating...'
                            : 'Elevate to Subscriber'
                      }
                      onPress={handleElevateSubscriber}
                    />
                  </OptionListInlineBody>
                ) : null}

                <OptionListRow
                  iconName="flag-outline"
                  isLast
                  onPress={() => {
                    navigation.navigate('AdminMenuReviews');
                  }}
                  rightAccessory={
                    (pendingReviewCountQuery.data ?? 0) > 0 ? (
                      <StatusPill
                        label={pendingReviewCountQuery.data ?? 0}
                        size="md"
                        tone="brand"
                        variant="solid"
                      />
                    ) : null
                  }
                  subtitle="Review menus flagged by users"
                  title="Menu Reviews"
                />
              </OptionList>
            ) : (
              <View style={styles.hiddenToolsPanel}>
                <Text style={styles.hiddenToolsText}>
                  Admin tools are hidden while "View as non-admin" is enabled.
                </Text>
              </View>
            )}
          </SectionCard>

          <SectionCard
            description="Preview the app with reduced permissions."
            title="View Mode"
          >
            <OptionList>
              <OptionListRow
                iconName="eye-outline"
                onPress={handleToggleAdminPreview}
                rightAccessory={
                  <StatusPill
                    label={rolePreviewSettings.viewAsNonAdmin ? 'On' : 'Off'}
                    tone={rolePreviewSettings.viewAsNonAdmin ? 'warning' : 'muted'}
                    variant="soft"
                  />
                }
                subtitle="Hide admin-only routes and controls"
                title="View as non-admin"
              />
              <OptionListRow
                chevron={isActualSubscriber ? undefined : false}
                iconColor={isActualSubscriber ? undefined : theme.colors.text.muted}
                iconName="sparkles-outline"
                isLast
                onPress={isActualSubscriber ? handleToggleSubscriberPreview : undefined}
                rightAccessory={
                  <StatusPill
                    label={
                      isActualSubscriber
                        ? rolePreviewSettings.viewAsNonSubscriber
                          ? 'On'
                          : 'Off'
                        : 'N/A'
                    }
                    tone={
                      isActualSubscriber && rolePreviewSettings.viewAsNonSubscriber
                        ? 'warning'
                        : 'muted'
                    }
                    variant="soft"
                  />
                }
                subtitle={
                  isActualSubscriber
                    ? 'Hide subscriber-only access and badges'
                    : 'Your account is already non-subscriber'
                }
                title="View as non-subscriber"
              />
            </OptionList>

            <Text style={styles.previewHint}>
              {isRolePreviewActive
                ? 'Preview mode is active across the app until these toggles are disabled.'
                : 'Enable a toggle to preview the app with reduced access.'}
            </Text>
          </SectionCard>
        </>
      )}
    </BackHeaderScreenScaffold>
  );
}
