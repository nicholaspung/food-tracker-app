import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteAdminRestaurantGroup,
  getAdminRestaurantGroupInventoryDetail,
  updateAdminMenuItem,
  updateAdminMenuItemApproval,
  updateAdminMenuItemGroupSuitable,
  updateAdminRestaurantGroupMetadata,
  type MenuItemApprovalStatus,
  type MenuItemInventoryRow,
  type RestaurantInventoryRow,
} from '@/features/menu-inventory/api';
import {
  formatOptional,
  getLinkedMenuItemDisplaySummary,
  renderInventoryUser,
  renderInventoryVisibility,
  renderLinkedMenuItemSummary,
  renderMenuCatalogTrustEvidence,
  renderMenuItemApprovalStatus,
  renderMenuItemGroupSuitableStatus,
} from '@/features/menu-inventory/display';
import { formatDateTime } from '@/lib/formatters';

function normalizeMenuItemNameForDuplicateCheck(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildDuplicateMenuItemNameSet(rows: MenuItemInventoryRow[]): Set<string> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const normalizedName = normalizeMenuItemNameForDuplicateCheck(row.name);
    if (!normalizedName) {
      continue;
    }

    counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
}

function GroupRestaurantsTable({ rows }: { rows: RestaurantInventoryRow[] }) {
  return (
    <div className="table-wrap restaurant-group-restaurants-scroll">
      <table>
        <thead>
          <tr>
            <th>Restaurant</th>
            <th>Location</th>
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

function GroupMenuItemsTable({
  disabledItemId,
  onDisableGroupSuitable,
  rows,
}: {
  disabledItemId?: string;
  onDisableGroupSuitable: (item: MenuItemInventoryRow) => void;
  rows: MenuItemInventoryRow[];
}) {
  return (
    <div className="table-wrap restaurant-group-menu-items-scroll">
      <table>
        <thead>
          <tr>
            <th>Menu item</th>
            <th>Restaurant</th>
            <th>Created by</th>
            <th>Visibility</th>
            <th>Approval</th>
            <th>Group suitable</th>
            <th>Evidence</th>
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
                  <td>{renderMenuItemGroupSuitableStatus(row.groupSuitable)}</td>
                  <td>{renderMenuCatalogTrustEvidence(row)}</td>
                  <td>
                    <button
                      className="button reverse"
                      disabled={disabledItemId === row.id}
                      onClick={() => onDisableGroupSuitable(row)}
                      type="button"
                    >
                      {disabledItemId === row.id ? 'Updating...' : 'Make not group suitable'}
                    </button>
                  </td>
                  <td>{formatDateTime(row.updated || row.created)}</td>
                </tr>
                {linkedSummary ? (
                  <tr className="inventory-linked-row">
                    <td colSpan={9}>{renderLinkedMenuItemSummary(linkedSummary)}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AllGroupMenuItemsTable({
  approvalItemId,
  groupSuitableItemId,
  publicItemId,
  onApprovalStatusChange,
  onEnableGroupSuitable,
  onMakePublic,
  rows,
}: {
  approvalItemId?: string;
  groupSuitableItemId?: string;
  publicItemId?: string;
  onApprovalStatusChange: (item: MenuItemInventoryRow, status: MenuItemApprovalStatus) => void;
  onEnableGroupSuitable: (item: MenuItemInventoryRow) => void;
  onMakePublic: (item: MenuItemInventoryRow) => void;
  rows: MenuItemInventoryRow[];
}) {
  return (
    <div className="table-wrap restaurant-group-menu-items-scroll">
      <table>
        <thead>
          <tr>
            <th>Menu item</th>
            <th>Restaurant</th>
            <th>Created by</th>
            <th>Visibility</th>
            <th>Approval</th>
            <th>Group suitable</th>
            <th>Evidence</th>
            <th>Actions</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const linkedSummary = getLinkedMenuItemDisplaySummary(row);
            const isPublic = row.visibility === 'public';
            const isApproved = row.approvalStatus === 'approved';
            const canEnableGroupSuitable = isPublic && isApproved;
            const isApprovalPending = approvalItemId === row.id;
            const isPublicPending = publicItemId === row.id;
            const isGroupSuitablePending = groupSuitableItemId === row.id;

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
                          disabled={isApprovalPending}
                          onClick={() => onApprovalStatusChange(row, 'approved')}
                          type="button"
                        >
                          Approve
                        </button>
                      ) : null}
                      {row.approvalStatus !== 'rejected' ? (
                        <button
                          className="button warn"
                          disabled={isApprovalPending}
                          onClick={() => onApprovalStatusChange(row, 'rejected')}
                          type="button"
                        >
                          Reject
                        </button>
                      ) : null}
                      {row.approvalStatus !== 'unreviewed' ? (
                        <button
                          className="button reverse"
                          disabled={isApprovalPending}
                          onClick={() => onApprovalStatusChange(row, 'unreviewed')}
                          type="button"
                        >
                          Restore
                        </button>
                      ) : null}
                      {!isPublic ? (
                        <button
                          className="button ghost"
                          disabled={isPublicPending}
                          onClick={() => onMakePublic(row)}
                          type="button"
                        >
                          {isPublicPending ? 'Updating...' : 'Make public'}
                        </button>
                      ) : null}
                      {!row.groupSuitable ? (
                        <button
                          className="button primary"
                          disabled={!canEnableGroupSuitable || isGroupSuitablePending}
                          onClick={() => onEnableGroupSuitable(row)}
                          type="button"
                        >
                          {isGroupSuitablePending ? 'Updating...' : 'Enable group suitable'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>{formatDateTime(row.updated || row.created)}</td>
                </tr>
                {linkedSummary ? (
                  <tr className="inventory-linked-row">
                    <td colSpan={9}>{renderLinkedMenuItemSummary(linkedSummary)}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RestaurantGroupInventoryDetailPage() {
  const { groupId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupNotes, setEditGroupNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [showDuplicateAllMenuItemNamesOnly, setShowDuplicateAllMenuItemNamesOnly] = useState(false);
  const [showAssociatedAllMenuItems, setShowAssociatedAllMenuItems] = useState(false);

  const detailQuery = useQuery({
    enabled: Boolean(groupId),
    queryKey: ['admin', 'menu-inventory', 'restaurant-group-detail', groupId],
    queryFn: () => getAdminRestaurantGroupInventoryDetail(groupId),
  });

  const restaurantGroup = detailQuery.data?.restaurantGroup;

  useEffect(() => {
    setEditGroupName(restaurantGroup?.name ?? '');
    setEditGroupNotes(restaurantGroup?.notes ?? '');
    setIsDeleteConfirming(false);
  }, [restaurantGroup?.id, restaurantGroup?.name, restaurantGroup?.notes]);

  const invalidateGroupInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory', 'restaurant-group-detail', groupId] }),
    ]);
  };

  const updateGroupMutation = useMutation({
    mutationFn: () =>
      updateAdminRestaurantGroupMetadata({
        groupId,
        name: editGroupName,
        notes: editGroupNotes,
      }),
    onMutate: () => setActionError(''),
    onSuccess: invalidateGroupInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update restaurant group.');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => deleteAdminRestaurantGroup(groupId),
    onMutate: () => setActionError(''),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory'] });
      navigate('/menu-inventory');
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not delete restaurant group.');
    },
  });

  const groupSuitableMutation = useMutation({
    mutationFn: (input: { groupSuitable: boolean; itemId: string }) =>
      updateAdminMenuItemGroupSuitable({ itemId: input.itemId, groupSuitable: input.groupSuitable }),
    onMutate: () => setActionError(''),
    onSuccess: invalidateGroupInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update menu item group-suitable status.');
    },
  });

  const approvalMutation = useMutation({
    mutationFn: (input: { itemId: string; status: MenuItemApprovalStatus }) =>
      updateAdminMenuItemApproval({ itemId: input.itemId, status: input.status }),
    onMutate: () => setActionError(''),
    onSuccess: invalidateGroupInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not approve menu item.');
    },
  });

  const publicVisibilityMutation = useMutation({
    mutationFn: (item: MenuItemInventoryRow) =>
      updateAdminMenuItem(item.id, {
        name: item.name,
        sourceImage: item.sourceImage?.trim() ? item.sourceImage : null,
        visibility: 'public',
      }),
    onMutate: () => setActionError(''),
    onSuccess: invalidateGroupInventory,
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not make menu item public.');
    },
  });

  const disabledGroupSuitableItemId = groupSuitableMutation.isPending
    ? groupSuitableMutation.variables?.itemId
    : undefined;
  const approvalItemId = approvalMutation.isPending ? approvalMutation.variables?.itemId : undefined;
  const publicItemId = publicVisibilityMutation.isPending ? publicVisibilityMutation.variables?.id : undefined;
  const isActionPending =
    updateGroupMutation.isPending ||
    deleteGroupMutation.isPending ||
    groupSuitableMutation.isPending ||
    approvalMutation.isPending ||
    publicVisibilityMutation.isPending;
  const allGroupMenuItems = detailQuery.data?.allMenuItems ?? [];
  const allGroupMenuItemsAfterAssociationFilter = useMemo(
    () =>
      showAssociatedAllMenuItems
        ? allGroupMenuItems
        : allGroupMenuItems.filter((item) => !item.groupSuitable),
    [allGroupMenuItems, showAssociatedAllMenuItems],
  );
  const duplicateAllGroupMenuItemNameSet = useMemo(
    () => buildDuplicateMenuItemNameSet(allGroupMenuItemsAfterAssociationFilter),
    [allGroupMenuItemsAfterAssociationFilter],
  );
  const visibleAllGroupMenuItems = useMemo(
    () =>
      showDuplicateAllMenuItemNamesOnly
        ? allGroupMenuItemsAfterAssociationFilter.filter((item) => {
          const normalizedName = normalizeMenuItemNameForDuplicateCheck(item.name);
          return duplicateAllGroupMenuItemNameSet.has(normalizedName);
        })
        : allGroupMenuItemsAfterAssociationFilter,
    [
      allGroupMenuItemsAfterAssociationFilter,
      duplicateAllGroupMenuItemNameSet,
      showDuplicateAllMenuItemNamesOnly,
    ],
  );

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Restaurant group inventory</p>
            <h2 style={{ marginBottom: 0 }}>
              {restaurantGroup ? formatOptional(restaurantGroup.name, 'Unnamed restaurant group') : 'Restaurant group'}
            </h2>
            <p className="text-muted" style={{ margin: 0 }}>
              Edit group metadata and inspect restaurants and group-associated menu items.
            </p>
          </div>
          <Link className="button ghost" to="/menu-inventory">
            Back to inventory
          </Link>
        </div>
      </section>

      {detailQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading restaurant group...</strong>
        </section>
      ) : null}

      {detailQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load restaurant group</strong>
          <span className="text-muted">
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : 'Confirm the admin API is running and your admin session is valid.'}
          </span>
        </section>
      ) : null}

      {actionError ? (
        <section className="state-panel error">
          <strong>Restaurant group action failed</strong>
          <span className="text-muted">{actionError}</span>
        </section>
      ) : null}

      {detailQuery.data && restaurantGroup ? (
        <>
          <section className="detail-grid">
            <article className="detail-card">
              <div>
                <p className="eyebrow">Group details</p>
                <h3>{formatOptional(restaurantGroup.name, 'Unnamed restaurant group')}</h3>
              </div>

              <div className="tag-row tag-row-start">
                <span className="tag">{restaurantGroup.restaurantCount} restaurant(s)</span>
                <span className="tag">{restaurantGroup.groupSuitableMenuItemCount} associated item(s)</span>
                <span className="tag">{restaurantGroup.menuItemCount} total item(s)</span>
              </div>

              <div className="split-list">
                <div className="list-item">
                  <strong>Creator</strong>
                  {renderInventoryUser(restaurantGroup.creator, restaurantGroup.createdBy)}
                </div>
                <div className="list-item">
                  <strong>Created</strong>
                  <span className="text-muted">{formatDateTime(restaurantGroup.created)}</span>
                </div>
                <div className="list-item">
                  <strong>Updated</strong>
                  <span className="text-muted">{formatDateTime(restaurantGroup.updated || restaurantGroup.created)}</span>
                </div>
                <div className="list-item">
                  <strong>Record ID</strong>
                  <span className="text-muted">{restaurantGroup.id}</span>
                </div>
              </div>
            </article>

            <article className="detail-card">
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateGroupMutation.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">Edit group</p>
                  <h3>Metadata</h3>
                </div>

                <div className="field">
                  <label htmlFor="restaurant-group-edit-name">Group name</label>
                  <input
                    className="input"
                    disabled={isActionPending}
                    id="restaurant-group-edit-name"
                    onChange={(event) => setEditGroupName(event.target.value)}
                    value={editGroupName}
                  />
                </div>

                <div className="field">
                  <label htmlFor="restaurant-group-edit-notes">Group notes</label>
                  <textarea
                    className="input"
                    disabled={isActionPending}
                    id="restaurant-group-edit-notes"
                    onChange={(event) => setEditGroupNotes(event.target.value)}
                    rows={4}
                    value={editGroupNotes}
                  />
                </div>

                <div className="button-row">
                  <button className="button primary" disabled={isActionPending || !editGroupName.trim()} type="submit">
                    {updateGroupMutation.isPending ? 'Saving...' : 'Save group details'}
                  </button>
                  <button
                    className="button danger"
                    disabled={isActionPending}
                    onClick={() => setIsDeleteConfirming(true)}
                    type="button"
                  >
                    Delete group
                  </button>
                </div>
              </form>

              {isDeleteConfirming ? (
                <div className="state-panel error">
                  <strong>Delete Restaurant Group?</strong>
                  <span className="text-muted">
                    This deletes only the group record. {restaurantGroup.restaurantCount} restaurant(s) will be
                    unassigned, and their menu items will remain.
                  </span>
                  <div className="button-row">
                    <button
                      className="button danger"
                      disabled={isActionPending}
                      onClick={() => deleteGroupMutation.mutate()}
                      type="button"
                    >
                      {deleteGroupMutation.isPending ? 'Deleting...' : 'Delete Restaurant Group'}
                    </button>
                    <button
                      className="button ghost"
                      disabled={isActionPending}
                      onClick={() => setIsDeleteConfirming(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          </section>

          <section className="table-panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Restaurants</p>
                <h3>{detailQuery.data.restaurants.length} restaurant(s) in this group</h3>
              </div>
            </div>

            {detailQuery.data.restaurants.length === 0 ? (
              <div className="state-panel">
                <strong>No restaurants are tied to this group.</strong>
                <span className="text-muted">Add restaurants from a restaurant inventory detail page.</span>
              </div>
            ) : (
              <GroupRestaurantsTable rows={detailQuery.data.restaurants} />
            )}
          </section>

          <section className="table-panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Associated menu items</p>
                <h3>{detailQuery.data.menuItems.length} group-suitable menu item(s)</h3>
              </div>
              <span className="tag">Enabled from member restaurants</span>
            </div>

            {detailQuery.data.menuItems.length === 0 ? (
              <div className="state-panel">
                <strong>No menu items have been associated to this group.</strong>
                <span className="text-muted">
                  Mark approved public menu items as group-suitable from a restaurant inventory detail page.
                </span>
              </div>
            ) : (
              <GroupMenuItemsTable
                disabledItemId={disabledGroupSuitableItemId}
                onDisableGroupSuitable={(item) =>
                  groupSuitableMutation.mutate({ groupSuitable: false, itemId: item.id })
                }
                rows={detailQuery.data.menuItems}
              />
            )}
          </section>

          <section className="table-panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">All group restaurant menu items</p>
                <h3>
                  {visibleAllGroupMenuItems.length} of {detailQuery.data.allMenuItems.length} menu item(s) across
                  this group
                </h3>
              </div>
              <span className="tag">Approve, publish, and associate</span>
            </div>
            <div className="filter-row">
              <button
                className={`filter-chip${showDuplicateAllMenuItemNamesOnly ? ' active' : ''}`}
                onClick={() => setShowDuplicateAllMenuItemNamesOnly((current) => !current)}
                type="button"
              >
                Duplicate names found
              </button>
              <button
                className={`filter-chip${showAssociatedAllMenuItems ? ' active' : ''}`}
                onClick={() => setShowAssociatedAllMenuItems((current) => !current)}
                type="button"
              >
                Show associated menu items
              </button>
              {!showAssociatedAllMenuItems ? (
                <span className="tag">{restaurantGroup.groupSuitableMenuItemCount} associated hidden</span>
              ) : null}
            </div>

            {detailQuery.data.allMenuItems.length === 0 ? (
              <div className="state-panel">
                <strong>No menu items exist for restaurants in this group.</strong>
                <span className="text-muted">Add menu items from the restaurant inventory detail pages.</span>
              </div>
            ) : visibleAllGroupMenuItems.length === 0 ? (
              <div className="state-panel">
                <strong>No menu items match these filters.</strong>
                <span className="text-muted">
                  Try showing associated menu items or turning off duplicate-name filtering.
                </span>
              </div>
            ) : (
              <AllGroupMenuItemsTable
                approvalItemId={approvalItemId}
                groupSuitableItemId={disabledGroupSuitableItemId}
                onApprovalStatusChange={(item, status) => approvalMutation.mutate({ itemId: item.id, status })}
                onEnableGroupSuitable={(item) =>
                  groupSuitableMutation.mutate({ groupSuitable: true, itemId: item.id })
                }
                onMakePublic={(item) => publicVisibilityMutation.mutate(item)}
                publicItemId={publicItemId}
                rows={visibleAllGroupMenuItems}
              />
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
