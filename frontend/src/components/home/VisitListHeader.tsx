import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { RATING_LABELS } from "@/lib/ratingConstants";

type FilterType = "all" | "user_visits" | "user_quick_track" | "user_both" | "friends";
type VisibilityFilter = "all" | "private" | "friends";
type RatingFilter = "all" | "1" | "2" | "3" | "4" | "5";

interface VisitListHeaderProps {
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // Filters
  filterType: FilterType;
  onFilterTypeChange: (type: FilterType) => void;
  visibilityFilter: VisibilityFilter;
  onVisibilityFilterChange: (filter: VisibilityFilter) => void;
  ratingFilter: RatingFilter;
  onRatingFilterChange: (filter: RatingFilter) => void;
  filtersExpanded: boolean;
  onFiltersExpandedChange: (expanded: boolean) => void;
  activeFiltersCount: number;

  // Display counts
  userVisitsCount: number;
  friendVisitsCount: number;
  quickTrackCount: number;
  filteredVisitsCount: number;
  filteredQuickTrackCount: number;
  isSearching: boolean;
}

export default function VisitListHeader({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  visibilityFilter,
  onVisibilityFilterChange,
  ratingFilter,
  onRatingFilterChange,
  filtersExpanded,
  onFiltersExpandedChange,
  activeFiltersCount,
  userVisitsCount,
  friendVisitsCount,
  quickTrackCount,
  filteredVisitsCount,
  filteredQuickTrackCount,
  isSearching,
}: VisitListHeaderProps) {
  const handleFilterToggle = () => {
    if (filtersExpanded) {
      // Reset filters before hiding
      onFilterTypeChange("all");
      onVisibilityFilterChange("all");
      onRatingFilterChange("all");
    }
    onFiltersExpandedChange(!filtersExpanded);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Visits</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isSearching
            ? `Found ${filteredVisitsCount + filteredQuickTrackCount} items (${filteredVisitsCount} visits, ${filteredQuickTrackCount} quick items)`
            : (() => {
                const parts = [];
                if (userVisitsCount > 0) {
                  parts.push(
                    `${userVisitsCount} visit${userVisitsCount !== 1 ? "s" : ""}`
                  );
                }
                if (friendVisitsCount > 0) {
                  parts.push(
                    `${friendVisitsCount} friend visit${friendVisitsCount !== 1 ? "s" : ""}`
                  );
                }
                if (quickTrackCount > 0) {
                  parts.push(
                    `${quickTrackCount} quick item${quickTrackCount !== 1 ? "s" : ""}`
                  );
                }
                return parts.join(" • ");
              })()}
        </p>
      </div>

      {/* Search and Filter Row */}
      <div className="space-y-2">
        {/* Search Input and Filter Toggle Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search restaurants, food, notes..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Toggle Button */}
          <Button
            variant={filtersExpanded ? "default" : "outline"}
            size="default"
            onClick={handleFilterToggle}
            className="flex items-center gap-2 px-4 relative"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <Badge className="ml-1 h-5 min-w-5 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Filter Selects Row (Collapsible) */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            filtersExpanded ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex gap-2 items-center">
            {/* Type Filter */}
            <Select
              value={filterType}
              onValueChange={(value: FilterType) => onFilterTypeChange(value)}
            >
              <SelectTrigger className="flex-1 min-w-0">
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="user_visits">My Visits</SelectItem>
                <SelectItem value="user_quick_track">My Quick Track</SelectItem>
                <SelectItem value="user_both">Both</SelectItem>
                <SelectItem value="friends">Friends</SelectItem>
              </SelectContent>
            </Select>

            {/* Visibility Filter */}
            <Select
              value={visibilityFilter}
              onValueChange={(value: VisibilityFilter) =>
                onVisibilityFilterChange(value)
              }
            >
              <SelectTrigger className="flex-1 min-w-0">
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visibility</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="friends">Shared</SelectItem>
              </SelectContent>
            </Select>

            {/* Rating Filter */}
            <Select
              value={ratingFilter}
              onValueChange={(value: RatingFilter) =>
                onRatingFilterChange(value)
              }
            >
              <SelectTrigger className="flex-1 min-w-0">
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">{RATING_LABELS[4]}</SelectItem>
                <SelectItem value="4">{RATING_LABELS[3]}</SelectItem>
                <SelectItem value="3">{RATING_LABELS[2]}</SelectItem>
                <SelectItem value="2">{RATING_LABELS[1]}</SelectItem>
                <SelectItem value="1">{RATING_LABELS[0]}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
