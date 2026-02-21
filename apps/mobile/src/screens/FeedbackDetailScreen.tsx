import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_OPTIONS,
  FeedbackThreadCard,
  FeatureDetailScreenScaffold,
  FilterChipGroup,
  RoleBadge,
  Skeleton,
  type FeedbackStatus,
} from '../components/shared';
import {
  getFeedbackById,
  listFeedbackMessages,
  markFeedbackAsRead,
  sendFeedbackMessage,
  updateFeedbackStatus,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FeedbackDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'FeedbackDetail'>;

const STATUS_FILTER_OPTIONS: { label: string; value: FeedbackStatus }[] = FEEDBACK_STATUS_OPTIONS.map((status) => ({
  label: FEEDBACK_STATUS_LABELS[status],
  value: status,
}));

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

export function FeedbackDetailScreen({ navigation, route }: FeedbackDetailScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const queueWrite = useQueuedWrite();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const messagesScrollRef = useRef<ScrollView>(null);
  const feedbackId = route.params.feedbackId;
  const isAdmin = user?.isAdmin === true;

  const [draftMessage, setDraftMessage] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const feedbackQuery = useQuery({
    queryKey: ['feature', 'feedback', feedbackId],
    queryFn: () => getFeedbackById(feedbackId),
  });

  const messagesQuery = useQuery({
    queryKey: ['feature', 'feedback-messages', feedbackId],
    queryFn: () => listFeedbackMessages(feedbackId),
    refetchInterval: 3000,
  });

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
    if (!messagesQuery.data || messagesQuery.data.length === 0) {
      return;
    }

    messagesScrollRef.current?.scrollToEnd({ animated: true });
  }, [messagesQuery.data]);

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
    statusControlCard: {
      gap: theme.spacing.xs,
    },
    statusOptionsContent: {
      gap: theme.spacing.xs,
      paddingRight: theme.spacing.sm,
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
    messageAdminLabel: {
      color: theme.colors.text.muted,
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
      marginBottom: 2,
      textTransform: 'uppercase',
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
      setSendError('Message is required.');
      return;
    }

    setSendError(null);
    setIsSending(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('feedback.message.send', {
          feedbackId,
          message: draftMessage,
        });
        setDraftMessage('');
        await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback-messages', feedbackId] });
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
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Could not send message.';
      setSendError(nextMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusUpdate = async (nextStatus: FeedbackStatus) => {
    if (!isAdmin || !feedbackQuery.data || feedbackQuery.data.status === nextStatus || isUpdatingStatus) {
      return;
    }
    if (!isOnline) {
      setStatusError('Status updates require internet connection.');
      return;
    }

    setStatusError(null);
    setIsUpdatingStatus(true);

    try {
      await queueWrite('feedback.status.update');
      await updateFeedbackStatus(feedbackId, nextStatus);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback'] });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'feedback', feedbackId] });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Could not update status.';
      setStatusError(nextMessage);
    } finally {
      setIsUpdatingStatus(false);
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
      rightAccessory={isAdmin ? <RoleBadge /> : undefined}
      scroll={false}
      title="Feedback"
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
              ownerLabel={
                isAdmin
                  ? `From ${
                      feedbackQuery.data.userName?.trim() ||
                      feedbackQuery.data.userEmail?.trim() ||
                      'Unknown user'
                    }`
                  : undefined
              }
              status={feedbackQuery.data.status}
              timestampLabel={`Opened ${formatTimestamp(feedbackQuery.data.createdAt)}`}
              title={feedbackQuery.data.title}
              tone="muted"
            />

            {isAdmin ? (
              <Card style={styles.statusControlCard}>
                <Text variant="label">Update status</Text>
                {!isOnline ? (
                  <Text tone="warning" variant="bodySm">
                    You are offline. Admin status updates require internet connection.
                  </Text>
                ) : null}
                <FilterChipGroup
                  contentContainerStyle={styles.statusOptionsContent}
                  onChange={(nextStatus) => {
                    void handleStatusUpdate(nextStatus);
                  }}
                  options={STATUS_FILTER_OPTIONS}
                  scrollable
                  value={feedbackQuery.data.status}
                />
                {statusError ? <Text style={styles.inlineErrorText}>{statusError}</Text> : null}
              </Card>
            ) : null}

            <ScrollView
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
                    const isMine = messageItem.userId === user?.id;

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
                            <Text style={styles.messageAdminLabel}>Admin</Text>
                          ) : null}
                          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                            {messageItem.message}
                          </Text>
                          <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                            {formatTimestamp(messageItem.createdAt)}
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
                  value={draftMessage}
                />
                <Button
                  disabled={isSending || isUpdatingStatus || !draftMessage.trim()}
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
