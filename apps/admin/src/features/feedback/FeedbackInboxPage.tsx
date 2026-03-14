import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import {
  claimFeedbackThread,
  listFeedbackThreads,
  releaseFeedbackThread,
  type FeedbackStatusFilter,
} from '@/features/feedback/api';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  getFeedbackAssignmentState,
  getFeedbackParticipantName,
} from '@/features/feedback/display';
import { formatDateTime } from '@/lib/formatters';

const filters: FeedbackStatusFilter[] = ['active', 'resolved', 'closed', 'all'];

export function FeedbackInboxPage() {
  const [statusFilter, setStatusFilter] = useState<FeedbackStatusFilter>('active');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user: adminUser } = useAuth();

  const feedbackQuery = useQuery({
    queryKey: ['admin', 'feedback', statusFilter],
    queryFn: () => listFeedbackThreads(statusFilter),
    refetchInterval: 10000,
  });

  const claimMutation = useMutation({
    mutationFn: async (threadId: string) => {
      setActionError(null);
      setPendingThreadId(threadId);
      return claimFeedbackThread(threadId);
    },
    onSuccess: async () => {
      setActionError(null);
      setPendingThreadId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
      ]);
    },
    onError: (error) => {
      setPendingThreadId(null);
      setActionError(error instanceof Error ? error.message : 'Could not claim this thread.');
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (threadId: string) => {
      setActionError(null);
      setPendingThreadId(threadId);
      return releaseFeedbackThread(threadId);
    },
    onSuccess: async () => {
      setActionError(null);
      setPendingThreadId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
      ]);
    },
    onError: (error) => {
      setPendingThreadId(null);
      setActionError(error instanceof Error ? error.message : 'Could not release this thread.');
    },
  });

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Feedback inbox</p>
        <h2 style={{ marginBottom: 0 }}>Support and product feedback queue</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Open a thread to review the full conversation, see participant details, and reply from
          the admin workspace.
        </p>
      </section>

      <section className="panel">
        <div className="filter-row">
          {filters.map((filter) => (
            <button
              className={`filter-chip${statusFilter === filter ? ' active' : ''}`}
              key={filter}
              onClick={() => setStatusFilter(filter)}
              type="button"
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      {feedbackQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading feedback threads...</strong>
        </section>
      ) : null}

      {feedbackQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load feedback</strong>
          <span className="text-muted">
            Check the `feedback` collection access rules and API connectivity.
          </span>
        </section>
      ) : null}

      {actionError ? (
        <section className="state-panel error">
          <strong>Thread action failed</strong>
          <span className="text-muted">{actionError}</span>
        </section>
      ) : null}

      {feedbackQuery.data ? (
        <section className="table-panel">
          <div className="summary-row">
            <div>
              <p className="eyebrow">Open threads</p>
              <h3>{feedbackQuery.data.length} result(s)</h3>
            </div>
          </div>

          {feedbackQuery.data.length === 0 ? (
            <div className="state-panel">
              <span className="text-muted">No feedback threads match this filter.</span>
            </div>
          ) : (
            <PaginatedCollection items={feedbackQuery.data} itemsPerPage={20} resetKey={statusFilter}>
              {(pageThreads) => (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>User</th>
                        <th>Owner</th>
                        <th>Status</th>
                        <th>Unread</th>
                        <th>Last Activity</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pageThreads.map((thread) => {
                        const assignment = getFeedbackAssignmentState(thread, adminUser?.id);
                        const isThreadPending = pendingThreadId === thread.id;

                        return (
                          <tr key={thread.id}>
                            <td>
                              <strong>{thread.title}</strong>
                              <div className="text-muted" style={{ marginTop: 6 }}>
                                {thread.description}
                              </div>
                            </td>
                            <td>{getFeedbackParticipantName(thread.expand?.user, thread.user)}</td>
                            <td>
                              <strong>
                                {assignment.isOwnedByCurrentAdmin
                                  ? 'You'
                                  : assignment.isOwnedByOtherAdmin
                                    ? assignment.ownerName
                                    : 'Available'}
                              </strong>
                              <div className="text-muted" style={{ marginTop: 6 }}>
                                {assignment.deadline
                                  ? assignment.isExpired
                                    ? `Expired ${formatDateTime(assignment.deadline.toISOString())}`
                                    : `Reply by ${formatDateTime(assignment.deadline.toISOString())}`
                                  : assignment.isOwnedByOtherAdmin
                                    ? 'Currently assigned'
                                    : assignment.isOwnedByCurrentAdmin
                                      ? 'No pending reply deadline'
                                      : 'Unassigned'}
                              </div>
                            </td>
                            <td>
                              <span className={`status-pill ${thread.status}`}>{thread.status}</span>
                            </td>
                            <td>{thread.admin_unread_count ?? 0}</td>
                            <td>{formatDateTime(thread.last_message_at ?? thread.updated)}</td>
                            <td>
                              <div className="button-row">
                                {assignment.isAvailable ? (
                                  <button
                                    className="button"
                                    disabled={claimMutation.isPending || releaseMutation.isPending}
                                    onClick={() => claimMutation.mutate(thread.id)}
                                    type="button"
                                  >
                                    {isThreadPending && claimMutation.isPending ? 'Picking up...' : 'Pick up'}
                                  </button>
                                ) : null}
                                {assignment.isOwnedByCurrentAdmin ? (
                                  <button
                                    className="button ghost"
                                    disabled={claimMutation.isPending || releaseMutation.isPending}
                                    onClick={() => releaseMutation.mutate(thread.id)}
                                    type="button"
                                  >
                                    {isThreadPending && releaseMutation.isPending ? 'Releasing...' : 'Release'}
                                  </button>
                                ) : null}
                                <Link className="route-link" to={`/feedback/${thread.id}`}>
                                  Open
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </PaginatedCollection>
          )}
        </section>
      ) : null}
    </>
  );
}
