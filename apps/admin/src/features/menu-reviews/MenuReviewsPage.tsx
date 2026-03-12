import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import {
  listMenuReviewRequests,
  type MenuReviewStatusFilter,
  type MenuReviewTimeFilter,
} from '@/features/menu-reviews/api';
import { formatDateTime } from '@/lib/formatters';

const statusFilters: MenuReviewStatusFilter[] = ['pending', 'reviewed', 'dismissed', 'all'];
const timeFilters: MenuReviewTimeFilter[] = ['all_time', 'last_7_days', 'last_30_days', 'last_90_days'];

export function MenuReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<MenuReviewStatusFilter>('pending');
  const [timeFilter, setTimeFilter] = useState<MenuReviewTimeFilter>('all_time');

  const reviewsQuery = useQuery({
    queryKey: ['admin', 'menu-reviews', statusFilter, timeFilter],
    queryFn: () => listMenuReviewRequests(statusFilter, timeFilter),
  });

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Menu reviews</p>
        <h2 style={{ marginBottom: 0 }}>Flagged menu moderation queue</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Start with pending requests. For historical review states, narrow by time window to keep
          the list readable.
        </p>
      </section>

      <section className="panel">
        <div className="filter-row">
          {statusFilters.map((filter) => (
            <button
              className={`filter-chip${statusFilter === filter ? ' active' : ''}`}
              key={filter}
              onClick={() => setStatusFilter(filter)}
              type="button"
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
        </div>

        {statusFilter !== 'pending' ? (
          <div className="filter-row">
            {timeFilters.map((filter) => (
              <button
                className={`filter-chip${timeFilter === filter ? ' active' : ''}`}
                key={filter}
                onClick={() => setTimeFilter(filter)}
                type="button"
              >
                {filter.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {reviewsQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading menu reviews...</strong>
        </section>
      ) : null}

      {reviewsQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load menu reviews</strong>
          <span className="text-muted">
            The backend query failed. Verify the PocketBase rules and the current admin session.
          </span>
        </section>
      ) : null}

      {reviewsQuery.data ? (
        <section className="table-panel">
          <div className="summary-row">
            <div>
              <p className="eyebrow">Results</p>
              <h3>{reviewsQuery.data.length} request(s)</h3>
            </div>
          </div>

          {reviewsQuery.data.length === 0 ? (
            <div className="state-panel">
              <strong>No requests match the current filters.</strong>
              <span className="text-muted">
                New or recently updated requests will appear here once they are created.
              </span>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Requested By</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reviewsQuery.data.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <strong>{request.expand?.restaurant?.name ?? 'Unknown restaurant'}</strong>
                      </td>
                      <td>{request.expand?.requestedBy?.email ?? request.requestedBy}</td>
                      <td>{request.reason?.trim() || 'No reason supplied.'}</td>
                      <td>
                        <span className={`status-pill ${request.status}`}>{request.status}</span>
                      </td>
                      <td>{formatDateTime(request.updated)}</td>
                      <td>
                        <Link className="route-link" to={`/menu-reviews/${request.id}`}>
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
