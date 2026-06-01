import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  FeedbackThreadCard,
  HeaderAccessoryButton,
  PendingQueuedWriteRow,
  QueryListStateView,
} from '../components/shared';
import { feedbackQueryKeys, listFeedbackPage } from '../features';
import type { FeedbackRecord } from '../features/models';
import type { PaginatedResult } from '../features/store/featureStore';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Button, Text } from '../ui';

type FeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'Feedback'>;
type FeedbackBrowseData = InfiniteData<PaginatedResult<FeedbackRecord>, unknown>;

const FEEDBACK_PENDING_OPERATION_NAMES = ['feedback.create', 'feedback.message.send'] as const;

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
  pendingStack: {
    gap: theme.spacing.sm,
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
  const styles = useStyles();
  const browseState = useFeatureBrowse<FeedbackBrowseData, FeedbackRecord, 'feedback.create' | 'feedback.message.send'>({
    analyticsSource: 'FeedbackScreen',
    buildAnalyticsPayload: useCallback((overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'FeedbackScreen',
      resultCount: feedbackQuery.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0,
      ...overrides,
    }), [feedbackQuery.data]),
    getHasCachedData: useCallback((data: FeedbackBrowseData | undefined) => (data?.pages.length ?? 0) > 0, []),
    getItemsFromData: useCallback(
      (data: FeedbackBrowseData | undefined) => data?.pages.flatMap((page) => page.items) ?? [],
      [],
    ),
    getResultCountFromData: useCallback(
      (data: FeedbackBrowseData | undefined, fallbackCount: number) =>
        data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? fallbackCount,
      [],
    ),
    getTotalItemsFromData: useCallback(
      (data: FeedbackBrowseData | undefined, items: readonly FeedbackRecord[]) =>
        data?.pages[0]?.totalItems ?? items.length,
      [],
    ),
    loadMoreEventPrefix: 'FEEDBACK_LOAD_MORE',
    pendingQueuedWriteOperationNames: FEEDBACK_PENDING_OPERATION_NAMES,
    query: feedbackQuery,
    refreshEventPrefix: 'FEEDBACK_REFRESH',
    toPendingRow: useCallback((write: QueuedFeatureWrite<'feedback.create' | 'feedback.message.send'>) => {
      const payload = write.payload as { title?: string; message?: string; description?: string };

      return {
        id: write.id,
        createdAt: write.createdAt,
        description: payload.description ?? payload.message,
        idempotencyKey: write.idempotencyKey,
        lastError: write.lastError,
        status: write.status,
        title: payload.title?.trim() || 'Feedback message',
      };
    }, []),
  });
  const displayedFeedback = browseState.items;
  const visibleFeedbackCount = displayedFeedback.length;

  const handleBackToProfile = () => {
    navigation.navigate('Profile');
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      contentBackgroundTone="app"
      headerScrollMode="fixed"
      keyboardAware
      onRefresh={browseState.onRefresh}
      onBackPress={handleBackToProfile}
      refreshing={browseState.isRefreshing}
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
          {browseState.totalItems} {browseState.totalItems === 1 ? 'feedback thread' : 'feedback threads'} total
        </Text>
      ) : null}

      {browseState.pendingRows.length > 0 ? (
        <View style={styles.pendingStack}>
          <Text variant="label">Pending feedback</Text>
          {browseState.pendingRows.map((row) => {
            return (
              <PendingQueuedWriteRow
                key={row.id}
                createdAt={row.createdAt}
                description={row.description}
                idempotencyKey={row.idempotencyKey}
                lastError={row.lastError}
                status={row.status}
                title={row.title}
              />
            );
          })}
        </View>
      ) : null}

      <View style={styles.historySection}>
        <QueryListStateView
          analyticsProps={browseState.analyticsProps}
          analyticsSource={browseState.analyticsSource}
          blockingErrorMessage="Could not load feedback history."
          emptyDescription="Your submitted feedback will appear here. Tap the plus button above to start a new thread."
          emptyTitle="No feedback yet"
          hasBlockingError={browseState.hasBlockingError}
          hasRefreshError={browseState.hasRefreshError}
          isLoading={browseState.isLoading}
          onRetry={() => {
            void feedbackQuery.refetch();
          }}
          refreshErrorMessage="Could not refresh feedback history. Showing saved data."
          showEmpty={browseState.showEmpty}
          title="Feedback unavailable"
        >
          {feedbackQuery.isSuccess && visibleFeedbackCount > 0
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
        </QueryListStateView>

        {!browseState.isLoading && !browseState.hasBlockingError && visibleFeedbackCount > 0 && browseState.hasNextPage ? (
          <Button
            label={browseState.isFetchingNextPage ? 'Loading more...' : 'Load more feedback'}
            loading={browseState.isFetchingNextPage}
            onPress={() => {
              void browseState.onEndReached();
            }}
            variant="secondary"
          />
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
