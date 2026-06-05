import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAdminMenuInventory,
  promoteAdminMenuItemContribution,
  updateAdminMenuItemApproval,
  type MenuItemApprovalStatus,
  type MenuImageInventoryRow,
  type MenuInventoryType,
  type MenuItemInventoryRow,
  type RestaurantInventoryRow,
} from '@/features/menu-inventory/api';
import {
  buildMenuImageUrl,
  formatOptional,
  getLinkedMenuItemDisplaySummary,
  renderLinkedMenuItemSummary,
  renderMenuItemApprovalStatus,
  renderInventoryUser,
  renderInventoryVisibility,
} from '@/features/menu-inventory/display';
import { formatDateTime } from '@/lib/formatters';

const inventoryTabs: Array<{ label: string; value: MenuInventoryType }> = [
  { label: 'Restaurants', value: 'restaurants' },
  { label: 'Menu Items', value: 'menu-items' },
  { label: 'Menu Photos', value: 'menu-images' },
];

const pageSizeOptions = [25, 50, 100];

function getTypeLabel(type: MenuInventoryType) {
  return inventoryTabs.find((tab) => tab.value === type)?.label ?? 'Inventory';
}

function ServerPaginationControls({
  currentPage,
  totalItems,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination-bar">
      <span className="pagination-summary">
        Page {currentPage} of {totalPages} · {totalItems} total
      </span>

      <div className="pagination-actions">
        <button
          className="button ghost"
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
          type="button"
        >
          First
        </button>
        <button
          className="button ghost"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          type="button"
        >
          Previous
        </button>
        <span className="tag">
          {currentPage}/{totalPages}
        </span>
        <button
          className="button ghost"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          type="button"
        >
          Next
        </button>
        <button
          className="button ghost"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          type="button"
        >
          Last
        </button>
      </div>
    </div>
  );
}

function RestaurantInventoryTable({ rows }: { rows: RestaurantInventoryRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Restaurant</th>
            <th>Location</th>
            <th>Cache/source</th>
            <th>Creator</th>
            <th>Visibility</th>
            <th>Menu items</th>
            <th>Menu photos</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="inventory-primary-cell">
                  <Link className="route-link" to={`/menu-inventory/restaurants/${row.id}`}>
                    {formatOptional(row.name, 'Unnamed restaurant')}
                  </Link>
                  <span className="inventory-secondary-text">{row.id}</span>
                </div>
              </td>
              <td>
                <div className="inventory-primary-cell">
                  <span>{formatOptional(row.location)}</span>
                  {row.cuisineType?.trim() ? (
                    <span className="inventory-secondary-text">{row.cuisineType}</span>
                  ) : null}
                </div>
              </td>
              <td>
                <div className="tag-row tag-row-start">
                  <span className="tag">{row.isGooglePlace ? 'Google place' : 'Saved'}</span>
                  {row.placeId?.trim() ? <span className="tag">Place ID</span> : null}
                </div>
                {row.googlePlaceCachedAt?.trim() ? (
                  <span className="inventory-secondary-text">
                    Cached {formatDateTime(row.googlePlaceCachedAt)}
                  </span>
                ) : null}
              </td>
              <td>{renderInventoryUser(row.creator, row.createdBy)}</td>
              <td>{renderInventoryVisibility(row.visibility)}</td>
              <td>{row.menuItemCount}</td>
              <td>{row.menuImageCount}</td>
              <td>{formatDateTime(row.updated || row.created)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MenuItemInventoryTable({ rows }: { rows: MenuItemInventoryRow[] }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');

  const invalidateMenuInventory = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory'] });
  };

  const approvalMutation = useMutation({
    mutationFn: (input: { itemId: string; status: MenuItemApprovalStatus }) =>
      updateAdminMenuItemApproval(input),
    onMutate: () => setActionError(''),
    onSuccess: invalidateMenuInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update menu item approval.');
    },
  });

  const promotionMutation = useMutation({
    mutationFn: (itemId: string) => promoteAdminMenuItemContribution(itemId),
    onMutate: () => setActionError(''),
    onSuccess: invalidateMenuInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not promote menu item.');
    },
  });

  const isActionPending = approvalMutation.isPending || promotionMutation.isPending;

  return (
    <>
      {actionError ? (
        <div className="state-panel error">
          <strong>Menu item action failed</strong>
          <span className="text-muted">{actionError}</span>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Restaurant</th>
              <th>Created by</th>
              <th>Source</th>
              <th>Visibility</th>
              <th>Approval</th>
              <th>Actions</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const linkedSummary = getLinkedMenuItemDisplaySummary(row);

              return (
                <Fragment key={row.id}>
                  <tr>
                    <td>
                      <div className="inventory-primary-cell">
                        <strong>{formatOptional(row.name, 'Unnamed item')}</strong>
                        <span className="inventory-secondary-text">{row.id}</span>
                      </div>
                    </td>
                    <td>
                      <div className="inventory-primary-cell">
                        <span>{formatOptional(row.restaurantName, 'Unknown restaurant')}</span>
                        <span className="inventory-secondary-text">
                          {formatOptional(row.restaurantLocation, row.restaurant || 'No restaurant id')}
                        </span>
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
                    <td>
                      <div className="inventory-primary-cell">
                        {renderMenuItemApprovalStatus(row.approvalStatus)}
                        {row.approvalReviewedAt?.trim() ? (
                          <span className="inventory-secondary-text">
                            {formatDateTime(row.approvalReviewedAt)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="compact-action-row">
                        {row.approvalStatus !== 'approved' ? (
                          <button
                            className="button ghost"
                            disabled={isActionPending}
                            onClick={() => approvalMutation.mutate({ itemId: row.id, status: 'approved' })}
                            type="button"
                          >
                            Approve
                          </button>
                        ) : null}
                        {row.approvalStatus !== 'rejected' ? (
                          <button
                            className="button warn"
                            disabled={isActionPending}
                            onClick={() => approvalMutation.mutate({ itemId: row.id, status: 'rejected' })}
                            type="button"
                          >
                            Reject
                          </button>
                        ) : null}
                        {row.approvalStatus !== 'unreviewed' ? (
                          <button
                            className="button reverse"
                            disabled={isActionPending}
                            onClick={() => approvalMutation.mutate({ itemId: row.id, status: 'unreviewed' })}
                            type="button"
                          >
                            Restore
                          </button>
                        ) : null}
                        {row.approvalStatus === 'approved' &&
                        !row.promotedTo?.trim() &&
                        !row.promotedFrom?.trim() ? (
                          <button
                            className="button primary"
                            disabled={isActionPending}
                            onClick={() => promotionMutation.mutate(row.id)}
                            type="button"
                          >
                            Promote
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatDateTime(row.updated || row.created)}</td>
                  </tr>
                  {linkedSummary ? (
                    <tr className="inventory-linked-row">
                      <td colSpan={8}>{renderLinkedMenuItemSummary(linkedSummary)}</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MenuImageInventoryTable({ rows }: { rows: MenuImageInventoryRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Preview</th>
            <th>Restaurant</th>
            <th>Uploaded by</th>
            <th>Created</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
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
                <td>
                  <div className="inventory-primary-cell">
                    <span>{formatOptional(row.restaurantName, 'Unknown restaurant')}</span>
                    <span className="inventory-secondary-text">
                      {formatOptional(row.restaurantLocation, row.restaurant || row.id)}
                    </span>
                  </div>
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
  );
}

export function MenuInventoryPage() {
  const [activeType, setActiveType] = useState<MenuInventoryType>('restaurants');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    setPage(1);
  }, [activeType, deferredSearchTerm, perPage]);

  const inventoryQuery = useQuery({
    queryKey: ['admin', 'menu-inventory', activeType, page, perPage, deferredSearchTerm],
    queryFn: () =>
      getAdminMenuInventory({
        type: activeType,
        page,
        perPage,
        search: deferredSearchTerm,
      }),
  });

  const pageTitle = getTypeLabel(activeType);
  const summaryText = useMemo(() => {
    if (!inventoryQuery.data) {
      return 'No records loaded yet.';
    }

    return `${inventoryQuery.data.totalItems} ${pageTitle.toLowerCase()} record(s)`;
  }, [inventoryQuery.data, pageTitle]);

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Menu inventory</p>
        <h2 style={{ marginBottom: 0 }}>Review cached restaurants, menu items, and menu photos</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Inspect the shared menu data behind moderation queues. This view is read-only and uses
          server-side pagination.
        </p>
      </section>

      <section className="panel">
        <div className="filter-row">
          {inventoryTabs.map((tab) => (
            <button
              className={`filter-chip${activeType === tab.value ? ' active' : ''}`}
              key={tab.value}
              onClick={() => setActiveType(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="menu-inventory-search">Search {pageTitle.toLowerCase()}</label>
            <input
              className="input"
              id="menu-inventory-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by restaurant, user, record id, or location"
              type="search"
              value={searchTerm}
            />
          </div>

          <div className="field field-compact">
            <label htmlFor="menu-inventory-page-size">Page size</label>
            <select
              className="input"
              id="menu-inventory-page-size"
              onChange={(event) => setPerPage(Number(event.target.value))}
              value={perPage}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {inventoryQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading menu inventory...</strong>
        </section>
      ) : null}

      {inventoryQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load menu inventory</strong>
          <span className="text-muted">
            {inventoryQuery.error instanceof Error
              ? inventoryQuery.error.message
              : 'Confirm the admin API is running and your admin session is valid.'}
          </span>
        </section>
      ) : null}

      {inventoryQuery.data ? (
        <section className="table-panel">
          <div className="summary-row">
            <div>
              <p className="eyebrow">{pageTitle}</p>
              <h3>{summaryText}</h3>
            </div>

            <div className="tag-row">
              <span className="tag">{inventoryQuery.data.totalItems} total</span>
              <span className="tag">
                Page {inventoryQuery.data.totalPages === 0 ? 0 : inventoryQuery.data.page} of{' '}
                {inventoryQuery.data.totalPages}
              </span>
            </div>
          </div>

          {inventoryQuery.data.items.length === 0 ? (
            <div className="state-panel">
              <strong>No {pageTitle.toLowerCase()} matched the current filters.</strong>
              <span className="text-muted">Try a broader search or switch inventory tabs.</span>
            </div>
          ) : (
            <>
              <ServerPaginationControls
                currentPage={inventoryQuery.data.page}
                onPageChange={setPage}
                totalItems={inventoryQuery.data.totalItems}
                totalPages={inventoryQuery.data.totalPages}
              />

              {activeType === 'restaurants' ? (
                <RestaurantInventoryTable rows={inventoryQuery.data.items as RestaurantInventoryRow[]} />
              ) : activeType === 'menu-items' ? (
                <MenuItemInventoryTable rows={inventoryQuery.data.items as MenuItemInventoryRow[]} />
              ) : (
                <MenuImageInventoryTable rows={inventoryQuery.data.items as MenuImageInventoryRow[]} />
              )}

              <ServerPaginationControls
                currentPage={inventoryQuery.data.page}
                onPageChange={setPage}
                totalItems={inventoryQuery.data.totalItems}
                totalPages={inventoryQuery.data.totalPages}
              />
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
