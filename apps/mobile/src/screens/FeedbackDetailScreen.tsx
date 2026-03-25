import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useKeyboardState } from 'react-native-keyboard-controller';

import {
  EmptyState,
  FeedbackThreadCard,
  FeatureDetailScreenScaffold,
  Skeleton,
  StatusPill,
} from '../components/shared';
import {
  getFeedbackById,
  listFeedbackMessages,
  markFeedbackAsRead,
  sendFeedbackMessage,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'FeedbackDetail'>;

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
  const queryClient = useQueryClient();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const queueWrite = useQueuedWrite();
  const { isOnline } = useConnectivity();
  const messagesScrollRef = useRef<ScrollView>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackId = route.params.feedbackId;
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);

  const [draftMessage, setDraftMessage] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const feedbackQuery = useQuery({
    queryKey: ['feature', 'feedback', feedbackId],
    queryFn: () => getFeedbackById(feedbackId),
  });

  const messagesQuery = useQuery({
    queryKey: ['feature', 'feedback-messages', feedbackId],
    queryFn: () => listFeedbackMessages(feedbackId),
    refetchInterval: 3000,
  });
  const latestMessageId = messagesQuery.data?.[messagesQuery.data.length - 1]?.id;

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
    if (!feedbackQuery.data) {
      return;
    }

    let isCancelled = false;

    const markRead = async () => {
      try {
        const didMarkAsRead = await markFeedbackAsRead(feedbackId);
        if (isCancelled || !didMarkAsRead) {
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback'] });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback', feedbackId] });
      } catch {
        // Keep thread available even if read-marking fails.
      }
    };

    void markRead();

    return () => {
      isCancelled = true;
    };
  }, [feedbackId, feedbackQuery.data, queryClient]);

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

  const styles = StyleSheet.create({
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
      backgroundColor: theme.colors.text.brand,
      borderColor: theme.colors.text.brand,
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
      fontSize: 14,
      lineHeight: 20,
    },
    messageTextMine: {
      color: theme.colors.text.inverse,
    },
    messageTime: {
      color: theme.colors.text.muted,
      fontSize: 11,
      lineHeight: 14,
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
      fontSize: 12,
      lineHeight: 16,
    },
  });

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
      if (!isOnline) {
        await queueFeatureOutbox('feedback.message.send', {
          feedbackId,
          message: draftMessage,
        });
        setDraftMessage('');
        await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback-messages', feedbackId] });
        trackObservabilityEvent('FEEDBACK_DETAIL_MESSAGE_SEND_SUCCEEDED', {
          source: 'FeedbackDetailScreen',
          feedbackId,
          queued: true,
        });
        return;
      }

      await queueWrite('feedback.message.send');
      await sendFeedbackMessage({
        feedbackId,
        message: draftMessage,
      });

      setDraftMessage('');
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback-messages', feedbackId] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback', feedbackId] });
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

  return (
    <FeatureDetailScreenScaffold
      backAccessibilityLabel="Back to feedback"
      bodyStyle={styles.bodyRoot}
      contentBackgroundTone="app"
      keyboardAware
      onBackPress={handleBackPress}
      scroll={false}
      testID="feedback-detail-screen"
      title={feedbackQuery.data?.title?.trim() || 'Feedback'}
    >
      <View style={styles.body}>
        {feedbackQuery.isLoading ? (
          <>
            <Skeleton height={22} />
            <Skeleton height={88} />
            <Skeleton height={160} />
          </>
        ) : null}

        <PageErrorToast
          actionLabel="Retry"
          errorMessage={feedbackQuery.isError ? 'Could not load this feedback thread.' : null}
          onAction={() => {
            void feedbackQuery.refetch();
          }}
          title="Thread unavailable"
        />

        {!feedbackQuery.isLoading && !feedbackQuery.isError && !feedbackQuery.data ? (
          <EmptyState description="This feedback thread could not be found." title="Feedback missing" />
        ) : null}

        {feedbackQuery.data ? (
          <>
            <FeedbackThreadCard
              description={feedbackQuery.data.description}
              status={feedbackQuery.data.status}
              timestampLabel={`Opened ${formatTimestamp(feedbackQuery.data.createdAt)}`}
              title={feedbackQuery.data.title}
              tone="default"
            />

            <ScrollView
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.messagesContent}
              ref={messagesScrollRef}
              style={styles.messagesContainer}
            >
              {messagesQuery.isLoading ? (
                <>
                  <Skeleton height={60} />
                  <Skeleton height={60} />
                </>
              ) : null}

              <PageErrorToast
                actionLabel="Retry"
                errorMessage={messagesQuery.isError ? 'Could not load messages for this feedback.' : null}
                onAction={() => {
                  void messagesQuery.refetch();
                }}
                title="Messages unavailable"
              />

              {!messagesQuery.isLoading && !messagesQuery.isError && (messagesQuery.data?.length ?? 0) === 0 ? (
                <EmptyState description="Start the conversation with support." title="No messages yet" />
              ) : null}

              {!messagesQuery.isLoading && !messagesQuery.isError
                ? (messagesQuery.data ?? []).map((messageItem) => {
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
                          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                            {messageItem.message}
                          </Text>
                          <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                            {formatRelativeReplyTime(messageItem.createdAt, isMine)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                : null}
            </ScrollView>

            <View style={styles.composer}>
              {sendError ? <Text style={styles.inlineErrorText}>{sendError}</Text> : null}
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
