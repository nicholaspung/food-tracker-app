import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  FeedbackThreadCard,
  HeaderAccessoryButton,
  Skeleton,
} from '../components/shared';
import { listFeedbackPage } from '../features';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Button, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'Feedback'>;

export function FeedbackScreen({ navigation }: FeedbackScreenProps) {
  const theme = useTheme();

  const feedbackQuery = useInfiniteQuery({
    queryKey: ['feature', 'feedback', 'all', 'paginated'],
    queryFn: ({ pageParam }) =>
      listFeedbackPage({
        status: 'all',
        page: pageParam,
        pageSize: 20,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });
  const hasBlockingFeedbackError =
    feedbackQuery.isError && (!feedbackQuery.data || feedbackQuery.data.pages.length === 0);
  const hasFeedbackRefreshError = !hasBlockingFeedbackError && feedbackQuery.isError;
  const hasResolvedFeedback = feedbackQuery.isSuccess && !feedbackQuery.isFetching;
  const displayedFeedback = feedbackQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleFeedbackCount = displayedFeedback.length;
  const totalFeedbackCount = feedbackQuery.data?.pages[0]?.totalItems ?? visibleFeedbackCount;

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

  const handleBackToProfile = () => {
    navigation.navigate('Profile');
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      contentBackgroundTone="app"
      keyboardAware
      onBackPress={handleBackToProfile}
      rightAccessory={
        <HeaderAccessoryButton
          accessibilityLabel="Create feedback"
          label="New"
          onPress={() => {
            trackObservabilityEvent('FEEDBACK_CREATE_CTA_TAPPED', {
              source: 'FeedbackScreen',
              placement: 'header',
            });
            navigation.navigate('CreateFeedback');
          }}
          testID="feedback-create-button"
        />
      }
      subtitle="Report bugs, request features, and contact support."
      testID="feedback-screen"
      title="Feedback"
    >
      {feedbackQuery.isSuccess ? (
        <Text style={styles.countSummaryText}>
          {totalFeedbackCount} {totalFeedbackCount === 1 ? 'feedback thread' : 'feedback threads'} total
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

        {hasResolvedFeedback && !hasBlockingFeedbackError && visibleFeedbackCount === 0 ? (
          <EmptyState
            description="Your submitted feedback will appear here. Tap the plus button above to start a new thread."
            title="No feedback yet"
          />
        ) : null}

        {feedbackQuery.isSuccess && !hasBlockingFeedbackError && visibleFeedbackCount > 0
          ? displayedFeedback.map((feedback, index) => {
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
                  testID={index === 0 ? 'feedback-thread-first' : `feedback-thread-${feedback.id}`}
                >
                  <FeedbackThreadCard
                    compact
                    description={feedback.description}
                    footerLabel={feedback.status === 'closed' ? 'Completed' : undefined}
                    footerLabelTone={feedback.status === 'closed' ? 'success' : 'muted'}
                    status={feedback.status}
                    timestampLabel={timestampLabel}
                    title={feedback.title}
                    tone="default"
                    unreadCount={unreadCount}
                  />
                </Pressable>
              );
            })
        : null}

        {!feedbackQuery.isLoading && !hasBlockingFeedbackError && visibleFeedbackCount > 0 && feedbackQuery.hasNextPage ? (
          <Button
            label={feedbackQuery.isFetchingNextPage ? 'Loading more...' : 'Load more feedback'}
            loading={feedbackQuery.isFetchingNextPage}
            onPress={() => {
              void feedbackQuery.fetchNextPage();
            }}
            variant="secondary"
          />
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
