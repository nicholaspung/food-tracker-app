import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  FeedbackThreadCard,
  FilterChipGroup,
  RoleBadge,
  Skeleton,
} from '../components/shared';
import { createFeedback, listFeedback, type FeedbackStatusFilter } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'Feedback'>;
type AdminTimeRangeFilter = 'all_time' | 'last_7_days' | 'last_30_days' | 'last_90_days';

const ADMIN_FILTERS: { label: string; value: FeedbackStatusFilter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' },
];

const ADMIN_TIME_RANGE_FILTERS: { label: string; value: AdminTimeRangeFilter }[] = [
  { label: 'All Time', value: 'all_time' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Last 90 Days', value: 'last_90_days' },
];

export function FeedbackScreen({ navigation }: FeedbackScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const isAdmin = user?.isAdmin === true;
  const [adminStatusFilter, setAdminStatusFilter] = useState<FeedbackStatusFilter>('active');
  const [adminTimeRangeFilter, setAdminTimeRangeFilter] = useState<AdminTimeRangeFilter>('all_time');

  const feedbackQuery = useQuery({
    queryKey: ['feature', 'feedback', isAdmin ? adminStatusFilter : 'all'],
    queryFn: () => listFeedback({ status: isAdmin ? adminStatusFilter : 'all' }),
  });
  const hasBlockingFeedbackError = feedbackQuery.isError && !feedbackQuery.data;
  const hasFeedbackRefreshError = !hasBlockingFeedbackError && feedbackQuery.isError;

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayedFeedback = useMemo(() => {
    const baseFeedback = feedbackQuery.data ?? [];

    if (!isAdmin || adminStatusFilter !== 'all' || adminTimeRangeFilter === 'all_time') {
      return baseFeedback;
    }

    const maxAgeMs =
      adminTimeRangeFilter === 'last_7_days'
        ? 7 * 24 * 60 * 60 * 1000
        : adminTimeRangeFilter === 'last_30_days'
          ? 30 * 24 * 60 * 60 * 1000
          : 90 * 24 * 60 * 60 * 1000;

    const now = Date.now();

    return baseFeedback.filter((feedback) => {
      const timestamp = new Date(feedback.lastMessageAt ?? feedback.createdAt).getTime();

      if (Number.isNaN(timestamp)) {
        return false;
      }

      return now - timestamp <= maxAgeMs;
    });
  }, [feedbackQuery.data, isAdmin, adminStatusFilter, adminTimeRangeFilter]);

  const visibleFeedbackCount = displayedFeedback.length;
  const selectedAdminFilterLabel =
    ADMIN_FILTERS.find((filter) => filter.value === adminStatusFilter)?.label ?? 'All';
  const selectedAdminTimeRangeLabel =
    ADMIN_TIME_RANGE_FILTERS.find((filter) => filter.value === adminTimeRangeFilter)?.label ?? 'All Time';

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    historySection: {
      gap: theme.spacing.md,
    },
    filterSection: {
      gap: theme.spacing.xs,
    },
    feedbackPressable: {
      borderRadius: theme.radii.lg,
    },
    countSummaryText: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    filterSubsectionTitle: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
      marginTop: theme.spacing.xxs,
    },
  });

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      trackObservabilityEvent('FEEDBACK_SUBMIT_VALIDATION_FAILED', {
        source: 'FeedbackScreen',
        reason: 'missing_subject_or_message',
        subjectLength: subject.trim().length,
        messageLength: message.trim().length,
      });
      setErrorMessage('Subject and message are required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('FEEDBACK_SUBMIT_STARTED', {
      source: 'FeedbackScreen',
      subjectLength: subject.trim().length,
      messageLength: message.trim().length,
      isOnline,
    });

    try {
      const feedbackInput = {
        title: subject,
        description: message,
      };

      if (!isOnline) {
        await queueFeatureOutbox('feedback.create', feedbackInput);
        setSubject('');
        setMessage('');
        await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback'] });
        trackObservabilityEvent('FEEDBACK_SUBMIT_SUCCEEDED', {
          source: 'FeedbackScreen',
          queued: true,
        });
        showQueuedOfflineAlert('Feedback');
        return;
      }

      await queueWrite('feedback.create');
      await createFeedback(feedbackInput);

      setSubject('');
      setMessage('');
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback'] });
      trackObservabilityEvent('FEEDBACK_SUBMIT_SUCCEEDED', {
        source: 'FeedbackScreen',
        queued: false,
      });
    } catch (error) {
      const messageValue = error instanceof Error ? error.message : 'Could not submit feedback.';
      setErrorMessage(messageValue);
      trackObservabilityEvent('FEEDBACK_SUBMIT_FAILED', {
        source: 'FeedbackScreen',
        error: messageValue,
      });
    }
  };

  const handleBackToProfile = () => {
    navigation.navigate('Profile');
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      contentBackgroundTone="app"
      keyboardAware
      onBackPress={handleBackToProfile}
      rightAccessory={isAdmin ? <RoleBadge /> : undefined}
      subtitle="Report bugs, request features, and contact support."
      title="Feedback"
    >
      {!isAdmin ? (
        <Card>
          <Text variant="label">Send feedback</Text>
          <Input label="Subject" onChangeText={setSubject} placeholder="Bug, idea, request" value={subject} />
          <Input
            label="Message"
            multiline
            onChangeText={setMessage}
            placeholder="Tell us what happened"
            value={message}
          />

          <PageErrorToast errorMessage={errorMessage} title="Could not submit" />

          <Button
            disabled={!subject.trim() || !message.trim()}
            label="Submit Feedback"
            onPress={() => {
              void handleSubmit();
            }}
          />
        </Card>
      ) : (
        <Card style={styles.filterSection}>
          <Text variant="label">Filter feedback</Text>
          <FilterChipGroup
            onChange={(nextStatusFilter) => {
              trackObservabilityEvent('FEEDBACK_ADMIN_STATUS_FILTER_CHANGED', {
                source: 'FeedbackScreen',
                previousStatusFilter: adminStatusFilter,
                nextStatusFilter,
              });
              setAdminStatusFilter(nextStatusFilter);
            }}
            options={ADMIN_FILTERS}
            scrollable
            value={adminStatusFilter}
          />
          {adminStatusFilter === 'all' ? (
            <>
              <Text style={styles.filterSubsectionTitle}>Time range</Text>
              <FilterChipGroup
                onChange={(nextTimeRangeFilter) => {
                  trackObservabilityEvent('FEEDBACK_ADMIN_TIME_RANGE_FILTER_CHANGED', {
                    source: 'FeedbackScreen',
                    previousTimeRangeFilter: adminTimeRangeFilter,
                    nextTimeRangeFilter,
                  });
                  setAdminTimeRangeFilter(nextTimeRangeFilter);
                }}
                options={ADMIN_TIME_RANGE_FILTERS}
                scrollable
                value={adminTimeRangeFilter}
              />
            </>
          ) : null}
          {!feedbackQuery.isLoading && !hasBlockingFeedbackError ? (
            <Text style={styles.countSummaryText}>
              {visibleFeedbackCount} {visibleFeedbackCount === 1 ? 'thread' : 'threads'} in {selectedAdminFilterLabel}
              {adminStatusFilter === 'all' ? ` (${selectedAdminTimeRangeLabel})` : ''}
            </Text>
          ) : null}
        </Card>
      )}

      {!isAdmin && !feedbackQuery.isLoading && !hasBlockingFeedbackError ? (
        <Text style={styles.countSummaryText}>
          {visibleFeedbackCount} {visibleFeedbackCount === 1 ? 'feedback thread' : 'feedback threads'} total
        </Text>
      ) : null}

      <View style={styles.historySection}>
        {feedbackQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        <PageErrorToast
          errorMessage={
            hasBlockingFeedbackError
              ? 'Could not load feedback history.'
              : hasFeedbackRefreshError
                ? 'Could not refresh feedback history. Showing saved data.'
                : null
          }
          title="Feedback unavailable"
          actionLabel="Retry"
          onAction={() => {
            void feedbackQuery.refetch();
          }}
        />

        {!feedbackQuery.isLoading && !hasBlockingFeedbackError && visibleFeedbackCount === 0 ? (
          <EmptyState
            description={
              isAdmin
                ? adminStatusFilter === 'active'
                  ? 'No active feedback threads right now.'
                  : adminStatusFilter === 'all' && adminTimeRangeFilter !== 'all_time'
                    ? 'No feedback threads match this time range.'
                    : 'No feedback threads match this filter.'
                : 'Your submitted feedback will appear here.'
            }
            title={isAdmin ? 'No feedback found' : 'No feedback yet'}
          />
        ) : null}

        {!feedbackQuery.isLoading && !hasBlockingFeedbackError
          ? displayedFeedback.map((feedback) => {
              const unreadCount = isAdmin ? feedback.adminUnreadCount : feedback.userUnreadCount;
              const ownerLabel =
                isAdmin
                  ? `From ${feedback.userName?.trim() || feedback.userEmail?.trim() || feedback.userId}`
                  : undefined;
              const timestampLabel = formatDisplayDate(feedback.lastMessageAt ?? feedback.createdAt, {
                fallback: 'Unknown',
                options: {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                },
              });

              return (
                <Pressable
                  accessibilityRole="button"
                  key={feedback.id}
                  onPress={() => {
                    trackObservabilityEvent('FEEDBACK_THREAD_OPENED', {
                      source: 'FeedbackScreen',
                      feedbackId: feedback.id,
                      status: feedback.status,
                      unreadCount,
                      isAdmin,
                    });
                    navigation.navigate('FeedbackDetail', { feedbackId: feedback.id });
                  }}
                  style={styles.feedbackPressable}
                >
                  <FeedbackThreadCard
                    compact
                    description={feedback.description}
                    footerLabel={!isAdmin && feedback.status === 'closed' ? 'Completed' : undefined}
                    footerLabelTone={!isAdmin && feedback.status === 'closed' ? 'success' : 'muted'}
                    ownerLabel={ownerLabel}
                    status={feedback.status}
                    timestampLabel={timestampLabel}
                    title={feedback.title}
                    tone={!isAdmin && feedback.status === 'closed' ? 'success' : 'muted'}
                    unreadCount={unreadCount}
                  />
                </Pressable>
              );
            })
        : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
