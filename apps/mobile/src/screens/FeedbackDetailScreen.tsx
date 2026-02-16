import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, RoleBadge, Skeleton, StatusPill, type StatusPillTone } from '../components/shared';
import {
  getFeedbackById,
  listFeedbackMessages,
  markFeedbackAsRead,
  sendFeedbackMessage,
  updateFeedbackStatus,
  type FeedbackRecord,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

type FeedbackDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'FeedbackDetail'>;
type FeedbackStatus = FeedbackRecord['status'];

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_OPTIONS: FeedbackStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

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
  const { user } = useAuth();
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
    screenContent: {
      backgroundColor: theme.colors.background.muted,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    header: {
      backgroundColor: theme.colors.background.surface,
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    headerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    backButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    headerTitle: {
      color: theme.colors.text.primary,
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 30,
    },
    body: {
      flex: 1,
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    threadCard: {
      gap: theme.spacing.xxs,
    },
    threadHeaderRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    threadTitle: {
      color: theme.colors.text.primary,
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    ownerText: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    descriptionText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    timestampText: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    statusControlCard: {
      gap: theme.spacing.xs,
    },
    statusOptionsContent: {
      gap: theme.spacing.xs,
      paddingRight: theme.spacing.sm,
    },
    statusOptionChip: {
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xxs,
    },
    statusOptionChipActive: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
    },
    statusOptionLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    statusOptionLabelActive: {
      color: theme.colors.text.info,
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
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    composerRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    composerInputContainer: {
      flex: 1,
      gap: 0,
    },
    composerInput: {
      maxHeight: 120,
      minHeight: 46,
      paddingTop: theme.spacing.sm,
      textAlignVertical: 'top',
    },
    sendButton: {
      minWidth: 72,
    },
    inlineErrorText: {
      color: theme.colors.text.danger,
      fontSize: 12,
      lineHeight: 16,
    },
  });

  const statusTone = useMemo<StatusPillTone>(() => {
    const status = feedbackQuery.data?.status ?? 'open';

    if (status === 'in_progress') {
      return 'warning';
    }

    if (status === 'resolved') {
      return 'success';
    }

    if (status === 'closed') {
      return 'muted';
    }

    return 'info';
  }, [feedbackQuery.data?.status]);

  const handleSendMessage = async () => {
    if (!draftMessage.trim()) {
      setSendError('Message is required.');
      return;
    }

    setSendError(null);
    setIsSending(true);

    try {
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

    setStatusError(null);
    setIsUpdatingStatus(true);

    try {
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

  return (
    <Screen background="surface" contentStyle={styles.screenContent} edges={['top']} keyboardAware padded={false}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Back to feedback"
            accessibilityRole="button"
            onPress={() => {
              navigation.navigate('Feedback');
            }}
            style={styles.backButton}
          >
            <Ionicons color={theme.colors.text.primary} name="chevron-back" size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>Feedback</Text>
          {isAdmin ? <RoleBadge style={{ marginLeft: 'auto' }} /> : null}
        </View>
      </View>

      <View style={styles.body}>
        {feedbackQuery.isLoading ? (
          <>
            <Skeleton height={22} />
            <Skeleton height={88} />
            <Skeleton height={160} />
          </>
        ) : null}

        {feedbackQuery.isError ? (
          <ErrorState
            description="Could not load this feedback thread."
            onRetry={() => {
              void feedbackQuery.refetch();
            }}
            title="Thread unavailable"
          />
        ) : null}

        {!feedbackQuery.isLoading && !feedbackQuery.isError && !feedbackQuery.data ? (
          <EmptyState description="This feedback thread could not be found." title="Feedback missing" />
        ) : null}

        {feedbackQuery.data ? (
          <>
            <Card style={styles.threadCard} tone="muted">
              <View style={styles.threadHeaderRow}>
                <Text style={styles.threadTitle}>{feedbackQuery.data.title}</Text>
                <StatusPill
                  label={STATUS_LABELS[feedbackQuery.data.status]}
                  tone={statusTone}
                  uppercase
                  variant="soft"
                />
              </View>
              {isAdmin ? (
                <Text style={styles.ownerText}>
                  From{' '}
                  {feedbackQuery.data.userName?.trim() ||
                    feedbackQuery.data.userEmail?.trim() ||
                    feedbackQuery.data.userId}
                </Text>
              ) : null}
              <Text style={styles.descriptionText}>{feedbackQuery.data.description}</Text>
              <Text style={styles.timestampText}>Opened {formatTimestamp(feedbackQuery.data.createdAt)}</Text>
            </Card>

            {isAdmin ? (
              <Card style={styles.statusControlCard}>
                <Text variant="label">Update status</Text>
                <ScrollView
                  contentContainerStyle={styles.statusOptionsContent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {STATUS_OPTIONS.map((statusOption) => {
                    const isSelected = feedbackQuery.data?.status === statusOption;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={statusOption}
                        onPress={() => {
                          void handleStatusUpdate(statusOption);
                        }}
                        style={[styles.statusOptionChip, isSelected && styles.statusOptionChipActive]}
                      >
                        <Text style={[styles.statusOptionLabel, isSelected && styles.statusOptionLabelActive]}>
                          {STATUS_LABELS[statusOption]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
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

              {messagesQuery.isError ? (
                <ErrorState
                  description="Could not load messages for this feedback."
                  onRetry={() => {
                    void messagesQuery.refetch();
                  }}
                  title="Messages unavailable"
                />
              ) : null}

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
    </Screen>
  );
}
