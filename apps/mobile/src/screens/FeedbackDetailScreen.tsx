import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useKeyboardState } from 'react-native-keyboard-controller';

import {
  EmptyState,
  FeedbackThreadCard,
  FeatureDetailScreenScaffold,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  type FeedbackMessageListQueryData,
  type FeedbackListQueryData,
  type FeedbackRecord,
  type FeedbackThreadDetailResult,
  feedbackQueryKeys,
  getFeedbackThreadDetail,
  listFeedbackMessagesPage,
  markFeedbackAsRead,
  mergeFeedbackRecord,
  replaceFeedbackMessageFirstPage,
  upsertFeedbackListItem,
  useFeedbackWrites,
} from '../features';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'FeedbackDetail'>;

const ACTIVE_MESSAGE_POLL_INTERVAL_MS = 3000;
const IDLE_MESSAGE_POLL_INTERVAL_MS = 30000;
const RECENT_THREAD_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;

const useStyles = createThemedStyles((theme) => ({
  bodyRoot: {
    flex: 1,
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  body: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    maxWidth: '82%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  messageBubbleMine: {
    backgroundColor: theme.colors.fill.brand,
    borderColor: theme.colors.fill.brand,
  },
  messageBubbleOther: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
  },
  messageSenderBadge: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xxs,
  },
  messageText: {
    color: theme.colors.text.primary,
  },
  messageTextMine: {
    color: theme.colors.text.inverse,
  },
  messageTime: {
    color: theme.colors.text.muted,
    marginTop: 3,
  },
  messageTimeMine: {
    color: theme.colors.text.inverse,
    opacity: 0.8,
  },
  composer: {
    backgroundColor: theme.colors.background.surface,
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    marginHorizontal: -theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  composerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  composerInputContainer: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 0,
    minWidth: 0,
  },
  composerInput: {
    maxHeight: 120,
    minHeight: 46,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
    width: '100%',
  },
  sendButton: {
    flexShrink: 0,
    minWidth: 72,
  },
  inlineErrorText: {
    color: theme.colors.text.danger,
  },
}));

function isRecentTimestamp(value?: string, maxAgeMs = RECENT_THREAD_ACTIVITY_WINDOW_MS): boolean {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return Date.now() - parsed.getTime() <= maxAgeMs;
}

function resolveMessagesRefetchInterval(input: {
  isFocused: boolean;
  isOnline: boolean;
  lastMessageAt?: string;
  userUnreadCount: number;
}): number | false {
  if (!input.isFocused || !input.isOnline) {
    return false;
  }

  if (input.userUnreadCount > 0 || isRecentTimestamp(input.lastMessageAt)) {
    return ACTIVE_MESSAGE_POLL_INTERVAL_MS;
  }

  return IDLE_MESSAGE_POLL_INTERVAL_MS;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function resolveAdminReplyLabel(userName?: string, userEmail?: string): string {
  const trimmedName = userName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = userEmail?.trim();
  if (trimmedEmail) {
    return trimmedEmail.split('@')[0];
  }

  return 'Admin';
}

function formatRelativeReplyTime(value: string, isMine: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return isMine ? 'You replied recently' : 'Replied recently';
  }

  const elapsedMs = Math.max(0, Date.now() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
  const prefix = isMine ? 'You replied' : 'Replied';

  if (elapsedMinutes < 1) {
    return `${prefix} just now`;
  }

  if (elapsedMinutes < 60) {
    return `${prefix} ${elapsedMinutes} ${elapsedMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${prefix} ${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `${prefix} ${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'} ago`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${prefix} ${elapsedMonths} ${elapsedMonths === 1 ? 'month' : 'months'} ago`;
  }

  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${prefix} ${elapsedYears} ${elapsedYears === 1 ? 'year' : 'years'} ago`;
}

export function FeedbackDetailScreen({ navigation, route }: FeedbackDetailScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const feedbackWrites = useFeedbackWrites();
  const { isOnline } = useConnectivity();
  const isFocused = useIsFocused();
  const messagesScrollRef = useRef<ScrollView>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackId = route.params.feedbackId;
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);

  const [draftMessage, setDraftMessage] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [hasHydratedInitialMessages, setHasHydratedInitialMessages] = useState(false);
  const threadQueryKey = useMemo(() => feedbackQueryKeys.thread(feedbackId), [feedbackId]);
  const messagesQueryKey = useMemo(() => feedbackQueryKeys.messages(feedbackId), [feedbackId]);

  const threadQuery = useQuery({
    queryKey: threadQueryKey,
    queryFn: ({ signal }) => getFeedbackThreadDetail(feedbackId, { signal }),
  });
  const feedback = threadQuery.data?.feedback;
  const hasCachedMessages = queryClient.getQueryData<FeedbackMessageListQueryData>(messagesQueryKey) !== undefined;

  useEffect(() => {
    setHasHydratedInitialMessages(false);
  }, [feedbackId]);

  useEffect(() => {
    if (!threadQuery.data?.messages) {
      return;
    }

    queryClient.setQueryData<FeedbackMessageListQueryData | undefined>(messagesQueryKey, (currentMessages) =>
      replaceFeedbackMessageFirstPage(currentMessages, threadQuery.data.messages),
    );
    setHasHydratedInitialMessages(true);
  }, [messagesQueryKey, queryClient, threadQuery.data]);

  const messagesQuery = useInfiniteQuery({
    queryKey: messagesQueryKey,
    queryFn: ({ pageParam, signal }) =>
      listFeedbackMessagesPage(feedbackId, {
        page: pageParam,
        pageSize: 20,
        order: 'desc',
        signal,
      }),
    initialPageParam: 1,
    enabled: hasCachedMessages || hasHydratedInitialMessages,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    staleTime: ACTIVE_MESSAGE_POLL_INTERVAL_MS,
    refetchInterval: (query) => {
      const latestMessageAt = query.state.data?.pages[0]?.items[0]?.createdAt ?? feedback?.lastMessageAt;

      return resolveMessagesRefetchInterval({
        isFocused,
        isOnline,
        lastMessageAt: latestMessageAt,
        userUnreadCount: feedback?.userUnreadCount ?? 0,
      });
    },
  });
  const messagesState = usePaginatedQueryState({
    data: messagesQuery.data,
    isError: messagesQuery.isError,
    isFetching: messagesQuery.isFetching,
    isLoading: messagesQuery.isLoading,
    isSuccess: messagesQuery.isSuccess,
  });
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(
    threadQuery.isRefetching || messagesQuery.isRefetching,
  );
  const displayedMessages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return pages
      .slice()
      .reverse()
      .flatMap((page) => [...page.items].reverse());
  }, [messagesQuery.data]);
  const hasBlockingMessagesError = messagesState.hasBlockingError;
  const hasMessagesRefreshError = messagesState.hasRefreshError;
  const latestMessageId = displayedMessages[displayedMessages.length - 1]?.id;

  const applyFeedbackThreadUpdate = useCallback(
    (nextFeedback: FeedbackRecord, options?: { moveToFront?: boolean }) => {
      queryClient.setQueryData(
        threadQueryKey,
        (currentThread: FeedbackThreadDetailResult | undefined) =>
          currentThread
            ? {
                ...currentThread,
                feedback: mergeFeedbackRecord(currentThread.feedback, nextFeedback),
              }
            : currentThread,
      );
      queryClient.setQueryData<FeedbackListQueryData | undefined>(feedbackQueryKeys.list, (currentFeedback) =>
        upsertFeedbackListItem(currentFeedback, nextFeedback, {
          moveToFront: options?.moveToFront,
        }),
      );
    },
    [queryClient, threadQueryKey],
  );

  const scheduleScrollToLatestMessage = useCallback((animated = true, delay = 0) => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      messagesScrollRef.current?.scrollToEnd({ animated });
    }, delay);
  }, []);

  useEffect(() => {
    if (!isFocused || !feedback || feedback.userUnreadCount <= 0) {
      return;
    }

    let isCancelled = false;

    const markRead = async () => {
      try {
        const result = await markFeedbackAsRead(feedbackId);
        if (isCancelled || !result.markedRead) {
          return;
        }

        applyFeedbackThreadUpdate(result.feedback);
      } catch {
        // Keep thread available even if read-marking fails.
      }
    };

    void markRead();

    return () => {
      isCancelled = true;
    };
  }, [applyFeedbackThreadUpdate, feedback, feedbackId, isFocused]);

  useEffect(() => {
    if (!latestMessageId) {
      return;
    }

    scheduleScrollToLatestMessage(true);
  }, [latestMessageId, scheduleScrollToLatestMessage]);

  useEffect(() => {
    const keyboardScrollDelay = Platform.OS === 'ios' ? 0 : 16;
    const keyboardScrollAnimated = Platform.OS === 'ios';

    if (isKeyboardVisible) {
      scheduleScrollToLatestMessage(keyboardScrollAnimated, keyboardScrollDelay);
    }

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isKeyboardVisible, scheduleScrollToLatestMessage]);

  const handleSendMessage = async () => {
    if (!draftMessage.trim()) {
      trackObservabilityEvent('FEEDBACK_DETAIL_MESSAGE_SEND_VALIDATION_FAILED', {
        source: 'FeedbackDetailScreen',
        feedbackId,
        reason: 'missing_message',
      });
      setSendError('Message is required.');
      return;
    }

    setSendError(null);
    trackObservabilityEvent('FEEDBACK_DETAIL_MESSAGE_SEND_STARTED', {
      source: 'FeedbackDetailScreen',
      feedbackId,
      isOnline,
      messageLength: draftMessage.trim().length,
    });
    setIsSending(true);

    try {
      const sendResult = await feedbackWrites.sendFeedbackMessage({
        feedbackId,
        message: draftMessage,
      });

      if (sendResult.status === 'queued') {
        setDraftMessage('');
        trackObservabilityEvent('FEEDBACK_DETAIL_MESSAGE_SEND_SUCCEEDED', {
          source: 'FeedbackDetailScreen',
          feedbackId,
          queued: true,
        });
        return;
      }

      setDraftMessage('');
      trackObservabilityEvent('FEEDBACK_DETAIL_MESSAGE_SEND_SUCCEEDED', {
        source: 'FeedbackDetailScreen',
        feedbackId,
        queued: false,
      });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Could not send message.';
      setSendError(nextMessage);
      trackObservabilityEvent('FEEDBACK_DETAIL_MESSAGE_SEND_FAILED', {
        source: 'FeedbackDetailScreen',
        feedbackId,
        error: nextMessage,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Feedback');
  };
  const handleRefresh = useCallback(async () => {
    await runPullRefresh(async () => {
      await Promise.all([threadQuery.refetch(), messagesQuery.refetch()]);
    });
  }, [messagesQuery, runPullRefresh, threadQuery]);

  return (
    <FeatureDetailScreenScaffold
      backAccessibilityLabel="Back to feedback"
      bodyStyle={styles.bodyRoot}
      contentBackgroundTone="app"
      keyboardAware
      onBackPress={handleBackPress}
      scroll={false}
      testID="feedback-detail-screen"
      title={feedback?.title?.trim() || 'Feedback'}
    >
      <View style={styles.body}>
        {threadQuery.isLoading ? (
          <>
            <Skeleton height={22} />
            <Skeleton height={88} />
            <Skeleton height={160} />
          </>
        ) : null}

        <PageErrorToast
          actionLabel="Retry"
          errorMessage={threadQuery.isError ? 'Could not load this feedback thread.' : null}
          onAction={() => {
            void threadQuery.refetch();
          }}
          title="Thread unavailable"
        />

        {!threadQuery.isLoading && !threadQuery.isError && !feedback ? (
          <EmptyState description="This feedback thread could not be found." title="Feedback missing" />
        ) : null}

        {feedback ? (
          <>
            <FeedbackThreadCard
              description={feedback.description}
              status={feedback.status}
              timestampLabel={`Opened ${formatTimestamp(feedback.createdAt)}`}
              title={feedback.title}
              tone="default"
            />

            <ScrollView
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.messagesContent}
              refreshControl={
                <RefreshControl
                  colors={[theme.colors.text.brand]}
                  onRefresh={handleRefresh}
                  progressBackgroundColor={theme.colors.background.surface}
                  refreshing={isPullRefreshing}
                  tintColor={theme.colors.text.brand}
                />
              }
              ref={messagesScrollRef}
              style={styles.messagesContainer}
            >
              {threadQuery.isLoading || messagesQuery.isLoading ? (
                <>
                  <Skeleton height={60} />
                  <Skeleton height={60} />
                </>
              ) : null}

              <PageErrorToast
                actionLabel="Retry"
                errorMessage={
                  hasBlockingMessagesError
                    ? 'Could not load messages for this feedback.'
                    : hasMessagesRefreshError
                      ? 'Could not refresh messages. Showing saved history.'
                      : null
                }
                onAction={() => {
                  void messagesQuery.refetch();
                }}
                title="Messages unavailable"
              />

              {!messagesQuery.isLoading && !hasBlockingMessagesError && messagesQuery.hasNextPage ? (
                <Button
                  label={messagesQuery.isFetchingNextPage ? 'Loading older messages...' : 'Load older messages'}
                  loading={messagesQuery.isFetchingNextPage}
                  onPress={() => {
                    void messagesQuery.fetchNextPage();
                  }}
                  variant="secondary"
                />
              ) : null}

              {!messagesQuery.isLoading && !hasBlockingMessagesError && displayedMessages.length === 0 ? (
                <EmptyState description="Start the conversation with support." title="No messages yet" />
              ) : null}

              {!messagesQuery.isLoading && !hasBlockingMessagesError
                ? displayedMessages.map((messageItem) => {
                    const isMine = !messageItem.isAdminMessage;

                    return (
                      <View
                        key={messageItem.id}
                        style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
                      >
                        <View
                          style={[
                            styles.messageBubble,
                            isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
                          ]}
                        >
                          {messageItem.isAdminMessage && !isMine ? (
                            <StatusPill
                              label={resolveAdminReplyLabel(messageItem.userName, messageItem.userEmail)}
                              labelStyle={{ textTransform: 'none' }}
                              style={styles.messageSenderBadge}
                              tone="info"
                              variant="soft"
                            />
                          ) : null}
                          <Text style={[styles.messageText, isMine && styles.messageTextMine]} variant="bodyMd">
                            {messageItem.message}
                          </Text>
                          <Text style={[styles.messageTime, isMine && styles.messageTimeMine]} variant="captionRegular">
                            {formatRelativeReplyTime(messageItem.createdAt, isMine)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                : null}
            </ScrollView>

            <View style={styles.composer}>
              {sendError ? <Text style={styles.inlineErrorText} variant="bodySmTight">{sendError}</Text> : null}
              <View style={styles.composerRow}>
                <Input
                  containerStyle={styles.composerInputContainer}
                  inputStyle={styles.composerInput}
                  multiline
                  onChangeText={setDraftMessage}
                  placeholder="Type your message..."
                  testID="feedback-detail-message-input"
                  value={draftMessage}
                />
                <Button
                  disabled={isSending || !draftMessage.trim()}
                  label={isSending ? 'Sending...' : 'Send'}
                  onPress={() => {
                    void handleSendMessage();
                  }}
                  style={styles.sendButton}
                />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </FeatureDetailScreenScaffold>
  );
}
