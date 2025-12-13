import { useState, useEffect } from "react";
import { MenuItem, pb } from "@/lib/pocketbase";
import { searchMenuItems } from "@/services/ocrService";
import { logger } from "@/lib/logger";

export interface UseMenuItemSearchParams {
  restaurantId: string;
  parsedItems?: MenuItem[];
  cachedMenuItems?: MenuItem[];
  isOnline: boolean;
}

export interface UseMenuItemSearchReturn {
  searchQuery: string;
  searchResults: MenuItem[];
  isSearching: boolean;
  newlyParsedItems: Set<string>;

  handleSearch: (query: string) => void;
  setSearchResults: (items: MenuItem[]) => void;
  addNewlyParsedItems: (items: MenuItem[]) => void;
  isParsedItem: (itemId: string) => boolean;
}

export function useMenuItemSearch({
  restaurantId,
  parsedItems = [],
  cachedMenuItems = [],
  isOnline,
}: UseMenuItemSearchParams): UseMenuItemSearchReturn {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MenuItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [newlyParsedItems, setNewlyParsedItems] = useState<Set<string>>(
    new Set()
  );

  // Load initial results only on mount
  useEffect(() => {
    if (parsedItems.length > 0) {
      setSearchResults(parsedItems);
      // Mark parsed items as new
      setNewlyParsedItems(new Set(parsedItems.map((item) => item.id)));
    } else if (cachedMenuItems) {
      // Use cached menu items from TanStack Query (includes offline optimistic items)
      setSearchResults(cachedMenuItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedMenuItems]); // Run when cached items load

  const loadAllMenuItems = async () => {
    if (!isOnline) {
      // Skip loading when offline - just show empty results
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const items = await pb.collection("menu_items").getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: "-created",
      });
      setSearchResults(items);
    } catch (error) {
      logger.error("Failed to load menu items:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      // Show parsed items or all items if no search query
      if (parsedItems.length > 0) {
        setSearchResults(parsedItems);
      } else {
        loadAllMenuItems();
      }
      return;
    }

    if (!isOnline) {
      // When offline, only search in parsed items
      if (parsedItems.length > 0) {
        const filtered = parsedItems.filter((item) =>
          item.name.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
      } else {
        setSearchResults([]);
      }
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchMenuItems(restaurantId, query);
      setSearchResults(results);
    } catch (error) {
      logger.error("Search failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const addNewlyParsedItems = (items: MenuItem[]) => {
    const newIds = new Set([
      ...newlyParsedItems,
      ...items.map((item) => item.id),
    ]);
    setNewlyParsedItems(newIds);
  };

  const isParsedItem = (itemId: string) => {
    return newlyParsedItems.has(itemId);
  };

  return {
    searchQuery,
    searchResults,
    isSearching,
    newlyParsedItems,
    handleSearch,
    setSearchResults,
    addNewlyParsedItems,
    isParsedItem,
  };
}
