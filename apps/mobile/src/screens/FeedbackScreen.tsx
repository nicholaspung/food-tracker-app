import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  EmptyState,
  FeedbackThreadCard,
  HeaderAccessoryButton,
  Skeleton,
} from '../components/shared';
import { feedbackQueryKeys, listFeedbackPage } from '../features';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Button, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'Feedback'>;

const useStyles = createThemedStyles((theme) => ({
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
  },
}));

export function FeedbackScreen({ navigation }: FeedbackScreenProps) {
  const feedbackQuery = useInfiniteQuery({
    queryKey: feedbackQueryKeys.list,
    queryFn: ({ pageParam, signal }) =>
      listFeedbackPage({
        status: 'all',
        page: pageParam,
        pageSize: 20,
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });
  const feedbackState = usePaginatedQueryState({
    data: feedbackQuery.data,
    isError: feedbackQuery.isError,
    isFetching: feedbackQuery.isFetching,
    isLoading: feedbackQuery.isLoading,
    isSuccess: feedbackQuery.isSuccess,
  });
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(feedbackQuery.isRefetching);
  const displayedFeedback = feedbackState.items;
  const visibleFeedbackCount = displayedFeedback.length;
  const styles = useStyles();
  const buildBrowseAnalyticsPayload = (overrides?: Record<string, string | number | boolean | null>) => ({
    source: 'FeedbackScreen',
    resultCount: visibleFeedbackCount,
    ...overrides,
  });

  const handleBackToProfile = () => {
    navigation.navigate('Profile');
  };
  const handleRefresh = async () => {
    await runPullRefresh(async () => {
      const resultCountBefore = visibleFeedbackCount;
      trackObservabilityEvent('FEEDBACK_REFRESH_STARTED', buildBrowseAnalyticsPayload({
        resultCountBefore,
      }));

      try {
        const result = await feedbackQuery.refetch();
        const resultCountAfter = result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? resultCountBefore;
        trackObservabilityEvent('FEEDBACK_REFRESH_COMPLETED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          resultCountAfter,
          deltaCount: resultCountAfter - resultCountBefore,
        }));
      } catch (error) {
        trackObservabilityEvent('FEEDBACK_REFRESH_FAILED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        }));
        throw error;
      }
    });
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      contentBackgroundTone="app"
      keyboardAware
      onRefresh={handleRefresh}
      onBackPress={handleBackToProfile}
      refreshing={isPullRefreshing}
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
        <Text style={styles.countSummaryText} variant="bodySmTightSemiBold">
          {feedbackState.totalItems} {feedbackState.totalItems === 1 ? 'feedback thread' : 'feedback threads'} total
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
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="FeedbackScreen"
          errorMessage={
            feedbackState.hasBlockingError
              ? 'Could not load feedback history.'
              : feedbackState.hasRefreshError
                ? 'Could not refresh feedback history. Showing saved data.'
                : null
          }
          title="Feedback unavailable"
          actionLabel="Retry"
          onAction={() => {
            void feedbackQuery.refetch();
          }}
        />

        {feedbackState.hasResolvedData && !feedbackState.hasBlockingError && visibleFeedbackCount === 0 ? (
          <EmptyState
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="FeedbackScreen"
            description="Your submitted feedback will appear here. Tap the plus button above to start a new thread."
            title="No feedback yet"
          />
        ) : null}

        {feedbackQuery.isSuccess && !feedbackState.hasBlockingError && visibleFeedbackCount > 0
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

        {!feedbackQuery.isLoading && !feedbackState.hasBlockingError && visibleFeedbackCount > 0 && feedbackQuery.hasNextPage ? (
          <Button
            label={feedbackQuery.isFetchingNextPage ? 'Loading more...' : 'Load more feedback'}
            loading={feedbackQuery.isFetchingNextPage}
            onPress={() => {
              const resultCountBefore = visibleFeedbackCount;
              trackObservabilityEvent('FEEDBACK_LOAD_MORE_STARTED', buildBrowseAnalyticsPayload({
                resultCountBefore,
              }));
              void feedbackQuery.fetchNextPage()
                .then((result) => {
                  const resultCountAfter =
                    result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? resultCountBefore;
                  trackObservabilityEvent('FEEDBACK_LOAD_MORE_COMPLETED', buildBrowseAnalyticsPayload({
                    resultCountBefore,
                    resultCountAfter,
                    deltaCount: resultCountAfter - resultCountBefore,
                  }));
                })
                .catch((error) => {
                  trackObservabilityEvent('FEEDBACK_LOAD_MORE_FAILED', buildBrowseAnalyticsPayload({
                    resultCountBefore,
                    errorType: error instanceof Error ? error.name : 'unknown_error',
                  }));
                });
            }}
            variant="secondary"
          />
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
