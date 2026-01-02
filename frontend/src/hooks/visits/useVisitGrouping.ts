import { useState, useMemo, useEffect, useCallback } from "react";
import {
  getMonthKey,
  getDayKey,
  formatMonthLabel,
  formatDayLabel,
} from "@/lib/dateUtils";

export interface GroupedDay<V, Q> {
  dayKey: string;
  dayLabel: string;
  visits: V[];
  quickTrackItems: Q[];
  isFriendGroup: boolean;
}

export interface GroupedMonth<V, Q> {
  monthKey: string;
  monthLabel: string;
  days: GroupedDay<V, Q>[];
}

export interface UseVisitGroupingParams<V, Q> {
  filteredVisits: V[];
  filteredQuickTrackItems: Q[];
  deferredSearchQuery: string;
  currentUserId: string;
  isFriendVisit: (visit: V) => boolean;
  isFriendQuickTrack?: (item: Q) => boolean;
}

export interface UseVisitGroupingReturn<V, Q> {
  // Grouped data
  groupedVisits: GroupedMonth<V, Q>[];
  renderedGroupedVisits: GroupedMonth<V, Q>[];

  // Expansion state
  expandedMonths: Set<string>;
  toggleMonth: (monthKey: string) => void;
  expandedDays: Set<string>;
  toggleDay: (dayKey: string) => void;

  // Rendering
  renderedMonthsLimit: number;
  hasMoreMonthsToRender: boolean;
  loadMoreRenderedMonths: () => void;
}

/**
 * Hook to handle hierarchical grouping of visits and quick track items by month and day
 * Includes performance optimizations for large datasets (rendered month limits)
 * Auto-expands/collapses months when searching
 */
export function useVisitGrouping<V extends {
  visitDate: string;
  user: string;
}, Q extends {
  itemDate?: string;
  created: string;
  user: string;
}>({
  filteredVisits,
  filteredQuickTrackItems,
  deferredSearchQuery,
  currentUserId,
  isFriendVisit,
  isFriendQuickTrack,
}: UseVisitGroupingParams<V, Q>): UseVisitGroupingReturn<V, Q> {

  // Helper to check if a quick track item is from a friend
  const isQuickTrackFromFriend = (item: Q) => {
    if (isFriendQuickTrack) {
      return isFriendQuickTrack(item);
    }
    // Fallback: check if the item's user is different from current user
    return 'user' in item && item.user !== currentUserId;
  };

  // Rendering state
  const [renderedMonthsLimit, setRenderedMonthsLimit] = useState(3); // Only render 3 months at a time
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    new Set([getMonthKey(new Date().toISOString())])
  ); // Current month expanded by default
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set()); // Days start expanded (initialized via effect)
  const [previousSearchQuery, setPreviousSearchQuery] = useState("");
  const [daysInitialized, setDaysInitialized] = useState(false);

  // Group visits and quick track items by month, then by day
  const groupedVisits = useMemo(() => {
    const byMonth: Record<
      string,
      Record<
        string,
        {
          visits: V[];
          quickTrackItems: Q[];
        }
      >
    > = {};

    // Add visits
    filteredVisits.forEach((visit) => {
      const monthKey = getMonthKey(visit.visitDate);
      const isFriend = isFriendVisit(visit);
      const dayKey = getDayKey(visit.visitDate, isFriend);

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {};
      }
      if (!byMonth[monthKey][dayKey]) {
        byMonth[monthKey][dayKey] = { visits: [], quickTrackItems: [] };
      }
      byMonth[monthKey][dayKey].visits.push(visit);
    });

    // Add quick track items (use itemDate if available, otherwise created date)
    filteredQuickTrackItems.forEach((item) => {
      const dateToUse = item.itemDate || item.created;
      const monthKey = getMonthKey(dateToUse);
      const isFriend = isQuickTrackFromFriend(item);
      const dayKey = getDayKey(dateToUse, isFriend);

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {};
      }
      if (!byMonth[monthKey][dayKey]) {
        byMonth[monthKey][dayKey] = { visits: [], quickTrackItems: [] };
      }
      byMonth[monthKey][dayKey].quickTrackItems.push(item);
    });

    // Sort months descending
    const sortedMonths = Object.keys(byMonth).sort((a, b) =>
      b.localeCompare(a)
    );

    return sortedMonths.map((monthKey) => ({
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      days: Object.keys(byMonth[monthKey])
        .sort((a, b) => b.localeCompare(a)) // Sort days descending
        .map((dayKey) => {
          const { visits: visitsInDay, quickTrackItems: quickTrackItemsInDay } =
            byMonth[monthKey][dayKey];
          // Check if this is a friend group (all items in this group should be same type)
          // First check visits, then check quick track items if no visits
          const isFriend =
            (visitsInDay.length > 0 && isFriendVisit(visitsInDay[0])) ||
            (visitsInDay.length === 0 && quickTrackItemsInDay.length > 0 && isQuickTrackFromFriend(quickTrackItemsInDay[0]));
          return {
            dayKey,
            dayLabel: formatDayLabel(dayKey, isFriend),
            visits: visitsInDay,
            quickTrackItems: quickTrackItemsInDay,
            isFriendGroup: isFriend,
          };
        }),
    }));
  }, [filteredVisits, filteredQuickTrackItems, isFriendVisit]);

  // Limit the number of rendered months for performance (but show all when searching)
  const renderedGroupedVisits = useMemo(() => {
    // When searching, show all results
    if (deferredSearchQuery.trim()) {
      return groupedVisits;
    }
    // Otherwise, limit to improve performance
    return groupedVisits.slice(0, renderedMonthsLimit);
  }, [groupedVisits, renderedMonthsLimit, deferredSearchQuery]);

  const hasMoreMonthsToRender = !deferredSearchQuery.trim() && groupedVisits.length > renderedMonthsLimit;

  // Toggle month expansion
  const toggleMonth = useCallback((monthKey: string) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  }, []);

  // Toggle day expansion
  const toggleDay = useCallback((dayKey: string) => {
    setExpandedDays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dayKey)) {
        newSet.delete(dayKey);
      } else {
        newSet.add(dayKey);
      }
      return newSet;
    });
  }, []);

  // Load more rendered months (increase rendering limit)
  const loadMoreRenderedMonths = useCallback(() => {
    setRenderedMonthsLimit((prev) => prev + 3); // Load 3 more months at a time
  }, []);

  // Initialize all days as expanded on first load
  useEffect(() => {
    if (!daysInitialized && groupedVisits.length > 0) {
      const allDayKeys = groupedVisits.flatMap((g) => g.days.map((d) => d.dayKey));
      setExpandedDays(new Set(allDayKeys));
      setDaysInitialized(true);
    }
  }, [groupedVisits, daysInitialized]);

  // Auto-expand all months and days when searching
  useEffect(() => {
    if (deferredSearchQuery.trim() && deferredSearchQuery !== previousSearchQuery) {
      // When user starts searching or changes search, expand all months and days with results
      const allMonthKeys = groupedVisits.map((g) => g.monthKey);
      const allDayKeys = groupedVisits.flatMap((g) => g.days.map((d) => d.dayKey));
      setExpandedMonths(new Set(allMonthKeys));
      setExpandedDays(new Set(allDayKeys));
      setPreviousSearchQuery(deferredSearchQuery);
    } else if (!deferredSearchQuery.trim() && previousSearchQuery) {
      // When search is cleared, collapse to current month only and expand all days
      setExpandedMonths(new Set([getMonthKey(new Date().toISOString())]));
      const allDayKeys = groupedVisits.flatMap((g) => g.days.map((d) => d.dayKey));
      setExpandedDays(new Set(allDayKeys));
      setPreviousSearchQuery("");
    }
  }, [deferredSearchQuery, groupedVisits, previousSearchQuery]);

  return {
    // Grouped data
    groupedVisits,
    renderedGroupedVisits,

    // Expansion state
    expandedMonths,
    toggleMonth,
    expandedDays,
    toggleDay,

    // Rendering
    renderedMonthsLimit,
    hasMoreMonthsToRender,
    loadMoreRenderedMonths,
  };
}
