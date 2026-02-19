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
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
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
  const queryClient = useQueryClient();
  const isAdmin = user?.isAdmin === true;
  const [adminStatusFilter, setAdminStatusFilter] = useState<FeedbackStatusFilter>('active');
  const [adminTimeRangeFilter, setAdminTimeRangeFilter] = useState<AdminTimeRangeFilter>('all_time');

  const feedbackQuery = useQuery({
    queryKey: ['feature', 'feedback', isAdmin ? adminStatusFilter : 'all'],
    queryFn: () => listFeedback({ status: isAdmin ? adminStatusFilter : 'all' }),
  });

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
      setErrorMessage('Subject and message are required.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('feedback.create');
      await createFeedback({
        title: subject,
        description: message,
      });

      setSubject('');
      setMessage('');
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback'] });
    } catch (error) {
      const messageValue = error instanceof Error ? error.message : 'Could not submit feedback.';
      setErrorMessage(messageValue);
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
            onChange={setAdminStatusFilter}
            options={ADMIN_FILTERS}
            scrollable
            value={adminStatusFilter}
          />
          {adminStatusFilter === 'all' ? (
            <>
              <Text style={styles.filterSubsectionTitle}>Time range</Text>
              <FilterChipGroup
                onChange={setAdminTimeRangeFilter}
                options={ADMIN_TIME_RANGE_FILTERS}
                scrollable
                value={adminTimeRangeFilter}
              />
            </>
          ) : null}
          {!feedbackQuery.isLoading && !feedbackQuery.isError ? (
            <Text style={styles.countSummaryText}>
              {visibleFeedbackCount} {visibleFeedbackCount === 1 ? 'thread' : 'threads'} in {selectedAdminFilterLabel}
              {adminStatusFilter === 'all' ? ` (${selectedAdminTimeRangeLabel})` : ''}
            </Text>
          ) : null}
        </Card>
      )}

      {!isAdmin && !feedbackQuery.isLoading && !feedbackQuery.isError ? (
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
          errorMessage={feedbackQuery.isError ? 'Could not load feedback history.' : null}
          title="Feedback unavailable"
          actionLabel="Retry"
          onAction={() => {
            void feedbackQuery.refetch();
          }}
        />

        {!feedbackQuery.isLoading && !feedbackQuery.isError && visibleFeedbackCount === 0 ? (
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

        {!feedbackQuery.isLoading && !feedbackQuery.isError
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
