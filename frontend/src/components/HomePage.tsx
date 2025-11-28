import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, Visit, Restaurant, FoodItem } from "@/lib/pocketbase";
import { syncQueue } from "@/lib/syncQueue";
import { useSync } from "@/contexts/SyncContext";
import { utcToLocalDateString } from "@/lib/dateUtils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  MapPin,
  Utensils,
  Pencil,
  ChevronDown,
  ChevronRight,
  Trash2,
  Users,
  Plus,
  Search,
  X,
  Share2,
  Lock,
  UserCheck,
  SlidersHorizontal,
} from "lucide-react";
import { WhatsNewDialog } from "@/components/WhatsNewDialog";
import { Input } from "@/components/ui/input";
import ShareCustomizationModal from "@/components/ShareCustomizationModal";
import VisitShareModal from "@/components/VisitShareModal";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";

interface VisitWithDetails extends Omit<Visit, "restaurant"> {
  restaurant?: Restaurant;
  foodItems?: FoodItem[];
  expand?: {
    user?: {
      id: string;
      email: string;
      name?: string;
    };
  };
}

interface QuickTrackItemWithDetails extends FoodItem {
  type: "quick_track";
}

interface HomePageProps {
  onEditVisit?: (visitId: string) => void;
  onAddVisit?: () => void;
}

// Helper to get month key (YYYY-MM) in local timezone
function getMonthKey(date: string): string {
  const d = new Date(date); // Parses UTC datetime, converts to local
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Helper to get day key (YYYY-MM-DD) in local timezone
function getDayKey(date: string, isFriendVisit: boolean = false): string {
  // For friend visits, return month key to mask exact date
  if (isFriendVisit) {
    return getMonthKey(date);
  }
  // Convert UTC datetime to local date string
  return utcToLocalDateString(date);
}

// Helper to format month label
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

// Helper to format day label
function formatDayLabel(
  dayKey: string,
  isFriendVisit: boolean = false
): string {
  // For friend visits, dayKey is actually a month key (YYYY-MM)
  if (isFriendVisit) {
    const [year, month] = dayKey.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  }
  const date = new Date(dayKey + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Helper to get date N months ago
function getDateMonthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function HomePage({
  onEditVisit,
  onAddVisit,
}: HomePageProps = {}) {
  const [monthsToLoad, setMonthsToLoad] = useState(1); // Start with 1 month
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    new Set([getMonthKey(new Date().toISOString())])
  ); // Current month expanded by default
  const [visitToDelete, setVisitToDelete] = useState<VisitWithDetails | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [previousSearchQuery, setPreviousSearchQuery] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "user" | "friends">(
    "all"
  );
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "private" | "friends"
  >("all");
  const [ratingFilter, setRatingFilter] = useState<
    "all" | "1" | "2" | "3" | "4" | "5"
  >("all");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharePhotoFile, setSharePhotoFile] = useState<File | null>(null);
  const [sharePhotoUrl, setSharePhotoUrl] = useState<string>("");
  const [shareOverlayData, setShareOverlayData] = useState<{
    restaurantName: string;
    dishName: string;
    rating: number;
    visitDate: string;
  } | null>(null);
  const [visitToShare, setVisitToShare] = useState<VisitWithDetails | null>(
    null
  );
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{
    url: string;
    dishName: string;
  } | null>(null);
  const queryClient = useQueryClient();

  // Helper to check if a visit is from a friend
  const isFriendVisit = (visit: VisitWithDetails): boolean => {
    const currentUserId = pb.authStore.record?.id;
    return visit.user !== currentUserId;
  };

  // Fetch all visits (own + friends' public/friends visits)
  // Backend rules handle the filtering automatically based on visibility
  const { data: visits = [], isLoading: visitsLoading } = useQuery<Visit[]>({
    queryKey: ["allVisits"],
    queryFn: async () => {
      return await pb.collection("visits").getFullList({
        sort: "-visitDate",
        expand: "user", // Expand user to get friend's name/email
      });
    },
  });

  // Count user's own visits vs friends' visits
  const currentUserId = pb.authStore.record?.id;
  const userVisitsCount = visits.filter((v) => v.user === currentUserId).length;
  const friendVisitsCount = visits.filter(
    (v) => v.user !== currentUserId
  ).length;

  // Fetch all restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ["restaurants"],
    queryFn: async () => {
      return await pb.collection("restaurants").getFullList();
    },
  });

  // Fetch all food items
  const { data: foodItems = [] } = useQuery<FoodItem[]>({
    queryKey: ["allFoodItems"],
    queryFn: async () => {
      return await pb.collection("food_items").getFullList({
        sort: "-created",
      });
    },
  });

  // Fetch all visit photos
  const { data: visitPhotos = [] } = useQuery({
    queryKey: ["allVisitPhotos"],
    queryFn: async () => {
      return await pb.collection("visit_photos").getFullList({
        sort: "-created",
      });
    },
  });

  const { isOnline } = useSync();
  const [isDeleting, setIsDeleting] = useState(false);

  // Delete visit with offline support
  const handleDeleteVisit = async (visitId: string) => {
    setIsDeleting(true);
    try {
      if (isOnline) {
        // Online: Execute immediately
        const foodItemsToDelete = foodItems.filter(
          (item) => item.visit === visitId
        );
        await Promise.all(
          foodItemsToDelete.map((item) =>
            pb.collection("food_items").delete(item.id)
          )
        );
        await pb.collection("visits").delete(visitId);
      } else {
        // Offline: Queue the deletion
        // Queue as complex operation to delete food items and visit together
        await syncQueue.enqueue({
          type: "delete",
          collection: "visits_with_items_delete",
          data: {
            visitId,
            foodItemIds: foodItems
              .filter((item) => item.visit === visitId)
              .map((item) => item.id),
          },
          recordId: visitId,
        });

        console.log("Queued visit deletion:", visitId);
      }

      // Invalidate queries (will refetch or show optimistic update)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["allVisits"] }),
        queryClient.invalidateQueries({ queryKey: ["allFoodItems"] }),
        queryClient.invalidateQueries({ queryKey: ["allVisitPhotos"] }),
      ]);

      setVisitToDelete(null);
    } catch (error) {
      console.error("Failed to delete visit:", error);
      alert("Failed to delete visit. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle opening share modal
  const handleSharePhotoClick = async (
    photo: any,
    foodItem: FoodItem,
    restaurant: Restaurant | null,
    visitDate: string
  ) => {
    if (!isOnline) {
      alert(
        "Photo sharing requires internet connection. Please connect and try again."
      );
      return;
    }

    try {
      // Get full resolution photo URL
      const photoUrl = pb.files.getURL(photo, photo.photo);

      // Fetch the photo as a blob
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const file = new File([blob], "dish-photo.jpg", { type: "image/jpeg" });

      setSharePhotoFile(file);
      setSharePhotoUrl(photoUrl);
      setShareOverlayData({
        restaurantName:
          restaurant?.name || foodItem.location_text || "Quick Track",
        dishName: foodItem.name,
        rating: foodItem.rating,
        visitDate: visitDate,
      });
      setIsShareModalOpen(true);
    } catch (error) {
      console.error("Error loading photo:", error);
      alert("Failed to load photo. Please try again.");
    }
  };

  // Handle final share action from modal
  const handleShare = async (shareBlob: Blob) => {
    if (!shareOverlayData) return;

    try {
      // Try Web Share API first (native sharing on mobile)
      if (navigator.share && navigator.canShare) {
        const shareFile = new File([shareBlob], "food-tracker-share.jpg", {
          type: "image/jpeg",
        });

        const canShareFile = navigator.canShare({ files: [shareFile] });

        if (canShareFile) {
          await navigator.share({
            files: [shareFile],
            title: `${shareOverlayData.dishName} at ${shareOverlayData.restaurantName}`,
            text: `Check out this dish I tried! Rated ${shareOverlayData.rating}/5`,
          });
          return;
        }
      }

      // Fallback: Download the image
      const url = URL.createObjectURL(shareBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${shareOverlayData.dishName.replace(/[^a-z0-9]/gi, "_")}_${shareOverlayData.restaurantName.replace(/[^a-z0-9]/gi, "_")}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert("Photo downloaded! Share it on your favorite social media.");
    } catch (error) {
      console.error("Error sharing photo:", error);
      alert("Failed to share photo. Please try again.");
    }
  };

  // Handle share visit button click
  const handleShareVisitClick = (visit: VisitWithDetails) => {
    // Check if visit has any photos
    const photosForVisit = visitPhotos.filter((photo: any) =>
      visit.foodItems?.some((item) => item.id === photo.food_item)
    );

    if (photosForVisit.length === 0) {
      alert("This visit has no photos to share.");
      return;
    }

    setVisitToShare(visit);
  };

  // Separate quick track items (items explicitly marked as quick track)
  const quickTrackItems: QuickTrackItemWithDetails[] = useMemo(
    () =>
      foodItems
        .filter((item) => item.isQuickTrack === true)
        .map((item) => ({ ...item, type: "quick_track" as const })),
    [foodItems]
  );

  // Combine data
  const visitsWithDetails: VisitWithDetails[] = useMemo(
    () =>
      visits.map((visit) => ({
        ...visit,
        restaurant: restaurants.find((r) => r.id === visit.restaurant),
        foodItems: foodItems.filter((item) => item.visit === visit.id),
      })),
    [visits, restaurants, foodItems]
  );

  // Filter visits based on monthsToLoad and search query
  const cutoffDate = useMemo(
    () => getDateMonthsAgo(monthsToLoad),
    [monthsToLoad]
  );
  const filteredVisits = useMemo(() => {
    // If searching, search ALL visits (ignore time filter)
    // Otherwise, filter by time range
    let filtered = searchQuery.trim()
      ? visitsWithDetails
      : visitsWithDetails.filter(
          (visit) => new Date(visit.visitDate) >= cutoffDate
        );

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
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
    if (filterType === "user") {
      filtered = filtered.filter((visit) => !isFriendVisit(visit));
    } else if (filterType === "friends") {
      filtered = filtered.filter((visit) => isFriendVisit(visit));
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
    visitsWithDetails,
    cutoffDate,
    searchQuery,
    filterType,
    visibilityFilter,
    ratingFilter,
  ]);

  // Filter quick track items based on monthsToLoad and search query
  const filteredQuickTrackItems = useMemo(() => {
    // Filter by time range (use created date for quick track items)
    let filtered = searchQuery.trim()
      ? quickTrackItems
      : quickTrackItems.filter((item) => new Date(item.created) >= cutoffDate);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
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

    // Quick track items are always "user" type (only show if filter is "all" or "user")
    if (filterType === "friends") {
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
    searchQuery,
    filterType,
    visibilityFilter,
    ratingFilter,
  ]);

  // Check if there are more visits to load (only when not searching)
  const hasMoreVisits =
    !searchQuery.trim() && visitsWithDetails.length > filteredVisits.length;

  // Group visits and quick track items by month, then by day
  const groupedVisits = useMemo(() => {
    const byMonth: Record<
      string,
      Record<
        string,
        {
          visits: VisitWithDetails[];
          quickTrackItems: QuickTrackItemWithDetails[];
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

    // Add quick track items (use created date)
    filteredQuickTrackItems.forEach((item) => {
      const monthKey = getMonthKey(item.created);
      const dayKey = getDayKey(item.created, false);

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
  }, [filteredVisits, filteredQuickTrackItems]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const loadMoreMonths = () => {
    setMonthsToLoad((prev) => prev + 1);
  };

  // Auto-expand all months when searching
  useEffect(() => {
    if (searchQuery.trim() && searchQuery !== previousSearchQuery) {
      // When user starts searching or changes search, expand all months with results
      const allMonthKeys = groupedVisits.map((g) => g.monthKey);
      setExpandedMonths(new Set(allMonthKeys));
      setPreviousSearchQuery(searchQuery);
    } else if (!searchQuery.trim() && previousSearchQuery) {
      // When search is cleared, collapse to current month only
      setExpandedMonths(new Set([getMonthKey(new Date().toISOString())]));
      setPreviousSearchQuery("");
    }
  }, [searchQuery, groupedVisits, previousSearchQuery]);

  if (visitsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* What's New Dialog */}
      <WhatsNewDialog />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {searchQuery.trim()
              ? `Found ${filteredVisits.length + filteredQuickTrackItems.length} items (${filteredVisits.length} visits, ${filteredQuickTrackItems.length} quick items)`
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
                  if (quickTrackItems.length > 0) {
                    parts.push(
                      `${quickTrackItems.length} quick item${quickTrackItems.length !== 1 ? "s" : ""}`
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
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
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="flex items-center gap-2 px-4 relative"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Filters</span>
              {(() => {
                const activeFiltersCount = [
                  filterType !== "all",
                  visibilityFilter !== "all",
                  ratingFilter !== "all",
                ].filter(Boolean).length;
                return activeFiltersCount > 0 ? (
                  <Badge className="ml-1 h-5 min-w-5 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white">
                    {activeFiltersCount}
                  </Badge>
                ) : null;
              })()}
            </Button>
          </div>

          {/* Filter Selects Row (Collapsible) */}
          <div
            className={`overflow-hidden transition-all duration-200 ease-in-out ${
              filtersExpanded ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="flex gap-2">
              {/* Type Filter */}
              <Select
                value={filterType}
                onValueChange={(value: "all" | "user" | "friends") =>
                  setFilterType(value)
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Visits</SelectItem>
                  <SelectItem value="user">My Visits</SelectItem>
                  <SelectItem value="friends">Friends</SelectItem>
                </SelectContent>
              </Select>

              {/* Visibility Filter */}
              <Select
                value={visibilityFilter}
                onValueChange={(value: "all" | "private" | "friends") =>
                  setVisibilityFilter(value)
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
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
                onValueChange={(value: "all" | "1" | "2" | "3" | "4" | "5") =>
                  setRatingFilter(value)
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  <SelectItem value="5">5 - Excellent</SelectItem>
                  <SelectItem value="4">4 - Good</SelectItem>
                  <SelectItem value="3">3 - Average</SelectItem>
                  <SelectItem value="2">2 - Below Avg</SelectItem>
                  <SelectItem value="1">1 - Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* No visits or quick track items at all */}
        {visits.length === 0 && quickTrackItems.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-8">
            <Utensils className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-center mb-2">No visits to show</p>
            <p className="text-sm text-gray-400 text-center mb-4">
              Start tracking your food experiences
            </p>
            {onAddVisit && (
              <Button onClick={onAddVisit} className="mb-4" size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Add Your First Visit
              </Button>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-2 max-w-sm">
              <div className="flex items-start gap-2">
                <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">
                    See friends' visits
                  </p>
                  <p className="text-blue-700">
                    Connect with friends to see their restaurant visits and
                    recommendations
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No results after filtering/searching */}
        {(visits.length > 0 || quickTrackItems.length > 0) &&
          filteredVisits.length === 0 &&
          filteredQuickTrackItems.length === 0 && (
            <>
              {/* No search results */}
              {searchQuery.trim() && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Search className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 mb-2">No visits found</p>
                    <p className="text-sm text-gray-500">
                      Try searching for a different restaurant, food item, or
                      location
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* No results due to time filter, but more visits exist */}
              {!searchQuery.trim() && hasMoreVisits && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 mb-2">
                      No visits in the last month
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Load older visits to see your history
                    </p>
                    <Button onClick={loadMoreMonths} variant="outline">
                      Load Older Visits
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* No results due to filter selection */}
              {!searchQuery.trim() && !hasMoreVisits && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Users className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 mb-2">
                      {filterType === "user"
                        ? "No visits from you"
                        : "No visits from friends"}
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      {filterType === "user"
                        ? "Try changing the filter to see friends' visits"
                        : "Try changing the filter to see all visits"}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setFilterType("all")}
                    >
                      Show All Visits
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}

        {groupedVisits.map(({ monthKey, monthLabel, days }) => (
          <div key={monthKey} className="space-y-3">
            {/* Month Header */}
            <button
              onClick={() => toggleMonth(monthKey)}
              className="w-full flex items-center justify-between p-3 bg-white rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedMonths.has(monthKey) ? (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                )}
                <h2 className="text-lg font-semibold text-gray-900">
                  {monthLabel}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {(() => {
                  const allMonthVisits = days.flatMap((day) => day.visits);
                  const allMonthQuickTrack = days.flatMap(
                    (day) => day.quickTrackItems
                  );
                  const userVisits = allMonthVisits.filter(
                    (v) => v.user === currentUserId
                  ).length;
                  const friendVisits = allMonthVisits.filter(
                    (v) => v.user !== currentUserId
                  ).length;
                  const userQuickTrack = allMonthQuickTrack.filter(
                    (item) => item.user === currentUserId
                  ).length;
                  const friendQuickTrack = allMonthQuickTrack.filter(
                    (item) => item.user !== currentUserId
                  ).length;
                  const total = userVisits + friendVisits + userQuickTrack + friendQuickTrack;

                  // Friend items = friend visits + friend quick track combined
                  const friendItemsTotal = friendVisits + friendQuickTrack;

                  const parts = [];
                  if (userVisits > 0) parts.push(`${userVisits}v`);
                  if (userQuickTrack > 0) parts.push(`${userQuickTrack}q`);
                  if (friendItemsTotal > 0) parts.push(`${friendItemsTotal}f`);

                  return (
                    <>
                      <span className="font-medium">{total}</span>
                      {parts.length > 0 && (
                        <span className="text-xs">({parts.join(" • ")})</span>
                      )}
                    </>
                  );
                })()}
              </div>
            </button>

            {/* Month Content */}
            {expandedMonths.has(monthKey) && (
              <div className="space-y-4 pl-2">
                {days.map(
                  ({
                    dayKey,
                    dayLabel,
                    visits: dayVisits,
                    quickTrackItems: dayQuickTrackItems,
                    isFriendGroup,
                  }) => (
                    <div key={dayKey} className="space-y-3">
                      {/* Day Header */}
                      <div className="flex items-center gap-2 px-2">
                        {isFriendGroup ? (
                          <Users className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Calendar className="w-4 h-4 text-gray-500" />
                        )}
                        <h3 className="text-sm font-medium text-gray-700">
                          {dayLabel}
                        </h3>
                        {isFriendGroup && (
                          <Badge
                            variant="secondary"
                            className="ml-auto text-xs bg-blue-100 text-blue-700"
                          >
                            Friends
                          </Badge>
                        )}
                      </div>

                      {/* Items for this day (visits + quick track) */}
                      <div className="space-y-3">
                        {/* Visits for this day */}
                        {dayVisits.map((visit) => {
                          const isFriend = isFriendVisit(visit);
                          // Use name if available, otherwise fall back to email username
                          const friendName = isFriend
                            ? visit.expand?.user?.name ||
                              visit.expand?.user?.email?.split("@")[0]
                            : null;

                          return (
                            <Card
                              key={visit.id}
                              className={
                                isFriend
                                  ? "border-blue-200 bg-blue-50/30 gap-0"
                                  : "gap-0"
                              }
                            >
                              <CardHeader>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <CardTitle className="text-lg">
                                        {visit.restaurant?.name}
                                      </CardTitle>
                                      {isFriend && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs border-blue-300 text-blue-700"
                                        >
                                          <Users className="w-3 h-3 mr-1" />
                                          {friendName}
                                        </Badge>
                                      )}
                                      {!isFriend && (
                                        <div
                                          className="flex items-center gap-1"
                                          title={
                                            visit.visibility === "friends"
                                              ? "Shared with friends"
                                              : "Private"
                                          }
                                        >
                                          {visit.visibility === "friends" ? (
                                            <UserCheck className="w-4 h-4 text-green-600" />
                                          ) : (
                                            <Lock className="w-4 h-4 text-gray-400" />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <CardDescription className="flex items-center gap-1 mt-1">
                                      <MapPin className="w-3 h-3" />
                                      {visit.restaurant?.location}
                                      {visit.restaurant?.cuisineType &&
                                        ` • ${visit.restaurant.cuisineType}`}
                                    </CardDescription>
                                  </div>
                                  {!isFriend && (
                                    <div className="flex items-center gap-1">
                                      {/* Share Visit button - only show if visit has 2 or more photos */}
                                      {(() => {
                                        const photosForVisit =
                                          visitPhotos.filter((photo: any) =>
                                            visit.foodItems?.some(
                                              (item) =>
                                                item.id === photo.food_item
                                            )
                                          );
                                        return photosForVisit.length >= 2;
                                      })() && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleShareVisitClick(visit)
                                          }
                                          data-testid={`share-visit-${visit.id}`}
                                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                          title="Share all photos from this visit"
                                        >
                                          <Share2 className="w-4 h-4" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onEditVisit?.(visit.id)}
                                        data-testid={`edit-visit-${visit.id}`}
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setVisitToDelete(visit)}
                                        data-testid={`delete-visit-${visit.id}`}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </CardHeader>
                              <CardContent>
                                {visit.foodItems &&
                                visit.foodItems.length > 0 ? (
                                  <div className="space-y-2">
                                    {visit.foodItems.map((item) => {
                                      // Find photo for this food item
                                      const photo = visitPhotos.find(
                                        (p: any) => p.food_item === item.id
                                      );
                                      // For offline photos (isPending), use the blob URL directly
                                      // For online photos, use PocketBase file URL
                                      const photoUrl = photo
                                        ? photo.isPending
                                          ? photo.photo // Blob URL for offline photos
                                          : pb.files.getURL(
                                              photo,
                                              photo.photo,
                                              { thumb: "100x100" }
                                            )
                                        : null;
                                      const fullPhotoUrl = photo
                                        ? photo.isPending
                                          ? photo.photo // Blob URL for offline photos
                                          : pb.files.getURL(photo, photo.photo)
                                        : null;

                                      return (
                                        <div
                                          key={item.id}
                                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                                        >
                                          {/* Photo thumbnail */}
                                          {photoUrl &&
                                            photo &&
                                            fullPhotoUrl && (
                                              <img
                                                src={photoUrl}
                                                alt={item.name}
                                                className="w-16 h-16 object-cover rounded-md flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() =>
                                                  setFullscreenPhoto({
                                                    url: fullPhotoUrl,
                                                    dishName: item.name,
                                                  })
                                                }
                                              />
                                            )}

                                          <div className="flex-1 min-w-0 pr-2">
                                            <p className="font-medium text-gray-900 break-words">
                                              {item.name}
                                            </p>
                                            {item.description && (
                                              <p className="text-sm text-gray-500 mt-0.5">
                                                {item.description}
                                              </p>
                                            )}
                                            {item.notes && (
                                              <p className="text-xs text-gray-600 mt-1 italic">
                                                "{item.notes}"
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                              <div
                                                className={`w-3 h-3 rounded-full ${
                                                  RATING_COLORS[
                                                    item.rating - 1
                                                  ] || "bg-gray-300"
                                                }`}
                                              />
                                              <span className="text-xs text-gray-600 whitespace-nowrap">
                                                {RATING_LABELS[
                                                  item.rating - 1
                                                ] || "Unknown"}
                                              </span>
                                            </div>
                                            {/* Share button - only show if there's a photo */}
                                            {photo && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleSharePhotoClick(
                                                    photo,
                                                    item,
                                                    visit.restaurant!,
                                                    visit.visitDate
                                                  );
                                                }}
                                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                                                title="Share photo"
                                              >
                                                <Share2 className="w-3 h-3" />
                                                <span>Share</span>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-400 italic">
                                    No items recorded
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}

                        {/* Quick Track Items for this day */}
                        {dayQuickTrackItems.map((item) => {
                          // Find photo for this quick track item
                          const photo = visitPhotos.find(
                            (p: any) => p.food_item === item.id
                          );
                          const photoUrl = photo
                            ? photo.isPending
                              ? photo.photo
                              : pb.files.getURL(photo, photo.photo, {
                                  thumb: "100x100",
                                })
                            : null;
                          const fullPhotoUrl = photo
                            ? photo.isPending
                              ? photo.photo
                              : pb.files.getURL(photo, photo.photo)
                            : null;

                          return (
                            <Card
                              key={item.id}
                              className="border-gray-200 bg-gray-50/50"
                            >
                              <CardContent className="pt-4 pb-4">
                                <div className="flex items-start gap-3">
                                  {/* Photo thumbnail */}
                                  {photoUrl && photo && fullPhotoUrl && (
                                    <img
                                      src={photoUrl}
                                      alt={item.name}
                                      className="w-16 h-16 object-cover rounded-md flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() =>
                                        setFullscreenPhoto({
                                          url: fullPhotoUrl,
                                          dishName: item.name,
                                        })
                                      }
                                    />
                                  )}

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-gray-900 break-words">
                                        {item.name}
                                      </p>
                                      {/* Visibility indicator */}
                                      <div
                                        className="flex items-center gap-1"
                                        title={
                                          item.visibility === "friends"
                                            ? "Shared with friends"
                                            : "Private"
                                        }
                                      >
                                        {item.visibility === "friends" ? (
                                          <UserCheck className="w-4 h-4 text-green-600" />
                                        ) : (
                                          <Lock className="w-4 h-4 text-gray-400" />
                                        )}
                                      </div>
                                    </div>
                                    {/* Category badge */}
                                    {item.itemCategory && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs mt-1"
                                      >
                                        {item.itemCategory.replace(/_/g, " ")}
                                      </Badge>
                                    )}
                                    {/* Location text */}
                                    {item.location_text && (
                                      <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {item.location_text}
                                      </p>
                                    )}
                                    {/* Notes */}
                                    {item.notes && (
                                      <p className="text-xs text-gray-600 mt-1 italic">
                                        "{item.notes}"
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-3 h-3 rounded-full ${
                                          RATING_COLORS[item.rating - 1] ||
                                          "bg-gray-300"
                                        }`}
                                      />
                                      <span className="text-xs text-gray-600 whitespace-nowrap">
                                        {RATING_LABELS[item.rating - 1] ||
                                          "Unknown"}
                                      </span>
                                    </div>
                                    {/* Share button - only show if there's a photo */}
                                    {photo && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSharePhotoClick(
                                            photo,
                                            item,
                                            null, // No restaurant for quick track
                                            item.created
                                          );
                                        }}
                                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                                        title="Share photo"
                                      >
                                        <Share2 className="w-3 h-3" />
                                        <span>Share</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        {/* Load More Button */}
        {hasMoreVisits && (
          <div className="pt-2 pb-4">
            <Button
              onClick={loadMoreMonths}
              variant="outline"
              className="w-full"
            >
              Load Older Visits
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!visitToDelete}
        onOpenChange={(open) => !open && setVisitToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Visit?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete this visit? This action cannot
                  be undone.
                </p>
                {visitToDelete && (
                  <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {visitToDelete.restaurant?.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        {visitToDelete.restaurant?.location}
                        {visitToDelete.restaurant?.cuisineType &&
                          ` • ${visitToDelete.restaurant.cuisineType}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(visitToDelete.visitDate).toLocaleDateString(
                          "en-US",
                          {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }
                        )}
                      </p>
                    </div>
                    {visitToDelete.foodItems &&
                      visitToDelete.foodItems.length > 0 && (
                        <div className="border-t border-gray-200 pt-2">
                          <p className="text-sm font-medium text-gray-700 mb-1">
                            This will also delete{" "}
                            {visitToDelete.foodItems.length} food item
                            {visitToDelete.foodItems.length !== 1 ? "s" : ""}:
                          </p>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {visitToDelete.foodItems.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center gap-2"
                              >
                                <span className="text-gray-400">•</span>
                                <span>{item.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                visitToDelete && handleDeleteVisit(visitToDelete.id)
              }
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Customization Modal */}
      {shareOverlayData && (
        <ShareCustomizationModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          photoUrl={sharePhotoUrl}
          photoFile={sharePhotoFile}
          overlayData={shareOverlayData}
          onShare={handleShare}
        />
      )}

      {/* Visit Share Modal */}
      {visitToShare && visitToShare.restaurant && (
        <VisitShareModal
          isOpen={!!visitToShare}
          onClose={() => setVisitToShare(null)}
          restaurantName={visitToShare.restaurant.name}
          visitDate={visitToShare.visitDate}
          photosWithFoodItems={visitPhotos
            .filter((photo: any) =>
              visitToShare.foodItems?.some(
                (item) => item.id === photo.food_item
              )
            )
            .map((photo: any) => {
              const foodItem = visitToShare.foodItems?.find(
                (item) => item.id === photo.food_item
              );
              return {
                photo,
                foodItem: {
                  id: foodItem!.id,
                  name: foodItem!.name,
                  rating: foodItem!.rating,
                },
              };
            })}
          pb={pb}
        />
      )}

      {/* Fullscreen Photo Viewer */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            onClick={() => setFullscreenPhoto(null)}
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors z-10"
            aria-label="Close fullscreen view"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-4 left-4 text-white bg-black/50 px-3 py-2 rounded-lg">
            <p className="font-medium">{fullscreenPhoto.dishName}</p>
          </div>
          <img
            src={fullscreenPhoto.url}
            alt={fullscreenPhoto.dishName}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
