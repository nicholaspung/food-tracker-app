import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  FeedbackThreadCard,
  Skeleton,
} from '../components/shared';
import { createFeedback, listFeedback } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { formatDisplayDate } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'Feedback'>;

export function FeedbackScreen({ navigation }: FeedbackScreenProps) {
  const theme = useTheme();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();

  const feedbackQuery = useQuery({
    queryKey: ['feature', 'feedback', 'all'],
    queryFn: () => listFeedback({ status: 'all' }),
  });
  const hasBlockingFeedbackError = feedbackQuery.isError && !feedbackQuery.data;
  const hasFeedbackRefreshError = !hasBlockingFeedbackError && feedbackQuery.isError;

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const displayedFeedback = feedbackQuery.data ?? [];
  const visibleFeedbackCount = displayedFeedback.length;

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
    feedbackPressable: {
      borderRadius: theme.radii.lg,
    },
    countSummaryText: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
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
      subtitle="Report bugs, request features, and contact support."
      title="Feedback"
    >
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

      {!feedbackQuery.isLoading && !hasBlockingFeedbackError ? (
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
            description="Your submitted feedback will appear here."
            title="No feedback yet"
          />
        ) : null}

        {!feedbackQuery.isLoading && !hasBlockingFeedbackError
          ? displayedFeedback.map((feedback) => {
              const unreadCount = feedback.userUnreadCount;
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
                    });
                    navigation.navigate('FeedbackDetail', { feedbackId: feedback.id });
                  }}
                  style={styles.feedbackPressable}
                >
                  <FeedbackThreadCard
                    compact
                    description={feedback.description}
                    footerLabel={feedback.status === 'closed' ? 'Completed' : undefined}
                    footerLabelTone={feedback.status === 'closed' ? 'success' : 'muted'}
                    status={feedback.status}
                    timestampLabel={timestampLabel}
                    title={feedback.title}
                    tone={feedback.status === 'closed' ? 'success' : 'muted'}
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
