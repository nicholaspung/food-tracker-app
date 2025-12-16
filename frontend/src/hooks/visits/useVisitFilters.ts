import { useState, useMemo, useDeferredValue } from "react";
import { FilterType, VisibilityFilter, RatingFilter } from "@/constants/filters";

// Re-export types for backward compatibility
export type { FilterType, VisibilityFilter, RatingFilter };

export interface UseVisitFiltersParams<V, Q> {
  visits: V[];
  quickTrackItems: Q[];
  cutoffDate: Date;
  currentUserId: string;
  isFriendVisit: (visit: V) => boolean;
}

export interface UseVisitFiltersReturn<V, Q> {
  // Filter state
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deferredSearchQuery: string;
  filterType: FilterType;
  setFilterType: (type: FilterType) => void;
  visibilityFilter: VisibilityFilter;
  setVisibilityFilter: (filter: VisibilityFilter) => void;
  ratingFilter: RatingFilter;
  setRatingFilter: (filter: RatingFilter) => void;
  filtersExpanded: boolean;
  setFiltersExpanded: (expanded: boolean) => void;

  // Computed values
  filteredVisits: V[];
  filteredQuickTrackItems: Q[];
  hasMoreVisits: boolean;
  activeFiltersCount: number;

  // Actions
  resetFilters: () => void;
}

/**
 * Hook to handle filtering of visits and quick track items
 * Supports search, type filters, visibility filters, and rating filters
 */
export function useVisitFilters<V extends {
  restaurant?: { name?: string; location?: string; cuisineType?: string };
  foodItems?: Array<{ name?: string; rating: number }>;
  notes?: string;
  visibility?: string;
  visitDate: string;
}, Q extends {
  name?: string;
  notes?: string;
  location_text?: string;
  itemCategory?: string;
  visibility?: string;
  rating: number;
  itemDate?: string;
  created: string;
}>({
  visits,
  quickTrackItems,
  cutoffDate,
  currentUserId: _currentUserId,
  isFriendVisit,
}: UseVisitFiltersParams<V, Q>): UseVisitFiltersReturn<V, Q> {

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Filter visits based on time, search query, and filters
  const filteredVisits = useMemo(() => {
    // If searching, search ALL visits (ignore time filter)
    // Otherwise, filter by time range
    let filtered = deferredSearchQuery.trim()
      ? visits
      : visits.filter((visit) => new Date(visit.visitDate) >= cutoffDate);

    // Apply search filter
    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase();
      filtered = filtered.filter((visit) => {
        // Search in restaurant name
        const restaurantName = visit.restaurant?.name?.toLowerCase() || "";
        if (restaurantName.includes(query)) return true;

        // Search in restaurant location
        const restaurantLocation =
          visit.restaurant?.location?.toLowerCase() || "";
        if (restaurantLocation.includes(query)) return true;

        // Search in restaurant cuisine type
        const cuisineType = visit.restaurant?.cuisineType?.toLowerCase() || "";
        if (cuisineType.includes(query)) return true;

        // Search in food items
        const foodItemNames =
          visit.foodItems
            ?.map((item) => item.name?.toLowerCase() || "")
            .join(" ") || "";
        if (foodItemNames.includes(query)) return true;

        // Search in notes
        const notes = visit.notes?.toLowerCase() || "";
        if (notes.includes(query)) return true;

        return false;
      });
    }

    // Apply filter type
    if (filterType === "user_visits") {
      filtered = filtered.filter((visit) => !isFriendVisit(visit));
    } else if (filterType === "user_both") {
      filtered = filtered.filter((visit) => !isFriendVisit(visit));
    } else if (filterType === "friends") {
      filtered = filtered.filter((visit) => isFriendVisit(visit));
    } else if (filterType === "user_quick_track") {
      // No visits shown when filtering for quick track only
      filtered = [];
    }

    // Apply visibility filter (only for user's own visits)
    if (visibilityFilter !== "all") {
      filtered = filtered.filter((visit) => {
        // Only apply visibility filter to user's own visits
        if (isFriendVisit(visit)) return true;
        return visit.visibility === visibilityFilter;
      });
    }

    // Apply rating filter
    if (ratingFilter !== "all") {
      const targetRating = parseInt(ratingFilter);
      filtered = filtered.filter((visit) =>
        visit.foodItems?.some((item) => item.rating === targetRating)
      );
    }

    return filtered;
  }, [
    visits,
    cutoffDate,
    filterType,
    visibilityFilter,
    ratingFilter,
    deferredSearchQuery,
    isFriendVisit,
  ]);

  // Filter quick track items based on time, search query, and filters
  const filteredQuickTrackItems = useMemo(() => {
    // Filter by time range (use itemDate if available, otherwise created date)
    let filtered = deferredSearchQuery.trim()
      ? quickTrackItems
      : quickTrackItems.filter((item) => {
          const dateToUse = item.itemDate || item.created;
          return new Date(dateToUse) >= cutoffDate;
        });

    // Apply search filter
    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase();
      filtered = filtered.filter((item) => {
        // Search in item name
        const itemName = item.name?.toLowerCase() || "";
        if (itemName.includes(query)) return true;

        // Search in notes
        const notes = item.notes?.toLowerCase() || "";
        if (notes.includes(query)) return true;

        // Search in location text
        const locationText = item.location_text?.toLowerCase() || "";
        if (locationText.includes(query)) return true;

        // Search in category
        const category = item.itemCategory?.toLowerCase() || "";
        if (category.includes(query)) return true;

        return false;
      });
    }

    // Quick track items filtering based on type
    if (filterType === "friends") {
      // Friends filter: no quick track items from user
      return [];
    } else if (filterType === "user_visits") {
      // User visits only: no quick track items
      return [];
    }

    // Apply visibility filter
    if (visibilityFilter !== "all") {
      filtered = filtered.filter(
        (item) => item.visibility === visibilityFilter
      );
    }

    // Apply rating filter
    if (ratingFilter !== "all") {
      const targetRating = parseInt(ratingFilter);
      filtered = filtered.filter((item) => item.rating === targetRating);
    }

    return filtered;
  }, [
    quickTrackItems,
    cutoffDate,
    filterType,
    visibilityFilter,
    ratingFilter,
    deferredSearchQuery,
  ]);

  // Check if there are more visits to load (only when not searching)
  const hasMoreVisits = !deferredSearchQuery.trim() && visits.length > filteredVisits.length;

  // Count active filters
  const activeFiltersCount = [
    filterType !== "all",
    visibilityFilter !== "all",
    ratingFilter !== "all",
  ].filter(Boolean).length;

  // Reset all filters
  const resetFilters = () => {
    setFilterType("all");
    setVisibilityFilter("all");
    setRatingFilter("all");
    setSearchQuery("");
  };

  return {
    // Filter state
    searchQuery,
    setSearchQuery,
    deferredSearchQuery,
    filterType,
    setFilterType,
    visibilityFilter,
    setVisibilityFilter,
    ratingFilter,
    setRatingFilter,
    filtersExpanded,
    setFiltersExpanded,

    // Computed values
    filteredVisits,
    filteredQuickTrackItems,
    hasMoreVisits,
    activeFiltersCount,

    // Actions
    resetFilters,
  };
}
