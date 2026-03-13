import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getFeedbackThread, listFeedbackMessages } from '@/features/feedback/api';
import { formatDateTime } from '@/lib/formatters';

export function FeedbackDetailPage() {
  const { threadId = '' } = useParams();

  const threadQuery = useQuery({
    enabled: Boolean(threadId),
    queryKey: ['admin', 'feedback-thread', threadId],
    queryFn: () => getFeedbackThread(threadId),
  });

  const messagesQuery = useQuery({
    enabled: Boolean(threadId),
    queryKey: ['admin', 'feedback-thread-messages', threadId],
    queryFn: () => listFeedbackMessages(threadId),
  });

  const thread = threadQuery.data;

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
        <section className="detail-grid">
          <article className="detail-card">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Thread summary</p>
                <h3 style={{ marginBottom: 8 }}>Support request context</h3>
              </div>
              <span className={`status-pill ${thread.status}`}>{thread.status}</span>
            </div>

            <div className="split-list">
              <div className="list-item">
                <strong>User</strong>
                <span className="text-muted">{thread.expand?.user?.email ?? thread.user}</span>
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

            <div className="list-item">
              <strong>Description</strong>
              <span className="text-muted">{thread.description?.trim() || 'No description supplied.'}</span>
            </div>
          </article>

          <article className="detail-card">
            <div>
              <p className="eyebrow">Conversation</p>
              <h3>Thread messages</h3>
            </div>

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

            {messagesQuery.data?.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No messages have been sent in this thread yet.</span>
              </div>
            ) : null}

            <div className="inline-list">
              {messagesQuery.data?.map((message) => (
                <div className="list-item" key={message.id}>
                  <div className="summary-row">
                    <strong>
                      {message.is_admin_message
                        ? 'Admin'
                        : message.expand?.user?.email ?? message.user}
                    </strong>
                    <span className="tag">
                      {message.is_admin_message ? 'admin' : 'user'} • {formatDateTime(message.created)}
                    </span>
                  </div>
                  <span className="text-muted">{message.message}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}
