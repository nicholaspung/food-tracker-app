import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import {
  createAdminRestaurantGroup,
  getAdminRestaurantInventoryDetail,
  promoteAdminMenuItemContribution,
  updateAdminMenuItemApproval,
  updateAdminMenuItemGroupSuitable,
  updateAdminRestaurantGroupMetadata,
  updateAdminRestaurantGroupMembership,
  type MenuItemApprovalStatus,
  type MenuImageInventoryRow,
  type MenuItemInventoryRow,
  type RestaurantGroupInventorySummary,
  type RestaurantInventoryDetailResponse,
  type RestaurantInventoryRow,
} from '@/features/menu-inventory/api';
import {
  buildMenuImageUrl,
  formatOptional,
  getLinkedMenuItemDisplaySummary,
  renderLinkedMenuItemSummary,
  renderMenuItemApprovalStatus,
  renderMenuItemGroupSuitableStatus,
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

function RestaurantGroupSummary({
  group,
}: {
  group: RestaurantGroupInventorySummary | null;
}) {
  if (!group) {
    return (
      <div className="inventory-primary-cell">
        <strong>No restaurant group</strong>
        <span className="inventory-secondary-text">This restaurant is not assigned to a trusted group.</span>
      </div>
    );
  }

  return (
    <div className="inventory-primary-cell">
      <strong>{formatOptional(group.name, 'Unnamed restaurant group')}</strong>
      {group.notes?.trim() ? <span className="inventory-secondary-text">{group.notes}</span> : null}
      <span className="inventory-secondary-text">{group.id}</span>
    </div>
  );
}

function MenuItemsTable({ rows }: { rows: MenuItemInventoryRow[] }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');

  const invalidateMenuItemContext = async (restaurantId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory'] }),
      restaurantId
        ? queryClient.invalidateQueries({
            queryKey: ['admin', 'menu-inventory', 'restaurant-detail', restaurantId],
          })
        : Promise.resolve(),
    ]);
  };

  const approvalMutation = useMutation({
    mutationFn: (input: { itemId: string; restaurantId?: string; status: MenuItemApprovalStatus }) =>
      updateAdminMenuItemApproval({ itemId: input.itemId, status: input.status }),
    onMutate: () => setActionError(''),
    onSuccess: async (_data, input) => {
      await invalidateMenuItemContext(input.restaurantId);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update menu item approval.');
    },
  });

  const promotionMutation = useMutation({
    mutationFn: (input: { itemId: string; restaurantId?: string }) =>
      promoteAdminMenuItemContribution(input.itemId),
    onMutate: () => setActionError(''),
    onSuccess: async (_data, input) => {
      await invalidateMenuItemContext(input.restaurantId);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not promote menu item.');
    },
  });

  const groupSuitableMutation = useMutation({
    mutationFn: (input: { groupSuitable: boolean; itemId: string; restaurantId?: string }) =>
      updateAdminMenuItemGroupSuitable({ itemId: input.itemId, groupSuitable: input.groupSuitable }),
    onMutate: () => setActionError(''),
    onSuccess: async (_data, input) => {
      await invalidateMenuItemContext(input.restaurantId);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update menu item group-suitable status.');
    },
  });

  const isActionPending =
    approvalMutation.isPending || promotionMutation.isPending || groupSuitableMutation.isPending;

  return (
    <>
      {actionError ? (
        <div className="state-panel error">
          <strong>Menu item action failed</strong>
          <span className="text-muted">{actionError}</span>
        </div>
      ) : null}

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
                  <th>Approval</th>
                  <th>Group suitable</th>
                  <th>Actions</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
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
                        <td>{renderMenuItemApprovalStatus(row.approvalStatus)}</td>
                        <td>
                          <div className="inventory-primary-cell">
                            {renderMenuItemGroupSuitableStatus(row.groupSuitable)}
                            {!canEnableGroupSuitable ? (
                              <span className="inventory-secondary-text">Requires public approved</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="compact-action-row">
                            {row.approvalStatus !== 'approved' ? (
                              <button
                                className="button ghost"
                                disabled={isActionPending}
                                onClick={() =>
                                  approvalMutation.mutate({
                                    itemId: row.id,
                                    restaurantId: row.restaurant,
                                    status: 'approved',
                                  })
                                }
                                type="button"
                              >
                                Approve
                              </button>
                            ) : null}
                            {row.approvalStatus !== 'rejected' ? (
                              <button
                                className="button warn"
                                disabled={isActionPending}
                                onClick={() =>
                                  approvalMutation.mutate({
                                    itemId: row.id,
                                    restaurantId: row.restaurant,
                                    status: 'rejected',
                                  })
                                }
                                type="button"
                              >
                                Reject
                              </button>
                            ) : null}
                            {row.approvalStatus !== 'unreviewed' ? (
                              <button
                                className="button reverse"
                                disabled={isActionPending}
                                onClick={() =>
                                  approvalMutation.mutate({
                                    itemId: row.id,
                                    restaurantId: row.restaurant,
                                    status: 'unreviewed',
                                  })
                                }
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
                                onClick={() =>
                                  promotionMutation.mutate({
                                    itemId: row.id,
                                    restaurantId: row.restaurant,
                                  })
                                }
                                type="button"
                              >
                                Promote
                              </button>
                            ) : null}
                            <button
                              className={row.groupSuitable ? 'button reverse' : 'button ghost'}
                              disabled={isActionPending || (!row.groupSuitable && !canEnableGroupSuitable)}
                              onClick={() =>
                                groupSuitableMutation.mutate({
                                  groupSuitable: !row.groupSuitable,
                                  itemId: row.id,
                                  restaurantId: row.restaurant,
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
                          <td colSpan={8}>{renderLinkedMenuItemSummary(linkedSummary)}</td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PaginatedCollection>
    </>
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
  const queryClient = useQueryClient();
  const [groupName, setGroupName] = useState('');
  const [groupNotes, setGroupNotes] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupNotes, setEditGroupNotes] = useState('');
  const [actionError, setActionError] = useState('');

  const detailQuery = useQuery({
    enabled: Boolean(restaurantId),
    queryKey: ['admin', 'menu-inventory', 'restaurant-detail', restaurantId],
    queryFn: () => getAdminRestaurantInventoryDetail(restaurantId),
  });

  const restaurant = detailQuery.data?.restaurant;
  const restaurantGroup = detailQuery.data?.restaurantGroup ?? restaurant?.restaurantGroup ?? null;

  useEffect(() => {
    setEditGroupName(restaurantGroup?.name ?? '');
    setEditGroupNotes(restaurantGroup?.notes ?? '');
  }, [restaurantGroup?.id, restaurantGroup?.name, restaurantGroup?.notes]);

  const setRestaurantDetailData = (data: RestaurantInventoryDetailResponse) => {
    queryClient.setQueryData(['admin', 'menu-inventory', 'restaurant-detail', restaurantId], data);
  };

  const invalidateInventoryQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu-inventory', 'restaurant-detail', restaurantId] }),
    ]);
  };

  const createGroupMutation = useMutation({
    mutationFn: () =>
      createAdminRestaurantGroup({
        name: groupName.trim() || restaurant?.name || 'Unnamed restaurant group',
        notes: groupNotes,
        restaurantId,
      }),
    onMutate: () => setActionError(''),
    onSuccess: async (payload) => {
      if (payload.restaurantDetail) {
        setRestaurantDetailData(payload.restaurantDetail);
      }
      setGroupName('');
      setGroupNotes('');
      await invalidateInventoryQueries();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not create restaurant group.');
    },
  });

  const membershipMutation = useMutation({
    mutationFn: (input: { groupId: string; targetRestaurantId: string }) =>
      updateAdminRestaurantGroupMembership({
        restaurantId: input.targetRestaurantId,
        groupId: input.groupId,
      }),
    onMutate: () => setActionError(''),
    onSuccess: async (data, input) => {
      if (input.targetRestaurantId === restaurantId) {
        setRestaurantDetailData(data);
      }
      await invalidateInventoryQueries();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update restaurant group membership.');
    },
  });

  const updateGroupMetadataMutation = useMutation({
    mutationFn: () => {
      if (!restaurantGroup) {
        throw new Error('No restaurant group is assigned.');
      }

      return updateAdminRestaurantGroupMetadata({
        groupId: restaurantGroup.id,
        name: editGroupName,
        notes: editGroupNotes,
      });
    },
    onMutate: () => setActionError(''),
    onSuccess: async (updatedGroup) => {
      const currentDetail = detailQuery.data;
      if (currentDetail) {
        setRestaurantDetailData({
          ...currentDetail,
          restaurantGroup: updatedGroup,
          restaurant: {
            ...currentDetail.restaurant,
            restaurantGroup: updatedGroup,
            restaurantGroupId: updatedGroup.id,
          },
          sameNameCandidates: currentDetail.sameNameCandidates.map((candidate) =>
            candidate.restaurantGroupId === updatedGroup.id
              ? {
                  ...candidate,
                  restaurantGroup: updatedGroup,
                }
              : candidate,
          ),
        });
      }
      await invalidateInventoryQueries();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not update restaurant group.');
    },
  });

  const isMembershipBusy =
    createGroupMutation.isPending || membershipMutation.isPending || updateGroupMetadataMutation.isPending;

  const handleCreateGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restaurantId || isMembershipBusy) {
      return;
    }
    void createGroupMutation.mutate();
  };

  const handleUnassignCurrentRestaurant = () => {
    if (!restaurantId || isMembershipBusy) {
      return;
    }
    membershipMutation.mutate({ groupId: '', targetRestaurantId: restaurantId });
  };

  const handleUpdateGroupMetadata = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restaurantGroup || isMembershipBusy) {
      return;
    }
    void updateGroupMetadataMutation.mutate();
  };

  const handleCandidateAction = (candidate: RestaurantInventoryRow) => {
    if (isMembershipBusy) {
      return;
    }

    if (restaurantGroup) {
      membershipMutation.mutate({
        groupId: restaurantGroup.id,
        targetRestaurantId: candidate.id,
      });
      return;
    }

    if (candidate.restaurantGroup) {
      membershipMutation.mutate({
        groupId: candidate.restaurantGroup.id,
        targetRestaurantId: restaurantId,
      });
    }
  };

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

          <section className="detail-grid">
            <article className="detail-card">
              <div className="summary-row">
                <div>
                  <p className="eyebrow">Restaurant group</p>
                  <h3>Membership</h3>
                </div>
                {restaurantGroup ? <span className="tag">Assigned</span> : <span className="tag">Unassigned</span>}
              </div>

              <RestaurantGroupSummary group={restaurantGroup} />

              {actionError ? (
                <div className="state-panel error">
                  <strong>Group action failed</strong>
                  <span>{actionError}</span>
                </div>
              ) : null}

              {restaurantGroup ? (
                <form className="menu-item-editor" onSubmit={handleUpdateGroupMetadata}>
                  <div className="field">
                    <label htmlFor="restaurant-group-edit-name">Group name</label>
                    <input
                      className="input"
                      id="restaurant-group-edit-name"
                      onChange={(event) => setEditGroupName(event.target.value)}
                      value={editGroupName}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="restaurant-group-edit-notes">Group notes</label>
                    <textarea
                      className="textarea"
                      id="restaurant-group-edit-notes"
                      onChange={(event) => setEditGroupNotes(event.target.value)}
                      placeholder="Optional admin notes"
                      value={editGroupNotes}
                    />
                  </div>
                  <div className="button-row">
                    <button className="button primary" disabled={isMembershipBusy || !editGroupName.trim()} type="submit">
                      {updateGroupMetadataMutation.isPending ? 'Saving...' : 'Save group details'}
                    </button>
                    <button
                      className="button warn"
                      disabled={isMembershipBusy}
                      onClick={handleUnassignCurrentRestaurant}
                      type="button"
                    >
                      {membershipMutation.isPending ? 'Updating...' : 'Unassign restaurant'}
                    </button>
                  </div>
                </form>
              ) : (
                <form className="menu-item-editor" onSubmit={handleCreateGroup}>
                  <div className="field">
                    <label htmlFor="restaurant-group-name">New group name</label>
                    <input
                      className="input"
                      id="restaurant-group-name"
                      onChange={(event) => setGroupName(event.target.value)}
                      placeholder={restaurant.name ? `${restaurant.name} group` : 'Restaurant group name'}
                      value={groupName}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="restaurant-group-notes">Notes</label>
                    <textarea
                      className="textarea"
                      id="restaurant-group-notes"
                      onChange={(event) => setGroupNotes(event.target.value)}
                      placeholder="Optional admin notes"
                      value={groupNotes}
                    />
                  </div>
                  <div className="button-row">
                    <button className="button primary" disabled={isMembershipBusy} type="submit">
                      {createGroupMutation.isPending ? 'Creating...' : 'Create group and assign'}
                    </button>
                  </div>
                </form>
              )}
            </article>

            <article className="detail-card">
              <div>
                <p className="eyebrow">Same-name candidates</p>
                <h3>{detailQuery.data.sameNameCandidates.length} candidate(s)</h3>
              </div>

              {detailQuery.data.sameNameCandidates.length === 0 ? (
                <div className="state-panel">
                  <span className="text-muted">No exact same-name restaurant candidates found.</span>
                </div>
              ) : (
                <div className="menu-item-editor">
                  {detailQuery.data.sameNameCandidates.map((candidate) => {
                    const candidateGroup = candidate.restaurantGroup;
                    const isAlreadyInCurrentGroup =
                      Boolean(restaurantGroup) && candidate.restaurantGroupId === restaurantGroup?.id;
                    const canAssignToCurrentGroup = Boolean(restaurantGroup) && !isAlreadyInCurrentGroup;
                    const canUseCandidateGroup = !restaurantGroup && Boolean(candidateGroup);
                    const actionLabel = restaurantGroup
                      ? isAlreadyInCurrentGroup
                        ? 'Already in group'
                        : 'Add to current group'
                      : candidateGroup
                        ? 'Use candidate group'
                        : 'Create group first';

                    return (
                      <article className="inline-edit-row" key={candidate.id}>
                        <div className="inline-edit-main">
                          <div className="inventory-primary-cell">
                            <Link className="route-link" to={`/menu-inventory/restaurants/${candidate.id}`}>
                              {formatOptional(candidate.name, 'Unnamed restaurant')}
                            </Link>
                            <span className="inventory-secondary-text">{formatOptional(candidate.location)}</span>
                          </div>
                          <div className="tag-row tag-row-start">
                            {candidateGroup ? (
                              <span className="tag">{formatOptional(candidateGroup.name, candidateGroup.id)}</span>
                            ) : (
                              <span className="tag">No group</span>
                            )}
                            <span className="tag">{candidate.menuItemCount} item(s)</span>
                            <span className="tag">{candidate.menuImageCount} photo(s)</span>
                          </div>
                        </div>
                        <div className="compact-action-row">
                          <button
                            className="button ghost"
                            disabled={isMembershipBusy || (!canAssignToCurrentGroup && !canUseCandidateGroup)}
                            onClick={() => handleCandidateAction(candidate)}
                            type="button"
                          >
                            {actionLabel}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
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
