import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import {
  getAdminRestaurantInventoryDetail,
  type MenuImageInventoryRow,
  type MenuItemInventoryRow,
} from '@/features/menu-inventory/api';
import {
  buildMenuImageUrl,
  formatOptional,
  renderInventoryUser,
  renderInventoryVisibility,
} from '@/features/menu-inventory/display';
import { formatDateTime } from '@/lib/formatters';

function formatCoordinates(latitude?: number, longitude?: number) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return 'Unknown';
  }

  if (latitude === 0 && longitude === 0) {
    return 'Unknown';
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function MenuItemsTable({ rows }: { rows: MenuItemInventoryRow[] }) {
  return (
    <PaginatedCollection items={rows} itemsPerPage={25} resetKey={rows.map((row) => row.id).join(':')}>
      {(pageRows) => (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Created by</th>
                <th>Source</th>
                <th>Visibility</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="inventory-primary-cell">
                      <strong>{formatOptional(row.name, 'Unnamed item')}</strong>
                      <span className="inventory-secondary-text">{row.id}</span>
                    </div>
                  </td>
                  <td>{renderInventoryUser(row.creator, row.createdBy)}</td>
                  <td>
                    <div className="tag-row tag-row-start">
                      {row.isFromOcr ? <span className="tag">OCR</span> : <span className="tag">Manual</span>}
                      {row.sourceImage?.trim() ? <span className="tag">Photo source</span> : null}
                    </div>
                    {row.sourceImageFile?.trim() ? (
                      <span className="inventory-secondary-text">{row.sourceImageFile}</span>
                    ) : null}
                  </td>
                  <td>{renderInventoryVisibility(row.visibility)}</td>
                  <td>{formatDateTime(row.updated || row.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PaginatedCollection>
  );
}

function MenuPhotosTable({ rows }: { rows: MenuImageInventoryRow[] }) {
  return (
    <PaginatedCollection items={rows} itemsPerPage={24} resetKey={rows.map((row) => row.id).join(':')}>
      {(pageRows) => (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Preview</th>
                <th>Uploaded by</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const thumbUrl = buildMenuImageUrl(row, '160x160');
                const fullUrl = buildMenuImageUrl(row);

                return (
                  <tr key={row.id}>
                    <td>
                      {thumbUrl ? (
                        <div className="inventory-primary-cell">
                          <Link to={`/menu-inventory/menu-images/${row.id}`}>
                            <img
                              alt={`Menu upload ${row.id}`}
                              className="inventory-thumbnail"
                              src={thumbUrl}
                            />
                          </Link>
                          {fullUrl ? (
                            <a className="route-link" href={fullUrl} rel="noreferrer" target="_blank">
                              Open image
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted">No image file</span>
                      )}
                    </td>
                    <td>{renderInventoryUser(row.uploader, row.uploadedBy)}</td>
                    <td>{formatDateTime(row.created)}</td>
                    <td>{formatDateTime(row.updated || row.created)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PaginatedCollection>
  );
}

export function RestaurantInventoryDetailPage() {
  const { restaurantId = '' } = useParams();

  const detailQuery = useQuery({
    enabled: Boolean(restaurantId),
    queryKey: ['admin', 'menu-inventory', 'restaurant-detail', restaurantId],
    queryFn: () => getAdminRestaurantInventoryDetail(restaurantId),
  });

  const restaurant = detailQuery.data?.restaurant;

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Restaurant inventory</p>
            <h2 style={{ marginBottom: 0 }}>
              {restaurant ? formatOptional(restaurant.name, 'Unnamed restaurant') : 'Loading restaurant...'}
            </h2>
          </div>
          <Link className="button ghost" to="/menu-inventory">
            Back to inventory
          </Link>
        </div>
      </section>

      {detailQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading restaurant inventory...</strong>
        </section>
      ) : null}

      {detailQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load this restaurant</strong>
          <span className="text-muted">
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : 'The restaurant may have been removed or your access expired.'}
          </span>
        </section>
      ) : null}

      {detailQuery.data && restaurant ? (
        <>
          <section className="detail-grid">
            <article className="detail-card">
              <div className="summary-row">
                <div>
                  <p className="eyebrow">Restaurant</p>
                  <h3>{formatOptional(restaurant.name, 'Unnamed restaurant')}</h3>
                </div>
                {renderInventoryVisibility(restaurant.visibility)}
              </div>

              <div className="split-list">
                <div className="list-item">
                  <strong>Location</strong>
                  <span className="text-muted">{formatOptional(restaurant.location)}</span>
                </div>
                <div className="list-item">
                  <strong>Cuisine</strong>
                  <span className="text-muted">{formatOptional(restaurant.cuisineType, 'Not set')}</span>
                </div>
                <div className="list-item">
                  <strong>Created</strong>
                  <span className="text-muted">{formatDateTime(restaurant.created)}</span>
                </div>
                <div className="list-item">
                  <strong>Updated</strong>
                  <span className="text-muted">{formatDateTime(restaurant.updated || restaurant.created)}</span>
                </div>
              </div>

              <div className="list-item">
                <strong>Creator</strong>
                {renderInventoryUser(restaurant.creator, restaurant.createdBy)}
              </div>
            </article>

            <article className="detail-card">
              <div>
                <p className="eyebrow">Cache context</p>
                <h3>Source metadata</h3>
              </div>

              <div className="tag-row tag-row-start">
                <span className="tag">{restaurant.isGooglePlace ? 'Google place' : 'Saved'}</span>
                <span className="tag">{restaurant.menuItemCount} menu item(s)</span>
                <span className="tag">{restaurant.menuImageCount} menu photo(s)</span>
              </div>

              <div className="split-list">
                <div className="list-item">
                  <strong>Place ID</strong>
                  <span className="text-muted">{formatOptional(restaurant.placeId, 'Not set')}</span>
                </div>
                <div className="list-item">
                  <strong>Cached</strong>
                  <span className="text-muted">
                    {restaurant.googlePlaceCachedAt?.trim()
                      ? formatDateTime(restaurant.googlePlaceCachedAt)
                      : 'Not cached'}
                  </span>
                </div>
                <div className="list-item">
                  <strong>Coordinates</strong>
                  <span className="text-muted">
                    {formatCoordinates(restaurant.latitude, restaurant.longitude)}
                  </span>
                </div>
                <div className="list-item">
                  <strong>Record ID</strong>
                  <span className="text-muted">{restaurant.id}</span>
                </div>
              </div>
            </article>
          </section>

          <section className="table-panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Menu items</p>
                <h3>{detailQuery.data.menuItems.length} item(s)</h3>
              </div>
            </div>

            {detailQuery.data.menuItems.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No menu items found for this restaurant.</span>
              </div>
            ) : (
              <MenuItemsTable rows={detailQuery.data.menuItems} />
            )}
          </section>

          <section className="table-panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Menu photos</p>
                <h3>{detailQuery.data.menuImages.length} photo(s)</h3>
              </div>
            </div>

            {detailQuery.data.menuImages.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No menu photos found for this restaurant.</span>
              </div>
            ) : (
              <MenuPhotosTable rows={detailQuery.data.menuImages} />
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
