import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MenuItemRecord } from '../../features';
import {
  buildDraftVisitItem,
  normalizeSelectionLabel,
  type DraftVisitItem,
} from './shared';

type DraftVisitItemUpdates = Partial<
  Pick<DraftVisitItem, 'rating' | 'description' | 'notes' | 'photos'>
>;

interface UseCreateVisitDraftItemsParams {
  menuItems: MenuItemRecord[] | undefined;
}

export function useCreateVisitDraftItems({
  menuItems,
}: UseCreateVisitDraftItemsParams) {
  const [draftItems, setDraftItems] = useState<DraftVisitItem[]>([]);

  const updateDraftItem = useCallback(
    (itemId: string, updates: DraftVisitItemUpdates) => {
      setDraftItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item,
        ),
      );
    },
    [],
  );

  const removeDraftItemPhoto = useCallback((itemId: string, uri: string) => {
    setDraftItems((currentItems) =>
      currentItems.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              deletedPhotoIds: item.photos.reduce<string[]>(
                (nextDeletedPhotoIds, photo) =>
                  photo.id === uri && photo.kind === 'existing'
                    ? [...nextDeletedPhotoIds, photo.photoId]
                    : nextDeletedPhotoIds,
                item.deletedPhotoIds,
              ),
              photos: item.photos.filter((photo) => photo.id !== uri),
            },
      ),
    );
  }, []);

  const removeDraftItem = useCallback((itemId: string) => {
    setDraftItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }, []);

  const isMenuItemSelected = useCallback(
    (menuItem: MenuItemRecord) => {
      const normalizedMenuItemName = normalizeSelectionLabel(menuItem.name);
      return draftItems.some(
        (item) =>
          item.sourceMenuItemId === menuItem.id ||
          normalizeSelectionLabel(item.name) === normalizedMenuItemName,
      );
    },
    [draftItems],
  );

  const toggleMenuItemSelection = useCallback((menuItem: MenuItemRecord) => {
    const normalizedMenuItemName = normalizeSelectionLabel(menuItem.name);
    setDraftItems((currentItems) => {
      const existingDraftItem = currentItems.find(
        (item) =>
          item.sourceMenuItemId === menuItem.id ||
          normalizeSelectionLabel(item.name) === normalizedMenuItemName,
      );
      if (existingDraftItem) {
        return currentItems.filter((item) => item.id !== existingDraftItem.id);
      }

      return [...currentItems, buildDraftVisitItem(menuItem)];
    });
  }, []);

  const draftPhotoCount = useMemo(
    () =>
      draftItems.reduce(
        (totalCount, item) =>
          totalCount +
          item.photos.reduce(
            (itemPhotoCount, photo) =>
              itemPhotoCount + (photo.kind === 'new' ? 1 : 0),
            0,
          ),
        0,
      ),
    [draftItems],
  );

  useEffect(() => {
    if (!menuItems || menuItems.length === 0) {
      return;
    }

    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
    const menuItemsByNormalizedName = new Map(
      menuItems.map((item) => [normalizeSelectionLabel(item.name), item]),
    );

    setDraftItems((currentItems) =>
      currentItems.map((item) => {
        const matchedMenuItem =
          (item.sourceMenuItemId
            ? menuItemsById.get(item.sourceMenuItemId)
            : undefined) ??
          menuItemsByNormalizedName.get(normalizeSelectionLabel(item.name));
        if (!matchedMenuItem) {
          return item;
        }

        return {
          ...item,
          name: matchedMenuItem.name,
          sourceMenuItemId: matchedMenuItem.id,
        };
      }),
    );
  }, [menuItems]);

  return {
    draftItems,
    draftPhotoCount,
    isMenuItemSelected,
    removeDraftItem,
    removeDraftItemPhoto,
    selectedMenuItemCount: draftItems.length,
    setDraftItems,
    toggleMenuItemSelection,
    updateDraftItem,
  };
}
