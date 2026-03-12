import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getMenuReviewRequest,
  listRestaurantMenuItems,
  updateMenuReviewRequest,
} from '@/features/menu-reviews/api';
import { formatDateTime } from '@/lib/formatters';

export function MenuReviewDetailPage() {
  const { requestId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const requestQuery = useQuery({
    enabled: Boolean(requestId),
    queryKey: ['admin', 'menu-review', requestId],
    queryFn: () => getMenuReviewRequest(requestId),
  });

  const menuItemsQuery = useQuery({
    enabled: Boolean(requestQuery.data?.restaurant),
    queryKey: ['admin', 'menu-review-items', requestQuery.data?.restaurant],
    queryFn: () => listRestaurantMenuItems(requestQuery.data?.restaurant ?? ''),
  });

  const actionMutation = useMutation({
    mutationFn: async (status: 'reviewed' | 'dismissed') => {
      return updateMenuReviewRequest(requestId, {
        adminNotes: adminNotes.trim(),
        status,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'menu-review', requestId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'menu-reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
      ]);
      navigate('/menu-reviews');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not update this review request.';
      setActionError(message);
    },
  });

  const request = requestQuery.data;

  useEffect(() => {
    setAdminNotes(request?.adminNotes ?? '');
  }, [request?.adminNotes]);

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Menu review detail</p>
            <h2 style={{ marginBottom: 0 }}>
              {request?.expand?.restaurant?.name ?? 'Loading request...'}
            </h2>
          </div>
          <Link className="button ghost" to="/menu-reviews">
            Back to queue
          </Link>
        </div>
      </section>

      {requestQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading request...</strong>
        </section>
      ) : null}

      {requestQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load this request</strong>
          <span className="text-muted">The request may have been removed or your access expired.</span>
        </section>
      ) : null}

      {request ? (
        <section className="detail-grid">
          <article className="detail-card">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Request context</p>
                <h3 style={{ marginBottom: 8 }}>Moderation summary</h3>
              </div>
              <span className={`status-pill ${request.status}`}>{request.status}</span>
            </div>

            <div className="split-list">
              <div className="list-item">
                <strong>Requested by</strong>
                <span className="text-muted">
                  {request.expand?.requestedBy?.email ?? request.requestedBy}
                </span>
              </div>
              <div className="list-item">
                <strong>Updated</strong>
                <span className="text-muted">{formatDateTime(request.updated)}</span>
              </div>
            </div>

            <div className="list-item">
              <strong>User reason</strong>
              <span className="text-muted">{request.reason?.trim() || 'No reason supplied.'}</span>
            </div>

            <div className="field">
              <label htmlFor="admin-notes">Admin notes</label>
              <textarea
                className="textarea"
                id="admin-notes"
                onChange={(event) => setAdminNotes(event.target.value)}
                placeholder="Document what changed, what was approved, or why this was dismissed."
                value={adminNotes}
              />
            </div>

            {actionError ? (
              <div className="state-panel error">
                <strong>Update failed</strong>
                <span className="text-muted">{actionError}</span>
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="button primary"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate('reviewed')}
                type="button"
              >
                {actionMutation.isPending ? 'Saving...' : 'Mark reviewed'}
              </button>
              <button
                className="button warn"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate('dismissed')}
                type="button"
              >
                Dismiss request
              </button>
            </div>
          </article>

          <article className="detail-card">
            <div>
              <p className="eyebrow">Menu items</p>
              <h3>Current restaurant menu</h3>
            </div>

            {menuItemsQuery.isLoading ? (
              <div className="state-panel">
                <span className="text-muted">Loading restaurant items...</span>
              </div>
            ) : null}

            {menuItemsQuery.data?.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">
                  No menu items were found for this restaurant yet.
                </span>
              </div>
            ) : null}

            <div className="inline-list">
              {menuItemsQuery.data?.map((item) => (
                <div className="list-item" key={item.id}>
                  <div className="summary-row">
                    <strong>{item.name}</strong>
                    <span className="tag">{item.visibility ?? 'friends'}</span>
                  </div>
                  <span className="text-muted">{item.description?.trim() || 'No description.'}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}
