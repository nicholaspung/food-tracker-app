import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listFeedbackThreads, type FeedbackStatusFilter } from '@/features/feedback/api';
import { formatDateTime } from '@/lib/formatters';

const filters: FeedbackStatusFilter[] = ['active', 'resolved', 'closed', 'all'];

export function FeedbackInboxPage() {
  const [statusFilter, setStatusFilter] = useState<FeedbackStatusFilter>('active');

  const feedbackQuery = useQuery({
    queryKey: ['admin', 'feedback', statusFilter],
    queryFn: () => listFeedbackThreads(statusFilter),
  });

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Feedback inbox</p>
        <h2 style={{ marginBottom: 0 }}>Support and product feedback queue</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          This first cut is optimized for thread triage. Reply and resolution actions are the next
          obvious step to add.
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Unread</th>
                    <th>Last Activity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {feedbackQuery.data.map((thread) => (
                    <tr key={thread.id}>
                      <td>
                        <strong>{thread.title}</strong>
                        <div className="text-muted" style={{ marginTop: 6 }}>
                          {thread.description}
                        </div>
                      </td>
                      <td>{thread.expand?.user?.email ?? thread.user}</td>
                      <td>
                        <span className={`status-pill ${thread.status}`}>{thread.status}</span>
                      </td>
                      <td>{thread.admin_unread_count ?? 0}</td>
                      <td>{formatDateTime(thread.last_message_at ?? thread.updated)}</td>
                      <td>
                        <Link className="route-link" to={`/feedback/${thread.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
