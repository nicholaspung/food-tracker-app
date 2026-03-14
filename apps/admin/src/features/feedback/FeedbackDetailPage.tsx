import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  claimFeedbackThread,
  getFeedbackThread,
  listFeedbackMessages,
  releaseFeedbackThread,
  sendAdminFeedbackMessage,
} from '@/features/feedback/api';
import {
  getFeedbackAssignmentState,
  getFeedbackParticipantName,
  getFeedbackParticipantSubtitle,
} from '@/features/feedback/display';
import { formatDateTime } from '@/lib/formatters';
import type { FeedbackMessage } from '@/lib/types';

function getMessageAuthorLabel(message: FeedbackMessage) {
  const baseName = getFeedbackParticipantName(message.expand?.user, message.user);

  return message.is_admin_message ? `${baseName} (Admin)` : baseName;
}

export function FeedbackDetailPage() {
  const { threadId = '' } = useParams();
  const queryClient = useQueryClient();
  const { user: adminUser } = useAuth();
  const [draftReply, setDraftReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);

  const threadQuery = useQuery({
    enabled: Boolean(threadId),
    queryKey: ['admin', 'feedback-thread', threadId],
    queryFn: () => getFeedbackThread(threadId),
    refetchInterval: 10000,
  });

  const messagesQuery = useQuery({
    enabled: Boolean(threadId),
    queryKey: ['admin', 'feedback-thread-messages', threadId],
    queryFn: () => listFeedbackMessages(threadId),
    refetchInterval: 5000,
  });

  const thread = threadQuery.data;
  const threadUserName = getFeedbackParticipantName(thread?.expand?.user, thread?.user);
  const threadUserSubtitle = getFeedbackParticipantSubtitle(thread?.expand?.user, thread?.user);
  const adminDisplayName = getFeedbackParticipantName(adminUser, adminUser?.id);
  const adminSubtitle = getFeedbackParticipantSubtitle(adminUser, adminUser?.id);
  const assignment = thread ? getFeedbackAssignmentState(thread, adminUser?.id) : null;
  const conversation = useMemo(() => {
    const items: Array<{
      authorLabel: string;
      authorSubtitle: string | null;
      created: string;
      id: string;
      isAdminMessage: boolean;
      isFirstMessage: boolean;
      message: string;
    }> = [];
    const firstMessage = thread?.description?.trim();

    if (thread && firstMessage) {
      items.push({
        authorLabel: threadUserName,
        authorSubtitle: threadUserSubtitle,
        created: thread.created,
        id: `${thread.id}-first-message`,
        isAdminMessage: false,
        isFirstMessage: true,
        message: firstMessage,
      });
    }

    for (const message of messagesQuery.data ?? []) {
      items.push({
        authorLabel: getMessageAuthorLabel(message),
        authorSubtitle: getFeedbackParticipantSubtitle(message.expand?.user, message.user),
        created: message.created,
        id: message.id,
        isAdminMessage: message.is_admin_message,
        isFirstMessage: false,
        message: message.message,
      });
    }

    return items;
  }, [messagesQuery.data, thread, threadUserName, threadUserSubtitle]);

  const replyMutation = useMutation({
    mutationFn: async () => {
      return sendAdminFeedbackMessage({
        message: draftReply,
        threadId,
      });
    },
    onSuccess: async () => {
      setDraftReply('');
      setReplyError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback-thread', threadId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback-thread-messages', threadId] }),
      ]);
    },
    onError: (error) => {
      setReplyError(error instanceof Error ? error.message : 'Could not send this reply.');
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      setReplyError(null);
      return claimFeedbackThread(threadId);
    },
    onSuccess: async () => {
      setReplyError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback-thread', threadId] }),
      ]);
    },
    onError: (error) => {
      setReplyError(error instanceof Error ? error.message : 'Could not claim this thread.');
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      setReplyError(null);
      return releaseFeedbackThread(threadId);
    },
    onSuccess: async () => {
      setReplyError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback-thread', threadId] }),
      ]);
    },
    onError: (error) => {
      setReplyError(error instanceof Error ? error.message : 'Could not release this thread.');
    },
  });

  const handleReply = () => {
    if (!assignment?.isOwnedByCurrentAdmin) {
      setReplyError('Pick up this thread before replying.');
      return;
    }

    if (!draftReply.trim()) {
      setReplyError('Reply is required.');
      return;
    }

    setReplyError(null);
    replyMutation.mutate();
  };

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Feedback detail</p>
            <h2 style={{ marginBottom: 0 }}>{thread?.title ?? 'Loading thread...'}</h2>
          </div>
          <Link className="button ghost" to="/feedback">
            Back to inbox
          </Link>
        </div>
      </section>

      {threadQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading feedback thread...</strong>
        </section>
      ) : null}

      {threadQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load this feedback thread</strong>
          <span className="text-muted">The thread may have been removed or access may have changed.</span>
        </section>
      ) : null}

      {thread ? (
        <section className="detail-grid feedback-detail-grid">
          <article className="detail-card">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Conversation</p>
                <h3 style={{ marginBottom: 8 }}>Messages with {threadUserName}</h3>
              </div>
              <div className="summary-actions">
                <span className={`status-pill ${thread.status}`}>{thread.status}</span>
                {assignment?.isAvailable ? (
                  <button
                    className="button primary"
                    disabled={claimMutation.isPending || releaseMutation.isPending}
                    onClick={() => claimMutation.mutate()}
                    type="button"
                  >
                    {claimMutation.isPending ? 'Picking up...' : 'Pick up thread'}
                  </button>
                ) : null}
                {assignment?.isOwnedByCurrentAdmin ? (
                  <button
                    className="button ghost"
                    disabled={claimMutation.isPending || releaseMutation.isPending}
                    onClick={() => releaseMutation.mutate()}
                    type="button"
                  >
                    {releaseMutation.isPending ? 'Releasing...' : 'Release thread'}
                  </button>
                ) : null}
              </div>
            </div>

            {assignment?.isOwnedByCurrentAdmin ? (
              <div className="alert info">
                {assignment.deadline
                  ? `You own this thread. Reply by ${formatDateTime(assignment.deadline.toISOString())} or it will return to the queue.`
                  : 'You own this thread.'}
              </div>
            ) : null}

            {assignment?.isOwnedByOtherAdmin ? (
              <div className="alert">
                {assignment.deadline
                  ? `${assignment.ownerName ?? 'Another admin'} owns this thread and has until ${formatDateTime(assignment.deadline.toISOString())} to reply.`
                  : `${assignment.ownerName ?? 'Another admin'} currently owns this thread.`}
              </div>
            ) : null}

            {assignment?.isExpired ? (
              <div className="alert info">
                {assignment.ownerName
                  ? `${assignment.ownerName}'s reply window expired, so this thread is available to pick up again.`
                  : 'The previous reply window expired, so this thread is available to pick up again.'}
              </div>
            ) : null}

            {!assignment?.isExpired && assignment?.isAvailable ? (
              <div className="alert info">This thread is currently unassigned.</div>
            ) : null}

            {messagesQuery.isLoading ? (
              <div className="state-panel">
                <span className="text-muted">Loading conversation history...</span>
              </div>
            ) : null}

            {messagesQuery.isError ? (
              <div className="state-panel error">
                <strong>Could not load messages</strong>
                <span className="text-muted">The thread loaded, but its message history is unavailable.</span>
              </div>
            ) : null}

            {conversation.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No messages have been sent in this thread yet.</span>
              </div>
            ) : null}

            <PaginatedCollection items={conversation} itemsPerPage={15} resetKey={threadId}>
              {(pageMessages) => (
                <div className="conversation-list">
                  {pageMessages.map((message) => (
                    <div
                      className={`conversation-message${message.isAdminMessage ? ' admin' : ''}`}
                      key={message.id}
                    >
                      <div className="summary-row">
                        <div className="conversation-meta">
                          <strong>{message.authorLabel}</strong>
                          {message.authorSubtitle ? (
                            <span className="text-muted">{message.authorSubtitle}</span>
                          ) : null}
                        </div>
                        <div className="tag-row">
                          {message.isFirstMessage ? <span className="tag">first message</span> : null}
                          <span className="tag">
                            {message.isAdminMessage ? 'admin' : 'user'} • {formatDateTime(message.created)}
                          </span>
                        </div>
                      </div>
                      <p className="conversation-message-body">{message.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </PaginatedCollection>

            <div className="conversation-composer">
              <div>
                <strong>Reply as {adminDisplayName}</strong>
                <p className="text-muted" style={{ margin: '4px 0 0' }}>
                  {assignment?.isOwnedByCurrentAdmin
                    ? `Your message will be sent to ${threadUserName}.`
                    : `Pick up this thread before replying to ${threadUserName}.`}
                </p>
              </div>

              <div className="field">
                <label htmlFor="feedback-reply">Reply</label>
                <textarea
                  className="textarea"
                  id="feedback-reply"
                  onChange={(event) => {
                    setDraftReply(event.target.value);
                    if (replyError) {
                      setReplyError(null);
                    }
                  }}
                  disabled={!assignment?.isOwnedByCurrentAdmin}
                  placeholder={
                    assignment?.isOwnedByCurrentAdmin
                      ? `Reply to ${threadUserName}...`
                      : 'Pick up this thread to reply'
                  }
                  value={draftReply}
                />
              </div>

              {replyError ? (
                <div className="state-panel error">
                  <strong>Reply failed</strong>
                  <span className="text-muted">{replyError}</span>
                </div>
              ) : null}

              <div className="button-row">
                <button
                  className="button primary"
                  disabled={replyMutation.isPending || !draftReply.trim() || !assignment?.isOwnedByCurrentAdmin}
                  onClick={handleReply}
                  type="button"
                >
                  {replyMutation.isPending ? 'Sending reply...' : 'Send reply'}
                </button>
              </div>
            </div>
          </article>

          <article className="detail-card">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Thread summary</p>
                <h3 style={{ marginBottom: 8 }}>Support request details</h3>
              </div>
              <span className={`status-pill ${thread.status}`}>{thread.status}</span>
            </div>

            <div className="split-list">
              <div className="list-item">
                <strong>User</strong>
                <span>{threadUserName}</span>
                {threadUserSubtitle ? <span className="text-muted">{threadUserSubtitle}</span> : null}
              </div>
              <div className="list-item">
                <strong>Replying as</strong>
                <span>{adminDisplayName}</span>
                {adminSubtitle ? <span className="text-muted">{adminSubtitle}</span> : null}
              </div>
              <div className="list-item">
                <strong>Owner</strong>
                <span>
                  {assignment?.isOwnedByCurrentAdmin
                    ? 'You'
                    : assignment?.isOwnedByOtherAdmin
                      ? assignment.ownerName
                      : 'Unassigned'}
                </span>
                {assignment?.isOwnedByOtherAdmin && assignment.ownerSubtitle ? (
                  <span className="text-muted">{assignment.ownerSubtitle}</span>
                ) : null}
                {assignment?.isExpired ? (
                  <span className="text-muted">Previous pickup expired.</span>
                ) : null}
              </div>
              <div className="list-item">
                <strong>Reply deadline</strong>
                <span className="text-muted">
                  {assignment?.deadline ? formatDateTime(assignment.deadline.toISOString()) : 'No pending reply deadline'}
                </span>
              </div>
              <div className="list-item">
                <strong>Opened</strong>
                <span className="text-muted">{formatDateTime(thread.created)}</span>
              </div>
              <div className="list-item">
                <strong>Last updated</strong>
                <span className="text-muted">{formatDateTime(thread.last_message_at ?? thread.updated)}</span>
              </div>
              <div className="list-item">
                <strong>Admin unread</strong>
                <span className="text-muted">{thread.admin_unread_count ?? 0}</span>
              </div>
              <div className="list-item">
                <strong>User unread</strong>
                <span className="text-muted">{thread.user_unread_count ?? 0}</span>
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}
