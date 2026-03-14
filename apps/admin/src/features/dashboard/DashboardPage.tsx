import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import { getDashboardSnapshot } from '@/features/dashboard/api';
import { formatDateTime } from '@/lib/formatters';

export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: getDashboardSnapshot,
  });

  const dashboardCards = dashboardQuery.data
    ? [
        {
          description:
            'Work through the current review queue and document admin notes on each request.',
          eyebrow: 'Menu moderation',
          statusLabel: 'Pending menu reviews',
          statusValue: dashboardQuery.data.pendingMenuReviews,
          title: 'Review menu submissions',
          to: '/menu-reviews',
        },
        {
          description:
            'Triage unresolved support items and identify threads with unread admin work.',
          eyebrow: 'Support',
          statusLabel: 'Active feedback threads',
          statusValue: dashboardQuery.data.activeFeedbackThreads,
          title: 'Check feedback inbox',
          to: '/feedback',
        },
        {
          description:
            'Search accounts, review recent uploads, and prepare future moderation workflows.',
          eyebrow: 'Trust & safety',
          statusLabel: 'Recent photo uploads (7d)',
          statusValue: dashboardQuery.data.recentPhotoUploads,
          title: 'Inspect user content',
          to: '/users',
        },
        {
          description:
            'Grant or revoke subscriber and beta access without leaving the admin workspace.',
          eyebrow: 'Membership',
          statusLabel: 'Total users',
          statusValue: dashboardQuery.data.totalUsers,
          title: 'Manage access flags',
          to: '/access-controls',
        },
      ]
    : [];

  return (
    <>
      {dashboardQuery.isLoading ? (
        <section className="dashboard-status-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="route-card" key={index}>
              <p className="text-muted">Loading...</p>
              <div className="metric-value">...</div>
              <p className="text-muted" style={{ margin: 0 }}>
                Fetching dashboard status.
              </p>
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
          <section className="dashboard-status-grid">
            {dashboardCards.map((card) => (
              <Link className="route-card route-card-link" key={card.to} to={card.to}>
                <div className="summary-row">
                  <p className="eyebrow">{card.eyebrow}</p>
                  <span aria-hidden="true" className="card-chevron">
                    &gt;
                  </span>
                </div>
                <h3>{card.title}</h3>
                <span className="text-muted">{card.statusLabel}</span>
                <div className="metric-value">{card.statusValue}</div>
                <p className="text-muted" style={{ margin: 0 }}>
                  {card.description}
                </p>
              </Link>
            ))}
          </section>

          <section className="detail-grid">
            <article className="detail-card">
              <div>
                <p className="eyebrow">Recent menu reviews</p>
                <h3>Latest requests</h3>
              </div>

              {dashboardQuery.data.recentMenuReviews.length === 0 ? (
                <div className="state-panel">
                  <span className="text-muted">No menu review requests have been created yet.</span>
                </div>
              ) : (
                <PaginatedCollection items={dashboardQuery.data.recentMenuReviews} itemsPerPage={6}>
                  {(pageReviews) => (
                    <div className="inline-list">
                      {pageReviews.map((request) => (
                        <Link className="list-item linked-list-item" key={request.id} to={`/menu-reviews/${request.id}`}>
                          <div className="summary-row">
                            <strong>{request.expand?.restaurant?.name ?? 'Unknown restaurant'}</strong>
                            <div className="summary-actions">
                              <span className={`status-pill ${request.status}`}>{request.status}</span>
                              <span aria-hidden="true" className="card-chevron">
                                &gt;
                              </span>
                            </div>
                          </div>
                          <div className="tag-row tag-row-start">
                            {request.expand?.requestedBy?.email ? (
                              <span className="tag">{request.expand.requestedBy.email}</span>
                            ) : (
                              <span className="text-muted">Requester unavailable</span>
                            )}
                            <span className="tag">Requested {formatDateTime(request.created)}</span>
                            <span className="tag">Updated {formatDateTime(request.updated)}</span>
                          </div>
                          <span className="text-muted">
                            {request.reason?.trim() || 'No reason supplied.'}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </PaginatedCollection>
              )}
            </article>

            <article className="detail-card">
              <div>
                <p className="eyebrow">Recent feedback</p>
                <h3>Support triage</h3>
              </div>

              {dashboardQuery.data.recentFeedback.length === 0 ? (
                <div className="state-panel">
                  <span className="text-muted">No support threads found.</span>
                </div>
              ) : (
                <PaginatedCollection items={dashboardQuery.data.recentFeedback} itemsPerPage={6}>
                  {(pageFeedback) => (
                    <div className="summary-list">
                      {pageFeedback.map((feedback) => (
                        <Link className="list-item linked-list-item" key={feedback.id} to={`/feedback/${feedback.id}`}>
                          <div className="summary-row">
                            <strong>{feedback.title}</strong>
                            <div className="summary-actions">
                              <span className={`status-pill ${feedback.status}`}>{feedback.status}</span>
                              <span aria-hidden="true" className="card-chevron">
                                &gt;
                              </span>
                            </div>
                          </div>
                          <div className="tag-row tag-row-start">
                            {feedback.expand?.user?.email ? (
                              <span className="tag">{feedback.expand.user.email}</span>
                            ) : null}
                            <span className="tag">
                              Updated {formatDateTime(feedback.last_message_at ?? feedback.updated)}
                            </span>
                          </div>
                          <span className="text-muted">
                            {feedback.latestMessage?.message?.trim() ||
                              feedback.description?.trim() ||
                              'No comments in this thread yet.'}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </PaginatedCollection>
              )}
            </article>
          </section>
        </>
      ) : null}
    </>
  );
}
