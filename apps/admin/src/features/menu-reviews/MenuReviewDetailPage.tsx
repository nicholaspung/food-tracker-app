import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getMenuReviewRequest,
  listRestaurantMenuItems,
  updateMenuItem,
  updateMenuReviewRequest,
} from '@/features/menu-reviews/api';
import { getCreatedUpdatedDisplay } from '@/lib/formatters';
import type { MenuItemRecord } from '@/lib/types';

const visibilityOptions: Array<MenuItemRecord['visibility']> = ['private', 'friends', 'public'];

export function MenuReviewDetailPage() {
  const { requestId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftVisibility, setDraftVisibility] = useState<MenuItemRecord['visibility']>('friends');
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuItemError, setMenuItemError] = useState<string | null>(null);

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
    mutationFn: async (status: 'pending' | 'reviewed' | 'dismissed') => {
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

  const menuItemMutation = useMutation({
    mutationFn: async () => {
      if (!editingItemId) {
        throw new Error('Select a menu item to edit.');
      }

      return updateMenuItem(editingItemId, {
        name: draftName.trim(),
        description: draftDescription.trim(),
        visibility: draftVisibility ?? 'friends',
      });
    },
    onSuccess: async () => {
      setMenuItemError(null);
      setEditingItemId(null);
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'menu-review-items', requestQuery.data?.restaurant],
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not update this menu item.';
      setMenuItemError(message);
    },
  });

  const request = requestQuery.data;
  const activityDisplay = getCreatedUpdatedDisplay(request?.created, request?.updated);
  const primaryAction =
    request?.status === 'reviewed'
      ? { label: 'Mark unreviewed', status: 'pending' as const, className: 'button reverse' }
      : { label: 'Mark reviewed', status: 'reviewed' as const, className: 'button primary' };
  const secondaryAction =
    request?.status === 'dismissed'
      ? { label: 'Reinstate request', status: 'pending' as const, className: 'button reverse' }
      : { label: 'Dismiss request', status: 'dismissed' as const, className: 'button warn' };

  useEffect(() => {
    setAdminNotes(request?.adminNotes ?? '');
  }, [request?.adminNotes]);

  const handleStartEditingMenuItem = (item: MenuItemRecord) => {
    setEditingItemId(item.id);
    setDraftName(item.name);
    setDraftDescription(item.description?.trim() ?? '');
    setDraftVisibility(item.visibility ?? 'friends');
    setMenuItemError(null);
  };

  const handleCancelEditingMenuItem = () => {
    setEditingItemId(null);
    setMenuItemError(null);
  };

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
                <strong>{activityDisplay.label}</strong>
                <span className="text-muted">{activityDisplay.value}</span>
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
                className={primaryAction.className}
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate(primaryAction.status)}
                type="button"
              >
                {actionMutation.isPending ? 'Saving...' : primaryAction.label}
              </button>
              <button
                className={secondaryAction.className}
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate(secondaryAction.status)}
                type="button"
              >
                {secondaryAction.label}
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

            {menuItemError ? (
              <div className="state-panel error">
                <strong>Menu item update failed</strong>
                <span className="text-muted">{menuItemError}</span>
              </div>
            ) : null}

            <div className="inline-list">
              {menuItemsQuery.data?.map((item) => (
                <div className="list-item" key={item.id}>
                  <div className="summary-row">
                    <strong>{item.name}</strong>
                    <div className="summary-actions">
                      <span className="tag">{item.visibility ?? 'friends'}</span>
                      {editingItemId === item.id ? null : (
                        <button
                          className="button ghost"
                          onClick={() => handleStartEditingMenuItem(item)}
                          type="button"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="text-muted">{item.description?.trim() || 'No description.'}</span>

                  {editingItemId === item.id ? (
                    <div className="menu-item-editor">
                      <div className="field">
                        <label htmlFor={`menu-item-name-${item.id}`}>Name</label>
                        <input
                          className="input"
                          id={`menu-item-name-${item.id}`}
                          onChange={(event) => {
                            setDraftName(event.target.value);
                            setMenuItemError(null);
                          }}
                          value={draftName}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor={`menu-item-description-${item.id}`}>Description</label>
                        <textarea
                          className="textarea menu-item-textarea"
                          id={`menu-item-description-${item.id}`}
                          onChange={(event) => {
                            setDraftDescription(event.target.value);
                            setMenuItemError(null);
                          }}
                          placeholder="Optional description"
                          value={draftDescription}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor={`menu-item-visibility-${item.id}`}>Visibility</label>
                        <select
                          className="input"
                          id={`menu-item-visibility-${item.id}`}
                          onChange={(event) => {
                            setDraftVisibility(event.target.value as MenuItemRecord['visibility']);
                            setMenuItemError(null);
                          }}
                          value={draftVisibility ?? 'friends'}
                        >
                          {visibilityOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="button-row">
                        <button
                          className="button primary"
                          disabled={menuItemMutation.isPending || draftName.trim().length === 0}
                          onClick={() => menuItemMutation.mutate()}
                          type="button"
                        >
                          {menuItemMutation.isPending ? 'Saving...' : 'Save menu item'}
                        </button>
                        <button
                          className="button ghost"
                          disabled={menuItemMutation.isPending}
                          onClick={handleCancelEditingMenuItem}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}
