import { useQuery } from '@tanstack/react-query';

import { listRecentPhotoUploads } from '@/features/moderation/api';
import { formatDateTime } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';

export function ModerationPage() {
  const photosQuery = useQuery({
    queryKey: ['admin', 'moderation', 'photos'],
    queryFn: listRecentPhotoUploads,
  });

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Moderation staging</p>
        <h2 style={{ marginBottom: 0 }}>User-generated content review surfaces</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          The current backend exposes uploaded visit photos. Comment and abuse-report moderation
          likely need dedicated collections or API endpoints next.
        </p>
      </section>

      <section className="route-grid">
        <article className="route-card">
          <p className="eyebrow">Ready now</p>
          <h3>Photo upload review</h3>
          <p className="text-muted">
            Inspect recent uploads, associated users, and moderation context before adding
            restriction actions.
          </p>
        </article>
        <article className="route-card">
          <p className="eyebrow">Next backend piece</p>
          <h3>Flagged comments queue</h3>
          <p className="text-muted">
            Add a collection or endpoint that stores comment text, report reason, reporter, and
            moderator outcome.
          </p>
        </article>
        <article className="route-card">
          <p className="eyebrow">Next backend piece</p>
          <h3>Restricted media status</h3>
          <p className="text-muted">
            Add status fields for `visit_photos` or a separate moderation record so takedowns are
            auditable and reversible.
          </p>
        </article>
      </section>

      {photosQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading recent photo uploads...</strong>
        </section>
      ) : null}

      {photosQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load photo uploads</strong>
          <span className="text-muted">
            The `visit_photos` collection may not be reachable from the current admin session.
          </span>
        </section>
      ) : null}

      {photosQuery.data ? (
        <section className="table-panel">
          <div className="summary-row">
            <div>
              <p className="eyebrow">Recent uploads</p>
              <h3>{photosQuery.data.length} record(s)</h3>
            </div>
          </div>

          {photosQuery.data.length === 0 ? (
            <div className="state-panel">
              <span className="text-muted">No recent uploads found.</span>
            </div>
          ) : (
            <div className="split-list">
              {photosQuery.data.map((photo) => (
                <article className="list-item" key={photo.id}>
                  {photo.photo ? (
                    <img
                      alt="User upload"
                      className="photo-thumb"
                      src={pb.files.getURL(photo, photo.photo)}
                    />
                  ) : null}
                  <strong>{photo.expand?.user?.email ?? photo.user}</strong>
                  <span className="text-muted">Created {formatDateTime(photo.created)}</span>
                  <span className="text-muted">
                    Visit: {photo.expand?.visit?.id ?? 'No linked visit'}
                  </span>
                  <span className="text-muted">
                    Food item: {photo.expand?.foodItem?.name ?? 'No linked item'}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
