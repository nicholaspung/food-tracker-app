import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAdminMenuImageInventoryDetail,
  updateAdminMenuItem,
  type MenuItemInventoryRow,
} from '@/features/menu-inventory/api';
import {
  buildMenuImageUrl,
  formatOptional,
  renderInventoryUser,
  renderInventoryVisibility,
} from '@/features/menu-inventory/display';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/formatters';

const MIN_ZOOM = 50;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;
const visibilityOptions = ['friends', 'private', 'public'] as const;

type MenuItemVisibility = (typeof visibilityOptions)[number];

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function normalizeVisibility(value?: string): MenuItemVisibility {
  if (value === 'private' || value === 'public' || value === 'friends') {
    return value;
  }
  return 'friends';
}

function AttachedMenuItemEditor({
  imageId,
  isPending,
  item,
  onAttach,
  onSave,
  onUnattach,
  rowError,
}: {
  imageId: string;
  isPending: boolean;
  item: MenuItemInventoryRow;
  onAttach?: (item: MenuItemInventoryRow) => Promise<unknown>;
  onSave: (input: {
    item: MenuItemInventoryRow;
    name: string;
    visibility: MenuItemVisibility;
  }) => Promise<unknown>;
  onUnattach?: (item: MenuItemInventoryRow) => Promise<unknown>;
  rowError?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingUnattach, setIsConfirmingUnattach] = useState(false);
  const [draftName, setDraftName] = useState(item.name);
  const [draftVisibility, setDraftVisibility] = useState<MenuItemVisibility>(
    normalizeVisibility(item.visibility),
  );

  const isAttachedToPhoto = item.sourceImage === imageId;

  const handleStartEditing = () => {
    setDraftName(item.name);
    setDraftVisibility(normalizeVisibility(item.visibility));
    setIsEditing(true);
    setIsConfirmingUnattach(false);
  };

  const handleCancelEditing = () => {
    setDraftName(item.name);
    setDraftVisibility(normalizeVisibility(item.visibility));
    setIsEditing(false);
  };

  const handleSave = async () => {
    await onSave({
      item,
      name: draftName.trim(),
      visibility: draftVisibility,
    });
    setIsEditing(false);
  };

  const handleAttach = async () => {
    if (!onAttach) {
      return;
    }
    await onAttach(item);
  };

  const handleUnattach = async () => {
    if (!onUnattach) {
      return;
    }
    await onUnattach(item);
    setIsConfirmingUnattach(false);
  };

  return (
    <article className="inline-edit-row">
      <div className="inline-edit-main">
        {isEditing ? (
          <div className="inline-edit-fields">
            <div className="field">
              <label htmlFor={`menu-item-name-${item.id}`}>Name</label>
              <input
                className="input"
                id={`menu-item-name-${item.id}`}
                onChange={(event) => setDraftName(event.target.value)}
                value={draftName}
              />
            </div>
            <div className="field field-compact">
              <label htmlFor={`menu-item-visibility-${item.id}`}>Visibility</label>
              <select
                className="input"
                id={`menu-item-visibility-${item.id}`}
                onChange={(event) => setDraftVisibility(event.target.value as MenuItemVisibility)}
                value={draftVisibility}
              >
                {visibilityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="inventory-primary-cell">
            <strong>{formatOptional(item.name, 'Unnamed item')}</strong>
            <span className="inventory-secondary-text">{item.id}</span>
          </div>
        )}

        <div className="tag-row tag-row-start">
          {item.isFromOcr ? <span className="tag">OCR</span> : <span className="tag">Manual</span>}
          {isAttachedToPhoto ? <span className="tag">Photo source</span> : null}
          {item.sourceImage && !isAttachedToPhoto ? <span className="tag">Other photo</span> : null}
          {renderInventoryVisibility(item.visibility)}
        </div>

        <div className="inventory-secondary-text">
          Created by {(item.creator?.email ?? item.createdBy) || 'unknown user'} - updated{' '}
          {formatDateTime(item.updated || item.created)}
        </div>

        {rowError ? <div className="state-panel error">{rowError}</div> : null}
      </div>

      <div className="compact-action-row">
        {isEditing ? (
          <>
            <button
              className="button primary"
              disabled={!draftName.trim() || isPending}
              onClick={() => {
                void handleSave().catch(() => undefined);
              }}
              type="button"
            >
              Save
            </button>
            <button
              className="button ghost"
              disabled={isPending}
              onClick={handleCancelEditing}
              type="button"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="button ghost" disabled={isPending} onClick={handleStartEditing} type="button">
              Edit
            </button>
            {onAttach ? (
              <button
                className="button primary"
                disabled={isPending}
                onClick={() => {
                  void handleAttach().catch(() => undefined);
                }}
                type="button"
              >
                Attach
              </button>
            ) : null}
            {onUnattach ? (
              isConfirmingUnattach ? (
                <>
                  <button
                    className="button warn"
                    disabled={isPending}
                    onClick={() => {
                      void handleUnattach().catch(() => undefined);
                    }}
                    type="button"
                  >
                    Remove from photo
                  </button>
                  <button
                    className="button ghost"
                    disabled={isPending}
                    onClick={() => setIsConfirmingUnattach(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="button ghost"
                  disabled={isPending}
                  onClick={() => setIsConfirmingUnattach(true)}
                  type="button"
                >
                  Remove from photo
                </button>
              )
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

export function MenuImageInventoryDetailPage() {
  const { fileAccessToken } = useAuth();
  const { imageId = '' } = useParams();
  const queryClient = useQueryClient();
  const [zoom, setZoom] = useState(100);
  const [attachSearch, setAttachSearch] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    enabled: Boolean(imageId),
    queryKey: ['admin', 'menu-inventory', 'menu-image-detail', imageId],
    queryFn: () => getAdminMenuImageInventoryDetail(imageId),
  });

  const invalidateInventoryQueries = async (restaurantId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['admin', 'menu-inventory'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['admin', 'menu-inventory', 'menu-image-detail', imageId],
      }),
      restaurantId
        ? queryClient.invalidateQueries({
            queryKey: ['admin', 'menu-inventory', 'restaurant-detail', restaurantId],
          })
        : Promise.resolve(),
    ]);
  };

  const menuItemMutation = useMutation({
    mutationFn: (input: {
      item: MenuItemInventoryRow;
      name: string;
      sourceImage?: string | null;
      visibility: MenuItemVisibility;
    }) =>
      updateAdminMenuItem(input.item.id, {
        name: input.name,
        sourceImage: input.sourceImage,
        visibility: input.visibility,
      }),
    onMutate: (input) => {
      setRowErrors((current) => {
        const next = { ...current };
        delete next[input.item.id];
        return next;
      });
    },
    onSuccess: async (_updatedItem, input) => {
      await invalidateInventoryQueries(input.item.restaurant || detailQuery.data?.menuImage.restaurant);
    },
    onError: (error, input) => {
      setRowErrors((current) => ({
        ...current,
        [input.item.id]: error instanceof Error ? error.message : 'Could not update this menu item.',
      }));
    },
  });

  const menuImage = detailQuery.data?.menuImage;
  const restaurant = detailQuery.data?.restaurant;
  const fullImageUrl = menuImage ? buildMenuImageUrl(menuImage, fileAccessToken) : '';

  const filteredUnattachedItems = useMemo(() => {
    const query = attachSearch.trim().toLowerCase();
    const rows = detailQuery.data?.unattachedRestaurantMenuItems ?? [];
    if (!query) {
      return rows;
    }
    return rows.filter((item) => item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query));
  }, [attachSearch, detailQuery.data?.unattachedRestaurantMenuItems]);

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Menu photo detail</p>
            <h2 style={{ marginBottom: 0 }}>
              {restaurant ? formatOptional(restaurant.name, 'Unnamed restaurant') : 'Loading menu photo...'}
            </h2>
          </div>
          <div className="summary-actions">
            {restaurant ? (
              <Link className="button ghost" to={`/menu-inventory/restaurants/${restaurant.id}`}>
                Restaurant inventory
              </Link>
            ) : null}
            <Link className="button ghost" to="/menu-inventory">
              Back to inventory
            </Link>
          </div>
        </div>
      </section>

      {detailQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading menu photo...</strong>
        </section>
      ) : null}

      {detailQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load this menu photo</strong>
          <span className="text-muted">
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : 'The menu photo may have been removed or your access expired.'}
          </span>
        </section>
      ) : null}

      {detailQuery.data && menuImage ? (
        <>
          <section className="detail-grid">
            <article className="detail-card">
              <div>
                <p className="eyebrow">Photo context</p>
                <h3>Upload metadata</h3>
              </div>

              <div className="split-list">
                <div className="list-item">
                  <strong>Restaurant</strong>
                  {restaurant ? (
                    <Link className="route-link" to={`/menu-inventory/restaurants/${restaurant.id}`}>
                      {formatOptional(restaurant.name, restaurant.id)}
                    </Link>
                  ) : (
                    <span className="text-muted">Unknown restaurant</span>
                  )}
                </div>
                <div className="list-item">
                  <strong>Uploaded by</strong>
                  {renderInventoryUser(menuImage.uploader, menuImage.uploadedBy)}
                </div>
                <div className="list-item">
                  <strong>Created</strong>
                  <span className="text-muted">{formatDateTime(menuImage.created)}</span>
                </div>
                <div className="list-item">
                  <strong>Record ID</strong>
                  <span className="text-muted">{menuImage.id}</span>
                </div>
              </div>
            </article>

            <article className="detail-card">
              <div>
                <p className="eyebrow">Attachment summary</p>
                <h3>Menu items</h3>
              </div>
              <div className="tag-row tag-row-start">
                <span className="tag">{detailQuery.data.attachedMenuItems.length} attached</span>
                <span className="tag">
                  {detailQuery.data.unattachedRestaurantMenuItems.length} available to attach
                </span>
              </div>
            </article>
          </section>

          <section className="photo-review-layout">
            <article className="photo-viewer-panel">
              <div className="summary-row">
                <div>
                  <p className="eyebrow">Menu photo</p>
                  <h3>Review source image</h3>
                </div>
                {fullImageUrl ? (
                  <a className="button ghost" href={fullImageUrl} rel="noreferrer" target="_blank">
                    Open image
                  </a>
                ) : null}
              </div>

              <div className="photo-viewer-toolbar">
                <button
                  className="button ghost"
                  disabled={zoom <= MIN_ZOOM}
                  onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
                  type="button"
                >
                  -
                </button>
                <span className="tag">{zoom}%</span>
                <button
                  className="button ghost"
                  disabled={zoom >= MAX_ZOOM}
                  onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
                  type="button"
                >
                  +
                </button>
                <button className="button ghost" onClick={() => setZoom(100)} type="button">
                  Reset
                </button>
              </div>

              {fullImageUrl ? (
                <div className="photo-viewer-scroll" tabIndex={0}>
                  <img
                    alt={`Menu upload ${menuImage.id}`}
                    className="photo-viewer-image"
                    src={fullImageUrl}
                    style={{ transform: `scale(${zoom / 100})` }}
                  />
                </div>
              ) : (
                <div className="state-panel">
                  <span className="text-muted">No image file is attached to this menu photo record.</span>
                </div>
              )}
            </article>

            <article className="attached-items-panel">
              <div>
                <p className="eyebrow">Attached menu items</p>
                <h3>{detailQuery.data.attachedMenuItems.length} item(s)</h3>
              </div>

              {detailQuery.data.attachedMenuItems.length === 0 ? (
                <div className="state-panel">
                  <span className="text-muted">No menu items currently reference this photo.</span>
                </div>
              ) : (
                <div className="menu-item-editor">
                  {detailQuery.data.attachedMenuItems.map((item) => (
                    <AttachedMenuItemEditor
                      imageId={menuImage.id}
                      isPending={menuItemMutation.isPending}
                      item={item}
                      key={item.id}
                      onSave={({ item: targetItem, name, visibility }) =>
                        menuItemMutation.mutateAsync({
                          item: targetItem,
                          name,
                          visibility,
                        })
                      }
                      onUnattach={(targetItem) =>
                        menuItemMutation.mutateAsync({
                          item: targetItem,
                          name: targetItem.name,
                          sourceImage: null,
                          visibility: normalizeVisibility(targetItem.visibility),
                        })
                      }
                      rowError={rowErrors[item.id]}
                    />
                  ))}
                </div>
              )}

              <details className="attach-existing-panel">
                <summary>Attach existing restaurant item</summary>

                {!restaurant ? (
                  <div className="state-panel">
                    <span className="text-muted">Attach is unavailable because this photo has no restaurant.</span>
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="attach-menu-item-search">Search restaurant items</label>
                      <input
                        className="input"
                        id="attach-menu-item-search"
                        onChange={(event) => setAttachSearch(event.target.value)}
                        placeholder="Search by item name or id"
                        type="search"
                        value={attachSearch}
                      />
                    </div>

                    {filteredUnattachedItems.length === 0 ? (
                      <div className="state-panel">
                        <span className="text-muted">No unattached restaurant items match this search.</span>
                      </div>
                    ) : (
                      <div className="menu-item-editor">
                        {filteredUnattachedItems.map((item) => (
                          <AttachedMenuItemEditor
                            imageId={menuImage.id}
                            isPending={menuItemMutation.isPending}
                            item={item}
                            key={item.id}
                            onAttach={(targetItem) =>
                              menuItemMutation.mutateAsync({
                                item: targetItem,
                                name: targetItem.name,
                                sourceImage: menuImage.id,
                                visibility: normalizeVisibility(targetItem.visibility),
                              })
                            }
                            onSave={({ item: targetItem, name, visibility }) =>
                              menuItemMutation.mutateAsync({
                                item: targetItem,
                                name,
                                visibility,
                              })
                            }
                            rowError={rowErrors[item.id]}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </details>
            </article>
          </section>
        </>
      ) : null}
    </>
  );
}
