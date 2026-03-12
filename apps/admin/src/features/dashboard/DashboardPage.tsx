import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getDashboardSnapshot } from '@/features/dashboard/api';
import { formatDateTime } from '@/lib/formatters';

export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: getDashboardSnapshot,
  });

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Queue overview</p>
        <h2 style={{ marginBottom: 0 }}>Review workload at a glance</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          This first pass is tuned for the current backend: menu review requests, feedback threads,
          uploaded visit photos, and user search.
        </p>
      </section>

      {dashboardQuery.isLoading ? (
        <section className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="metric-card" key={index}>
              <p className="text-muted">Loading...</p>
              <div className="metric-value">...</div>
            </div>
          ))}
        </section>
      ) : null}

      {dashboardQuery.isError ? (
        <section className="state-panel error">
          <strong>Dashboard data unavailable</strong>
          <span className="text-muted">
            The admin shell loaded, but the moderation data queries failed. Check the API URL and
            your admin session.
          </span>
        </section>
      ) : null}

      {dashboardQuery.data ? (
        <>
          <section className="metric-grid">
            <div className="metric-card">
              <span className="text-muted">Pending menu reviews</span>
              <div className="metric-value">{dashboardQuery.data.pendingMenuReviews}</div>
              <span className="text-muted">Flagged menu items waiting for admin action.</span>
            </div>
            <div className="metric-card">
              <span className="text-muted">Active feedback threads</span>
              <div className="metric-value">{dashboardQuery.data.activeFeedbackThreads}</div>
              <span className="text-muted">Open or in-progress support conversations.</span>
            </div>
            <div className="metric-card">
              <span className="text-muted">Recent photo uploads</span>
              <div className="metric-value">{dashboardQuery.data.recentPhotoUploads}</div>
              <span className="text-muted">Uploads created in the last 7 days.</span>
            </div>
            <div className="metric-card">
              <span className="text-muted">Total users</span>
              <div className="metric-value">{dashboardQuery.data.totalUsers}</div>
              <span className="text-muted">Accounts currently addressable from admin search.</span>
            </div>
          </section>

          <section className="route-grid">
            <article className="route-card">
              <p className="eyebrow">Menu moderation</p>
              <h3>Review menu submissions</h3>
              <p className="text-muted">
                Work through the current review queue and document admin notes on each request.
              </p>
              <Link className="route-link" to="/menu-reviews">
                Open menu review queue
              </Link>
            </article>

            <article className="route-card">
              <p className="eyebrow">Support</p>
              <h3>Check feedback inbox</h3>
              <p className="text-muted">
                Triage unresolved support items and identify threads with unread admin work.
              </p>
              <Link className="route-link" to="/feedback">
                Open feedback inbox
              </Link>
            </article>

            <article className="route-card">
              <p className="eyebrow">Trust & safety</p>
              <h3>Inspect user content</h3>
              <p className="text-muted">
                Search accounts, review recent uploads, and prepare future moderation workflows.
              </p>
              <Link className="route-link" to="/users">
                Search users
              </Link>
            </article>
          </section>

          <section className="detail-grid">
            <article className="detail-card">
              <div>
                <p className="eyebrow">Recent menu reviews</p>
                <h3>Latest requests</h3>
              </div>

              <div className="inline-list">
                {dashboardQuery.data.recentMenuReviews.length === 0 ? (
                  <div className="state-panel">
                    <span className="text-muted">No menu review requests have been created yet.</span>
                  </div>
                ) : (
                  dashboardQuery.data.recentMenuReviews.map((request) => (
                    <div className="list-item" key={request.id}>
                      <div className="summary-row">
                        <strong>{request.expand?.restaurant?.name ?? 'Unknown restaurant'}</strong>
                        <span className={`status-pill ${request.status}`}>{request.status}</span>
                      </div>
                      <span className="text-muted">
                        Requested by {request.expand?.requestedBy?.email ?? request.requestedBy}
                      </span>
                      <span className="text-muted">
                        {request.reason?.trim() || 'No reason supplied.'}
                      </span>
                      <Link className="route-link" to={`/menu-reviews/${request.id}`}>
                        Review request
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="detail-card">
              <div>
                <p className="eyebrow">Recent feedback</p>
                <h3>Support triage</h3>
              </div>

              <div className="summary-list">
                {dashboardQuery.data.recentFeedback.length === 0 ? (
                  <div className="state-panel">
                    <span className="text-muted">No support threads found.</span>
                  </div>
                ) : (
                  dashboardQuery.data.recentFeedback.map((feedback) => (
                    <div className="list-item" key={feedback.id}>
                      <div className="summary-row">
                        <strong>{feedback.title}</strong>
                        <span className={`status-pill ${feedback.status}`}>{feedback.status}</span>
                      </div>
                      <span className="text-muted">
                        {feedback.expand?.user?.email ?? feedback.user}
                      </span>
                      <span className="text-muted">
                        Updated {formatDateTime(feedback.updated)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </>
  );
}
