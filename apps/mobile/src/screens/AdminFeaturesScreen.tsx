import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  ErrorState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  RoleBadge,
  StatusPill,
} from '../components/shared';
import { getErrorMessage } from '../lib/errorUtils';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type AdminFeaturesScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminFeatures'>;
type ExpandablePanel = 'subscriberManagement';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminFeaturesScreen({ navigation }: AdminFeaturesScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const isAdmin = user?.isAdmin === true;
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
      const response = await pb.collection('menu_review_requests').getList(1, 1, {
        filter: 'status = "pending"',
      });

      return response.totalItems;
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
      return pb.send('/api/users/elevate-subscriber', {
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

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    sectionDescription: {
      color: theme.colors.text.secondary,
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
  });

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      rightAccessory={isAdmin ? <RoleBadge /> : undefined}
      subtitle="Administrative tools and controls."
      title="Admin Features"
    >
      {!isAdmin ? (
        <EmptyState
          actionLabel="Back to Profile"
          description="This route is restricted to admin users."
          onAction={() => {
            navigation.navigate('Profile');
          }}
          title="Access denied"
        />
      ) : (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Admin Tools</Text>
          <Text style={styles.sectionDescription}>Manage subscribers and review flagged menus.</Text>

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

                {subscriberErrorMessage ? (
                  <ErrorState
                    description={subscriberErrorMessage}
                    title="Subscriber update failed"
                  />
                ) : null}

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
        </Card>
      )}
    </BackHeaderScreenScaffold>
  );
}
