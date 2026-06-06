import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, Pressable, View, type ListRenderItem } from 'react-native';
import type { InfiniteData } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  BackHeaderScreenScaffold,
  FeedbackThreadCard,
  HeaderAccessoryButton,
  PageErrorToast,
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
  screenBody: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  listHeader: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
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
  listFooter: {
    paddingTop: theme.spacing.md,
  },
  feedbackSeparator: {
    height: theme.spacing.sm,
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

  const renderFeedbackItem = useCallback<ListRenderItem<FeedbackRecord>>(
    ({ item: feedback, index }) => {
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
    },
    [navigation, styles.feedbackPressable],
  );

  const feedbackListHeader = (
    <View style={styles.listHeader}>
      {!browseState.isLoading && !browseState.hasBlockingError && !browseState.showEmpty ? (
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

      <PageErrorToast
        analyticsProps={browseState.analyticsProps}
        analyticsSource={browseState.analyticsSource}
        errorMessage={
          !browseState.isLoading &&
          !browseState.hasBlockingError &&
          visibleFeedbackCount > 0 &&
          browseState.hasRefreshError
            ? 'Could not refresh feedback history. Showing saved data.'
            : null
        }
        onAction={() => {
          void feedbackQuery.refetch();
        }}
        title="Feedback unavailable"
      />
    </View>
  );

  const feedbackListEmptyComponent = (
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
    />
  );

  const feedbackListFooter =
    !browseState.isLoading && !browseState.hasBlockingError && visibleFeedbackCount > 0 && browseState.hasNextPage ? (
      <View style={styles.listFooter}>
        <Button
          label={browseState.isFetchingNextPage ? 'Loading more...' : 'Load more feedback'}
          loading={browseState.isFetchingNextPage}
          onPress={() => {
            void browseState.onEndReached();
          }}
          variant="secondary"
        />
      </View>
    ) : null;

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.screenBody}
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
      scroll={false}
      screenBackgroundTone="surface"
    >
      <FlatList
        contentContainerStyle={styles.listContent}
        data={browseState.isLoading || browseState.hasBlockingError ? [] : displayedFeedback}
        initialNumToRender={10}
        ItemSeparatorComponent={() => <View style={styles.feedbackSeparator} />}
        keyExtractor={(feedback) => feedback.id}
        ListEmptyComponent={feedbackListEmptyComponent}
        ListFooterComponent={feedbackListFooter}
        ListHeaderComponent={feedbackListHeader}
        maxToRenderPerBatch={10}
        onRefresh={browseState.onRefresh}
        refreshing={browseState.isRefreshing}
        removeClippedSubviews
        renderItem={renderFeedbackItem}
        style={styles.list}
        windowSize={7}
      />
    </BackHeaderScreenScaffold>
  );
}
