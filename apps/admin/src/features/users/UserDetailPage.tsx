import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getUserModerationProfile } from '@/features/users/api';
import { formatDateTime } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';

export function UserDetailPage() {
  const { userId = '' } = useParams();

  const profileQuery = useQuery({
    enabled: Boolean(userId),
    queryKey: ['admin', 'user-profile', userId],
    queryFn: () => getUserModerationProfile(userId),
  });

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">User detail</p>
            <h2 style={{ marginBottom: 0 }}>
              {profileQuery.data?.user.email ?? 'Loading account...'}
            </h2>
          </div>
          <Link className="button ghost" to="/users">
            Back to users
          </Link>
        </div>
      </section>

      {profileQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading user profile...</strong>
        </section>
      ) : null}

      {profileQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load this user</strong>
          <span className="text-muted">The user may have been removed or the query failed.</span>
        </section>
      ) : null}

      {profileQuery.data ? (
        <>
          <section className="metric-grid">
            <div className="metric-card">
              <span className="text-muted">Recent visits</span>
              <div className="metric-value">{profileQuery.data.recentVisits.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Recent food items</span>
              <div className="metric-value">{profileQuery.data.recentFoodItems.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Recent notes</span>
              <div className="metric-value">{profileQuery.data.recentNotes.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Recent photos</span>
              <div className="metric-value">{profileQuery.data.recentPhotos.length}</div>
            </div>
          </section>

          <section className="detail-grid">
            <article className="detail-card">
              <div>
                <p className="eyebrow">Account snapshot</p>
                <h3>Identity and support history</h3>
              </div>

              <div className="summary-list">
                <div className="summary-row">
                  <span className="text-muted">Email</span>
                  <strong>{profileQuery.data.user.email}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Name</span>
                  <strong>{profileQuery.data.user.name?.trim() || 'No display name'}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Joined</span>
                  <strong>{formatDateTime(profileQuery.data.user.created)}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Role</span>
                  <strong>{profileQuery.data.user.isAdmin ? 'Admin' : 'Standard user'}</strong>
                </div>
              </div>

              <div className="divider" />

              <div>
                <h3 style={{ marginBottom: 12 }}>Recent feedback</h3>
                <div className="inline-list">
                  {profileQuery.data.recentFeedback.length === 0 ? (
                    <span className="text-muted">No feedback threads for this user.</span>
                  ) : (
                    profileQuery.data.recentFeedback.map((thread) => (
                      <div className="list-item" key={thread.id}>
                        <div className="summary-row">
                          <strong>{thread.title}</strong>
                          <span className={`status-pill ${thread.status}`}>{thread.status}</span>
                        </div>
                        <span className="text-muted">{thread.description}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>

            <article className="detail-card">
              <div>
                <p className="eyebrow">Recent content</p>
                <h3>User-created records</h3>
              </div>

              <div className="inline-list">
                {profileQuery.data.recentFoodItems.map((item) => (
                  <div className="list-item" key={item.id}>
                    <strong>{item.name}</strong>
                    <span className="text-muted">
                      Rating {item.rating} • {formatDateTime(item.created)}
                    </span>
                  </div>
                ))}
                {profileQuery.data.recentNotes.map((note) => (
                  <div className="list-item" key={note.id}>
                    <strong>Note</strong>
                    <span className="text-muted">{note.content}</span>
                  </div>
                ))}
                {profileQuery.data.recentPhotos.map((photo) => (
                  <div className="list-item" key={photo.id}>
                    {photo.photo ? (
                      <img
                        alt="User upload"
                        className="photo-thumb"
                        src={pb.files.getURL(photo, photo.photo)}
                      />
                    ) : null}
                    <span className="text-muted">Uploaded {formatDateTime(photo.created)}</span>
                  </div>
                ))}
                {profileQuery.data.recentFoodItems.length === 0 &&
                profileQuery.data.recentNotes.length === 0 &&
                profileQuery.data.recentPhotos.length === 0 ? (
                  <span className="text-muted">No recent content found for this user.</span>
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </>
  );
}
