import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  depromoteAdminMenuItem,
  getAdminMenuInventory,
  promoteAdminMenuItemContribution,
  updateAdminMenuItemApproval,
  updateAdminMenuItemGroupSuitable,
  type MenuItemApprovalStatus,
  type MenuItemInventoryFilter,
  type MenuItemVisibilityFilter,
  type MenuImageInventoryRow,
  type MenuInventoryType,
  type MenuItemInventoryRow,
  type RestaurantGroupInventoryRow,
  type RestaurantInventoryRow,
} from '@/features/menu-inventory/api';
import {
  buildMenuImageUrl,
  formatOptional,
  getLinkedMenuItemDisplaySummary,
  renderLinkedMenuItemSummary,
  renderMenuCatalogTrustEvidence,
  renderMenuItemApprovalStatus,
  renderMenuItemGroupSuitableStatus,
  renderInventoryUser,
  renderInventoryVisibility,
} from '@/features/menu-inventory/display';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/formatters';

const inventoryTabs: Array<{ label: string; value: MenuInventoryType }> = [
  { label: 'Restaurants', value: 'restaurants' },
  { label: 'Created Restaurant Groups', value: 'restaurant-groups' },
  { label: 'Menu Items', value: 'menu-items' },
  { label: 'Menu Photos', value: 'menu-images' },
];

const pageSizeOptions = [25, 50, 100];

const menuItemFilterOptions: Array<{ label: string; value: MenuItemInventoryFilter }> = [
  { label: 'All menu items', value: 'all' },
  { label: 'Not approved', value: 'not-approved' },
  { label: 'Approved, not promoted', value: 'approved-not-promoted' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Group-suitable', value: 'group-suitable' },
];

const menuItemVisibilityFilterOptions: Array<{ label: string; value: MenuItemVisibilityFilter }> = [
  { label: 'All visibility', value: 'all' },
  { label: 'Friends', value: 'friends' },
  { label: 'Private', value: 'private' },
  { label: 'Public', value: 'public' },
];

const menuItemHelpItems: Array<{ label: string; description: string }> = [
  {
    label: 'Not approved',
    description:
      'These items are waiting for admin review. Verify whether the item belongs to the restaurant, then approve it if it can become a restaurant menu item or reject it if it cannot be confirmed.',
  },
  {
    label: 'Rejected',
    description:
      'Rejected items could not be verified as belonging to the attached restaurant. They stay out of the public menu catalog.',
  },
  {
    label: 'Approved',
    description:
      'Approved items have been verified for the attached restaurant. Approval makes the item eligible for promotion, but does not by itself publish it as a selectable public menu item.',
  },
  {
    label: 'Promoted',
    description:
      'Promoted items are public catalog items for that restaurant. Users can select them when rating a menu item for a restaurant.',
  },
  {
    label: 'Not group-suitable',
    description:
      'Items are not group-suitable when the restaurant is not part of a restaurant group, or when the item should remain specific to only that restaurant.',
  },
  {
    label: 'Group-suitable',
    description:
      'Group-suitable items belong to a restaurant that is part of a restaurant group. They can appear across all restaurants in that group.',
  },
];

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
            <th>Evidence</th>
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
              <td>{renderMenuCatalogTrustEvidence(row)}</td>
              <td>{formatDateTime(row.updated || row.created)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RestaurantGroupInventoryTable({ rows }: { rows: RestaurantGroupInventoryRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Restaurant group</th>
            <th>Creator</th>
            <th>Restaurants</th>
            <th>Associated menu items</th>
            <th>Total menu items</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="inventory-primary-cell">
                  <Link className="route-link" to={`/menu-inventory/restaurant-groups/${row.id}`}>
                    {formatOptional(row.name, 'Unnamed restaurant group')}
                  </Link>
                  {row.notes?.trim() ? (
                    <span className="inventory-secondary-text">{row.notes}</span>
                  ) : null}
                  <span className="inventory-secondary-text">{row.id}</span>
                </div>
              </td>
              <td>{renderInventoryUser(row.creator, row.createdBy)}</td>
              <td>{row.restaurantCount}</td>
              <td>{row.groupSuitableMenuItemCount}</td>
              <td>{row.menuItemCount}</td>
              <td>{formatDateTime(row.updated || row.created)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface MenuItemRestaurantGroup {
  key: string;
  restaurantId?: string;
  restaurantName: string;
  restaurantLocation: string;
  rows: MenuItemInventoryRow[];
}

function getMenuItemRestaurantGroupKey(row: MenuItemInventoryRow) {
  const restaurantId = row.restaurant?.trim();
  if (restaurantId) {
    return restaurantId;
  }

  return `unknown:${row.restaurantName?.trim() || 'Unknown restaurant'}:${row.restaurantLocation?.trim() || ''}`;
}

function compareOptionalText(left?: string, right?: string) {
  return (left?.trim() || '').localeCompare(right?.trim() || '', undefined, {
    sensitivity: 'base',
  });
}

function compareMenuItemRestaurantGroups(left: MenuItemRestaurantGroup, right: MenuItemRestaurantGroup) {
  return (
    compareOptionalText(left.restaurantName || 'Unknown restaurant', right.restaurantName || 'Unknown restaurant') ||
    compareOptionalText(left.restaurantLocation, right.restaurantLocation) ||
    compareOptionalText(left.restaurantId, right.restaurantId)
  );
}

function compareMenuItemsAlphabetically(left: MenuItemInventoryRow, right: MenuItemInventoryRow) {
  return compareOptionalText(left.name, right.name) || compareOptionalText(left.id, right.id);
}

function groupMenuItemsByRestaurant(rows: MenuItemInventoryRow[]): MenuItemRestaurantGroup[] {
  const groups: MenuItemRestaurantGroup[] = [];
  const groupByKey = new Map<string, MenuItemRestaurantGroup>();

  for (const row of rows) {
    const key = getMenuItemRestaurantGroupKey(row);
    const existingGroup = groupByKey.get(key);

    if (existingGroup) {
      existingGroup.rows.push(row);
      continue;
    }

    const group: MenuItemRestaurantGroup = {
      key,
      restaurantId: row.restaurant?.trim() || undefined,
      restaurantName: formatOptional(row.restaurantName, 'Unknown restaurant'),
      restaurantLocation: formatOptional(row.restaurantLocation, row.restaurant || 'No restaurant id'),
      rows: [row],
    };
    groupByKey.set(key, group);
    groups.push(group);
  }

  for (const group of groups) {
    group.rows.sort(compareMenuItemsAlphabetically);
  }

  return groups.sort(compareMenuItemRestaurantGroups);
}

function MenuItemInventoryTable({ rows }: { rows: MenuItemInventoryRow[] }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const restaurantGroups = useMemo(() => groupMenuItemsByRestaurant(rows), [rows]);

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

  const depromotionMutation = useMutation({
    mutationFn: (itemId: string) => depromoteAdminMenuItem(itemId),
    onMutate: () => setActionError(''),
    onSuccess: invalidateMenuInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not de-promote menu item.');
    },
  });

  const groupSuitableMutation = useMutation({
    mutationFn: (input: { groupSuitable: boolean; itemId: string }) =>
      updateAdminMenuItemGroupSuitable(input),
    onMutate: () => setActionError(''),
    onSuccess: invalidateMenuInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update menu item group-suitable status.');
    },
  });

  const isActionPending =
    approvalMutation.isPending ||
    promotionMutation.isPending ||
    depromotionMutation.isPending ||
    groupSuitableMutation.isPending;

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
              <th>Group suitable</th>
              <th>Evidence</th>
              <th>Actions</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {restaurantGroups.map((group) => (
              <Fragment key={group.key}>
                <tr className="inventory-group-row">
                  <td colSpan={10}>
                    <div className="inventory-group-heading">
                      <div className="inventory-primary-cell">
                        {group.restaurantId ? (
                          <Link className="route-link" to={`/menu-inventory/restaurants/${group.restaurantId}`}>
                            {group.restaurantName}
                          </Link>
                        ) : (
                          <strong>{group.restaurantName}</strong>
                        )}
                        <span className="inventory-secondary-text">{group.restaurantLocation}</span>
                      </div>
                      <span className="tag">
                        {group.rows.length} menu item{group.rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </td>
                </tr>
                {group.rows.map((row) => {
                  const linkedSummary = getLinkedMenuItemDisplaySummary(row);
                  const canEnableGroupSuitable =
                    row.approvalStatus === 'approved' && row.visibility === 'public';

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
                          <div className="inventory-primary-cell">
                            {renderMenuItemGroupSuitableStatus(row.groupSuitable)}
                            {!canEnableGroupSuitable ? (
                              <span className="inventory-secondary-text">Requires public approved</span>
                            ) : null}
                          </div>
                        </td>
                        <td>{renderMenuCatalogTrustEvidence(row)}</td>
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
                            {row.promotedTo?.trim() || row.promotedFrom?.trim() ? (
                              <button
                                className="button danger"
                                disabled={isActionPending}
                                onClick={() => depromotionMutation.mutate(row.id)}
                                type="button"
                              >
                                De-promote
                              </button>
                            ) : null}
                            <button
                              className={row.groupSuitable ? 'button reverse' : 'button ghost'}
                              disabled={isActionPending || (!row.groupSuitable && !canEnableGroupSuitable)}
                              onClick={() =>
                                groupSuitableMutation.mutate({
                                  groupSuitable: !row.groupSuitable,
                                  itemId: row.id,
                                })
                              }
                              type="button"
                            >
                              {row.groupSuitable ? 'Disable group' : 'Enable group'}
                            </button>
                          </div>
                        </td>
                        <td>{formatDateTime(row.updated || row.created)}</td>
                      </tr>
                      {linkedSummary ? (
                        <tr className="inventory-linked-row">
                          <td colSpan={10}>{renderLinkedMenuItemSummary(linkedSummary)}</td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MenuImageInventoryTable({
  fileAccessToken,
  rows,
}: {
  fileAccessToken: string;
  rows: MenuImageInventoryRow[];
}) {
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
            const thumbUrl = buildMenuImageUrl(row, fileAccessToken, '160x160');
            const fullUrl = buildMenuImageUrl(row, fileAccessToken);

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
  const { fileAccessToken } = useAuth();
  const [activeType, setActiveType] = useState<MenuInventoryType>('restaurants');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuItemFilter, setMenuItemFilter] = useState<MenuItemInventoryFilter>('all');
  const [menuItemVisibility, setMenuItemVisibility] = useState<MenuItemVisibilityFilter>('all');
  const [isMenuItemHelpExpanded, setIsMenuItemHelpExpanded] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    setPage(1);
  }, [activeType, deferredSearchTerm, menuItemFilter, menuItemVisibility, perPage]);

  const inventoryQuery = useQuery({
    queryKey: [
      'admin',
      'menu-inventory',
      activeType,
      page,
      perPage,
      deferredSearchTerm,
      menuItemFilter,
      menuItemVisibility,
    ],
    queryFn: () =>
      getAdminMenuInventory({
        type: activeType,
        page,
        perPage,
        search: deferredSearchTerm,
        menuItemFilter,
        menuItemVisibility,
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
        <h2 style={{ marginBottom: 0 }}>Review cached restaurants, restaurant groups, menu items, and menu photos</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Inspect the shared menu data behind moderation queues. This view uses
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
              placeholder="Search by restaurant, group, user, record id, or location"
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

        {activeType === 'menu-items' ? (
          <>
            <div className="menu-item-filter-groups">
              <div className="menu-item-filter-group">
                <span className="menu-item-filter-label">Review state</span>
                <div className="filter-row menu-item-filter-row" aria-label="Menu item review filters">
                  {menuItemFilterOptions.map((option) => (
                    <button
                      className={`filter-chip${menuItemFilter === option.value ? ' active' : ''}`}
                      key={option.value}
                      onClick={() => setMenuItemFilter(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="menu-item-filter-group">
                <span className="menu-item-filter-label">Visibility</span>
                <div className="filter-row menu-item-filter-row" aria-label="Menu item visibility filters">
                  {menuItemVisibilityFilterOptions.map((option) => (
                    <button
                      className={`filter-chip${menuItemVisibility === option.value ? ' active' : ''}`}
                      key={option.value}
                      onClick={() => setMenuItemVisibility(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="menu-item-help-panel">
              <div className="menu-item-help-header">
                <div className="inventory-primary-cell">
                  <strong>Menu item review guide</strong>
                  <span className="text-muted">
                    Use these definitions when reviewing menu items and deciding whether to approve,
                    promote, reject, or mark an item as group-suitable.
                  </span>
                </div>
                <button
                  aria-expanded={isMenuItemHelpExpanded}
                  className="button ghost"
                  onClick={() => setIsMenuItemHelpExpanded((isExpanded) => !isExpanded)}
                  type="button"
                >
                  {isMenuItemHelpExpanded ? 'Hide guide' : 'Show guide'}
                </button>
              </div>

              {isMenuItemHelpExpanded ? (
                <dl className="menu-item-help-list">
                  {menuItemHelpItems.map((item) => (
                    <div className="menu-item-help-entry" key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.description}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </>
        ) : null}
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
              ) : activeType === 'restaurant-groups' ? (
                <RestaurantGroupInventoryTable rows={inventoryQuery.data.items as RestaurantGroupInventoryRow[]} />
              ) : activeType === 'menu-items' ? (
                <MenuItemInventoryTable rows={inventoryQuery.data.items as MenuItemInventoryRow[]} />
              ) : (
                <MenuImageInventoryTable
                  fileAccessToken={fileAccessToken}
                  rows={inventoryQuery.data.items as MenuImageInventoryRow[]}
                />
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
