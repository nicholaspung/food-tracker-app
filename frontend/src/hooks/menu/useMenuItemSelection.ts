import { useState, useEffect } from "react";
import { MenuItem } from "@/lib/pocketbase";
import { visitDraftService } from "@/services/visitDraftService";

interface SelectedItemWithDescription {
  menuItem: MenuItem;
  description: string;
  showDescriptionInput: boolean;
}

export interface UseMenuItemSelectionParams {
  restaurantId: string;
  initialSelectedItems?: MenuItem[];
}

export interface UseMenuItemSelectionReturn {
  // State
  selectedItems: Map<string, SelectedItemWithDescription>;

  // Actions
  handleToggleItem: (item: MenuItem) => void;
  handleToggleDescriptionInput: (itemId: string) => void;
  handleUpdateDescription: (itemId: string, description: string) => void;
  clearSelections: () => void;

  // Derived values
  selectedCount: number;
  selectedItemsList: MenuItem[];
}

export function useMenuItemSelection({
  restaurantId,
  initialSelectedItems = [],
}: UseMenuItemSelectionParams): UseMenuItemSelectionReturn {
  const [selectedItems, setSelectedItems] = useState<
    Map<string, SelectedItemWithDescription>
  >(new Map());

  // Restore previously selected items from localStorage OR initialize with pre-selected items
  useEffect(() => {
    // Priority: initialSelectedItems > draft
    if (initialSelectedItems.length > 0) {
      // Initialize with pre-selected items (for editing)
      const initialMap = new Map<string, SelectedItemWithDescription>();
      initialSelectedItems.forEach((item) => {
        initialMap.set(item.id, {
          menuItem: item,
          description: item.description || "",
          // Show description input if item already has a description
          showDescriptionInput: !!item.description,
        });
      });
      setSelectedItems(initialMap);
    } else {
      const draft = visitDraftService.getDraft();
      if (draft.items.length > 0) {
        // Filter items to only include those from the current restaurant
        const itemsForCurrentRestaurant = draft.items.filter(
          (draftItem) => draftItem.menuItem.restaurant === restaurantId
        );

        if (itemsForCurrentRestaurant.length > 0) {
          // Convert draft items back to Map structure
          const restoredMap = new Map<string, SelectedItemWithDescription>();
          itemsForCurrentRestaurant.forEach((draftItem) => {
            restoredMap.set(draftItem.menuItem.id, {
              menuItem: draftItem.menuItem,
              description: draftItem.description,
              // Show description input if item already has a description
              showDescriptionInput: !!draftItem.description,
            });
          });
          setSelectedItems(restoredMap);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save selected items to localStorage whenever they change
  useEffect(() => {
    if (selectedItems.size > 0) {
      const items = Array.from(selectedItems.values()).map((selected) => ({
        ...selected.menuItem,
        description: selected.description,
      }));
      visitDraftService.saveItems(items);
    }
  }, [selectedItems]);

  const handleToggleItem = (item: MenuItem) => {
    const newSelected = new Map(selectedItems);

    if (newSelected.has(item.id)) {
      // Deselect
      newSelected.delete(item.id);
    } else {
      // Select
      newSelected.set(item.id, {
        menuItem: item,
        description: "",
        showDescriptionInput: false,
      });
    }

    setSelectedItems(newSelected);
  };

  const handleToggleDescriptionInput = (itemId: string) => {
    const newSelected = new Map(selectedItems);
    const item = newSelected.get(itemId);

    if (item) {
      newSelected.set(itemId, {
        ...item,
        showDescriptionInput: !item.showDescriptionInput,
      });
      setSelectedItems(newSelected);
    }
  };

  const handleUpdateDescription = (itemId: string, description: string) => {
    const newSelected = new Map(selectedItems);
    const item = newSelected.get(itemId);

    if (item) {
      newSelected.set(itemId, {
        ...item,
        description,
      });
      setSelectedItems(newSelected);
    }
  };

  const clearSelections = () => {
    setSelectedItems(new Map());
  };

  // Derived values
  const selectedCount = selectedItems.size;
  const selectedItemsList = Array.from(selectedItems.values()).map(
    (item) => item.menuItem
  );

  return {
    selectedItems,
    handleToggleItem,
    handleToggleDescriptionInput,
    handleUpdateDescription,
    clearSelections,
    selectedCount,
    selectedItemsList,
  };
}
