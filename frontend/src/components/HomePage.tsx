import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, Visit, Restaurant, FoodItem } from "@/lib/pocketbase";
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
} from "lucide-react";
import { WhatsNewDialog } from "@/components/WhatsNewDialog";
import { Input } from "@/components/ui/input";
import { generateSocialShareImage } from "@/services/photoService";

const RATING_LABELS = [
  "Don't eat ever",
  "Try once",
  "Eat once in a while",
  "Eat occasionally",
  "Eat often",
];

const RATING_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
];

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
  const [sharingPhotoId, setSharingPhotoId] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<'modern' | 'rustic'>('modern');
  const [searchQuery, setSearchQuery] = useState("");
  const [previousSearchQuery, setPreviousSearchQuery] = useState("");
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

  // Delete visit mutation
  const deleteVisitMutation = useMutation({
    mutationFn: async (visitId: string) => {
      // First delete all food items associated with this visit
      const foodItemsToDelete = foodItems.filter(
        (item) => item.visit === visitId
      );
      await Promise.all(
        foodItemsToDelete.map((item) =>
          pb.collection("food_items").delete(item.id)
        )
      );
      // Then delete the visit
      await pb.collection("visits").delete(visitId);
    },
    onSuccess: () => {
      // Invalidate and refetch queries
      queryClient.invalidateQueries({ queryKey: ["allVisits"] });
      queryClient.invalidateQueries({ queryKey: ["allFoodItems"] });
      queryClient.invalidateQueries({ queryKey: ["allVisitPhotos"] });
      setVisitToDelete(null);
    },
  });

  // Handle photo sharing
  const handleSharePhoto = async (
    photo: any,
    foodItem: FoodItem,
    restaurant: Restaurant,
    visitDate: string
  ) => {
    setSharingPhotoId(photo.id);

    try {
      // Get full resolution photo URL
      const photoUrl = pb.getFileUrl(photo, photo.photo);

      // Fetch the photo as a blob
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const file = new File([blob], "dish-photo.jpg", { type: "image/jpeg" });

      // Generate social share image with badge overlay
      const shareBlob = await generateSocialShareImage(file, {
        restaurantName: restaurant.name,
        dishName: foodItem.name,
        rating: foodItem.rating,
        visitDate: visitDate,
      }, selectedTheme);

      // Try Web Share API first (native sharing on mobile)
      if (navigator.share && navigator.canShare) {
        const shareFile = new File([shareBlob], "food-tracker-share.jpg", {
          type: "image/jpeg",
        });

        const canShareFile = navigator.canShare({ files: [shareFile] });

        if (canShareFile) {
          await navigator.share({
            files: [shareFile],
            title: `${foodItem.name} at ${restaurant.name}`,
            text: `Check out this dish I tried! Rated ${foodItem.rating}/5`,
          });
          setSharingPhotoId(null);
          return;
        }
      }

      // Fallback: Download the image
      const url = URL.createObjectURL(shareBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${foodItem.name.replace(/[^a-z0-9]/gi, "_")}_${restaurant.name.replace(/[^a-z0-9]/gi, "_")}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert("Photo downloaded! Share it on your favorite social media.");
    } catch (error) {
      console.error("Error sharing photo:", error);
      alert("Failed to share photo. Please try again.");
    } finally {
      setSharingPhotoId(null);
    }
  };

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

    return filtered;
  }, [visitsWithDetails, cutoffDate, searchQuery]);

  // Check if there are more visits to load (only when not searching)
  const hasMoreVisits =
    !searchQuery.trim() && visitsWithDetails.length > filteredVisits.length;

  // Group visits by month, then by day (or month for friend visits)
  const groupedVisits = useMemo(() => {
    const byMonth: Record<string, Record<string, VisitWithDetails[]>> = {};

    filteredVisits.forEach((visit) => {
      const monthKey = getMonthKey(visit.visitDate);
      const isFriend = isFriendVisit(visit);
      const dayKey = getDayKey(visit.visitDate, isFriend);

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {};
      }
      if (!byMonth[monthKey][dayKey]) {
        byMonth[monthKey][dayKey] = [];
      }
      byMonth[monthKey][dayKey].push(visit);
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
          const visitsInDay = byMonth[monthKey][dayKey];
          // Check if this is a friend visit group (all visits in this group should be same type)
          const isFriend =
            visitsInDay.length > 0 && isFriendVisit(visitsInDay[0]);
          return {
            dayKey,
            dayLabel: formatDayLabel(dayKey, isFriend),
            visits: visitsInDay,
            isFriendGroup: isFriend,
          };
        }),
    }));
  }, [filteredVisits]);

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

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
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
    );
  }

  if (filteredVisits.length === 0 && hasMoreVisits) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Visits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {userVisitsCount} visit{userVisitsCount !== 1 ? "s" : ""}
            {friendVisitsCount > 0 &&
              ` • ${friendVisitsCount} friend visit${friendVisitsCount !== 1 ? "s" : ""}'`}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-gray-500 text-center mb-4">
            No visits in the last month
          </p>
          <Button onClick={loadMoreMonths} variant="outline">
            Load Older Visits
          </Button>
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
              ? `Found ${filteredVisits.length} of ${visits.length} total`
              : userVisitsCount > 0 && friendVisitsCount > 0
                ? `${userVisitsCount} visit${userVisitsCount !== 1 ? "s" : ""} • ${friendVisitsCount} friend visit${friendVisitsCount !== 1 ? "s" : ""}`
                : userVisitsCount > 0
                  ? `${userVisitsCount} your visit${userVisitsCount !== 1 ? "s" : ""}`
                  : `${friendVisitsCount} friend${friendVisitsCount !== 1 ? "s" : ""}'`}
          </p>
        </div>

        {/* Search Input */}
        <div className="relative">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* No search results */}
        {searchQuery.trim() && filteredVisits.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center">
              <Search className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 mb-2">No visits found</p>
              <p className="text-sm text-gray-500">
                Try searching for a different restaurant, food item, or location
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
              <span className="text-sm text-gray-500">
                {(() => {
                  const allMonthVisits = days.flatMap((day) => day.visits);
                  const userVisits = allMonthVisits.filter(
                    (v) => v.user === currentUserId
                  ).length;
                  const friendVisits = allMonthVisits.filter(
                    (v) => v.user !== currentUserId
                  ).length;

                  if (userVisits > 0 && friendVisits > 0) {
                    return `${userVisits} visit${userVisits !== 1 ? "s" : ""} • ${friendVisits} friend visit${friendVisits !== 1 ? "s" : ""}`;
                  } else if (userVisits > 0) {
                    return `${userVisits} visit${userVisits !== 1 ? "s" : ""}`;
                  } else {
                    return `${friendVisits} friend visit${friendVisits !== 1 ? "s" : ""}`;
                  }
                })()}
              </span>
            </button>

            {/* Month Content */}
            {expandedMonths.has(monthKey) && (
              <div className="space-y-4 pl-2">
                {days.map(
                  ({ dayKey, dayLabel, visits: dayVisits, isFriendGroup }) => (
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

                      {/* Visits for this day */}
                      <div className="space-y-3">
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
                                      const photoUrl = photo
                                        ? pb.getFileUrl(photo, photo.photo, {
                                            thumb: "100x100",
                                          })
                                        : null;

                                      return (
                                        <div
                                          key={item.id}
                                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                                        >
                                          {/* Photo thumbnail */}
                                          {photoUrl && photo && (
                                            <img
                                              src={photoUrl}
                                              alt={item.name}
                                              className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                                            />
                                          )}

                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900">
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
                                                  RATING_COLORS[item.rating - 1] ||
                                                  "bg-gray-300"
                                                }`}
                                              />
                                              <span className="text-xs text-gray-600 whitespace-nowrap">
                                                {RATING_LABELS[item.rating - 1] ||
                                                  "Unknown"}
                                              </span>
                                            </div>
                                            {/* Share button with theme selector - only show if there's a photo */}
                                            {photo && (
                                              <div className="flex flex-col items-end gap-1">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSharePhoto(
                                                      photo,
                                                      item,
                                                      visit.restaurant!,
                                                      visit.visitDate
                                                    );
                                                  }}
                                                  disabled={sharingPhotoId === photo.id}
                                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                                                  title="Share photo"
                                                >
                                                  {sharingPhotoId === photo.id ? (
                                                    <>
                                                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent" />
                                                      <span>Sharing...</span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Share2 className="w-3 h-3" />
                                                      <span>Share</span>
                                                    </>
                                                  )}
                                                </button>
                                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedTheme('modern');
                                                    }}
                                                    className={`px-1.5 py-0.5 rounded ${
                                                      selectedTheme === 'modern'
                                                        ? 'bg-gray-800 text-white'
                                                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                    }`}
                                                  >
                                                    Modern
                                                  </button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedTheme('rustic');
                                                    }}
                                                    className={`px-1.5 py-0.5 rounded ${
                                                      selectedTheme === 'rustic'
                                                        ? 'bg-amber-700 text-white'
                                                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                    }`}
                                                  >
                                                    Rustic
                                                  </button>
                                                </div>
                                              </div>
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
            <AlertDialogCancel disabled={deleteVisitMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                visitToDelete && deleteVisitMutation.mutate(visitToDelete.id)
              }
              disabled={deleteVisitMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteVisitMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
