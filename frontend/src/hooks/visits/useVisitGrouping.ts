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
}

export interface UseVisitGroupingReturn<V, Q> {
  // Grouped data
  groupedVisits: GroupedMonth<V, Q>[];
  renderedGroupedVisits: GroupedMonth<V, Q>[];

  // Expansion state
  expandedMonths: Set<string>;
  toggleMonth: (monthKey: string) => void;

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
  currentUserId: _currentUserId,
  isFriendVisit,
}: UseVisitGroupingParams<V, Q>): UseVisitGroupingReturn<V, Q> {

  // Rendering state
  const [renderedMonthsLimit, setRenderedMonthsLimit] = useState(3); // Only render 3 months at a time
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    new Set([getMonthKey(new Date().toISOString())])
  ); // Current month expanded by default
  const [previousSearchQuery, setPreviousSearchQuery] = useState("");

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
      const dayKey = getDayKey(dateToUse, false);

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
          // Check if this is a friend visit group (all visits in this group should be same type)
          const isFriend =
            visitsInDay.length > 0 && isFriendVisit(visitsInDay[0]);
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

  // Load more rendered months (increase rendering limit)
  const loadMoreRenderedMonths = useCallback(() => {
    setRenderedMonthsLimit((prev) => prev + 3); // Load 3 more months at a time
  }, []);

  // Auto-expand all months when searching
  useEffect(() => {
    if (deferredSearchQuery.trim() && deferredSearchQuery !== previousSearchQuery) {
      // When user starts searching or changes search, expand all months with results
      const allMonthKeys = groupedVisits.map((g) => g.monthKey);
      setExpandedMonths(new Set(allMonthKeys));
      setPreviousSearchQuery(deferredSearchQuery);
    } else if (!deferredSearchQuery.trim() && previousSearchQuery) {
      // When search is cleared, collapse to current month only
      setExpandedMonths(new Set([getMonthKey(new Date().toISOString())]));
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

    // Rendering
    renderedMonthsLimit,
    hasMoreMonthsToRender,
    loadMoreRenderedMonths,
  };
}
