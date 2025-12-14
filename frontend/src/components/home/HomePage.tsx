import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { pb, Restaurant, Visit, FoodItem } from "@/lib/pocketbase";
import { syncQueue } from "@/lib/syncQueue";
import { useSync } from "@/contexts/SyncContext";
import { useVisits } from "@/hooks/api/useVisits";
import { useFoodItems } from "@/hooks/api/useFoodItems";
import { useVisitFilters } from "@/hooks/visits/useVisitFilters";
import { useVisitGrouping } from "@/hooks/visits/useVisitGrouping";
import { usePhotoSharing } from "@/hooks/visits/usePhotoSharing";
import { getDateMonthsAgo } from "@/lib/dateUtils";
import { useOfflineQuickTrackDelete } from "@/hooks/offline/useOfflineQuickTrackDelete";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { isOfflineError, handleOfflineSuccess, OFFLINE_MESSAGES } from "@/lib/offlineHelpers";
import VisitCard from "@/components/home/VisitCard";
import QuickTrackCard from "@/components/home/QuickTrackCard";
import VisitListHeader from "@/components/home/VisitListHeader";
import { COLLECTIONS } from '@/constants/collections';
import {
  Card,
  CardContent,
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
  ChevronDown,
  ChevronRight,
  Users,
  Plus,
  Search,
  X,
} from "lucide-react";
import { WhatsNewDialog } from "@/components/shared/WhatsNewDialog";
import ShareCustomizationModal from "@/components/shared/ShareCustomizationModal";
import VisitShareModal from "@/components/visits/shared/VisitShareModal";

interface VisitPhoto {
  id: string;
  visit: string;
  food_item: string;
  user: string;
  photo: string;
  created: string;
  updated: string;
  isPending?: boolean;
}

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

export default function HomePage({
  onEditVisit,
  onAddVisit,
}: HomePageProps = {}) {
  const navigate = useNavigate();
  const { handleError, showSuccess } = useErrorHandler({
    source: 'HomePage',
    autoClearMs: 5000,
  });
  const [monthsToLoad, setMonthsToLoad] = useState(1); // Start with 1 month
  const [visitToDelete, setVisitToDelete] = useState<VisitWithDetails | null>(
    null
  );
  const [quickTrackItemToDelete, setQuickTrackItemToDelete] =
    useState<QuickTrackItemWithDetails | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{
    url: string;
    dishName: string;
  } | null>(null);
  const queryClient = useQueryClient();

  // Helper to check if a visit is from a friend
  const isFriendVisit = useCallback((visit: VisitWithDetails): boolean => {
    const currentUserId = pb.authStore.record?.id;
    return visit.user !== currentUserId;
  }, [pb.authStore.record?.id]);

  // Fetch all visits (own + friends' public/friends visits)
  // Backend rules handle the filtering automatically based on visibility
  const { data: visits = [], isLoading: visitsLoading } = useVisits({
    expand: "user",
    sort: "-visitDate",
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
      return await pb.collection(COLLECTIONS.RESTAURANTS).getFullList();
    },
  });

  // Fetch all food items
  const { data: foodItems = [] } = useFoodItems();

  // O(1) lookup maps for performance (prevents O(n²) complexity)
  const restaurantMap = useMemo(
    () => new Map(restaurants.map((r) => [r.id, r])),
    [restaurants]
  );

  const foodItemsByVisit = useMemo(() => {
    const map = new Map<string, FoodItem[]>();
    for (const item of foodItems) {
      if (!item.visit) continue; // Skip items without visit
      if (!map.has(item.visit)) {
        map.set(item.visit, []);
      }
      map.get(item.visit)!.push(item);
    }
    return map;
  }, [foodItems]);

  // Fetch all visit photos
  const { data: visitPhotos = [] } = useQuery<VisitPhoto[]>({
    queryKey: ["allVisitPhotos"],
    queryFn: async () => {
      return await pb.collection(COLLECTIONS.VISIT_PHOTOS).getFullList({
        sort: "-created",
      });
    },
  });

  const { isOnline } = useSync();
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteQuickTrackMutation = useOfflineQuickTrackDelete();

  // Use photo sharing hook
  const sharing = usePhotoSharing({
    visitPhotos,
    isOnline,
  });

  const {
    isShareModalOpen,
    sharePhotoFile,
    sharePhotoUrl,
    shareOverlayData,
    handleSharePhotoClick,
    handleShare,
    closeShareModal,
    visitToShare,
    handleShareVisitClick,
    closeVisitShareModal,
  } = sharing;

  // Delete visit with offline support
  const handleDeleteVisit = useCallback(async (visitId: string) => {
    setIsDeleting(true);
    try {
      if (isOnline) {
        // Online: Execute immediately
        const foodItemsToDelete = foodItems.filter(
          (item) => item.visit === visitId
        );
        await Promise.all(
          foodItemsToDelete.map((item) =>
            pb.collection(COLLECTIONS.FOOD_ITEMS).delete(item.id)
          )
        );
        await pb.collection(COLLECTIONS.VISITS).delete(visitId);
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
      handleError(error as Error, { customMessage: "Failed to delete visit. Please try again." });
    } finally {
      setIsDeleting(false);
    }
  }, [isOnline, foodItems, queryClient]);

  // Delete quick track item with offline support
  const handleDeleteQuickTrackItem = useCallback(async (
    itemId: string,
    photoId?: string
  ) => {
    setIsDeleting(true);
    try {
      await deleteQuickTrackMutation.mutateAsync({
        id: itemId,
        photoId,
      });

      setQuickTrackItemToDelete(null);
    } catch (error) {
      console.error("Failed to delete quick track item:", error);

      // Show helpful message if offline
      if (!isOnline && isOfflineError(error)) {
        handleOfflineSuccess(OFFLINE_MESSAGES.DELETION_QUEUED, showSuccess);
        setQuickTrackItemToDelete(null);
      } else {
        handleError(error, { customMessage: "Failed to delete item. Please try again." });
      }
    } finally {
      setIsDeleting(false);
    }
  }, [deleteQuickTrackMutation, isOnline]);

  // Separate quick track items (items explicitly marked as quick track)
  const quickTrackItems: QuickTrackItemWithDetails[] = useMemo(
    () =>
      foodItems
        .filter((item) => item.isQuickTrack === true)
        .map((item) => ({ ...item, type: "quick_track" as const })),
    [foodItems]
  );

  // Combine data (using Maps for O(1) lookups instead of O(n²) find/filter)
  const visitsWithDetails: VisitWithDetails[] = useMemo(
    () =>
      visits.map((visit) => ({
        ...visit,
        restaurant: restaurantMap.get(visit.restaurant),
        foodItems: foodItemsByVisit.get(visit.id) || [],
      })),
    [visits, restaurantMap, foodItemsByVisit]
  );

  // Calculate cutoff date for filtering
  const cutoffDate = useMemo(
    () => getDateMonthsAgo(monthsToLoad),
    [monthsToLoad]
  );

  // Use visit filters hook
  const filters = useVisitFilters({
    visits: visitsWithDetails,
    quickTrackItems,
    cutoffDate,
    currentUserId: currentUserId || "",
    isFriendVisit,
  });

  // Destructure filter values for convenience
  const {
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
    filteredVisits,
    filteredQuickTrackItems,
    hasMoreVisits,
    activeFiltersCount,
  } = filters;

  // Use visit grouping hook
  const grouping = useVisitGrouping({
    filteredVisits,
    filteredQuickTrackItems,
    deferredSearchQuery,
    currentUserId: currentUserId || "",
    isFriendVisit,
  });

  // Destructure grouping values for convenience
  const {
    renderedGroupedVisits,
    expandedMonths,
    toggleMonth,
    hasMoreMonthsToRender,
    loadMoreRenderedMonths,
  } = grouping;

  // Load more months callback
  const loadMoreMonths = useCallback(() => {
    setMonthsToLoad((prev) => prev + 1);
  }, []);

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
      <VisitListHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        visibilityFilter={visibilityFilter}
        onVisibilityFilterChange={setVisibilityFilter}
        ratingFilter={ratingFilter}
        onRatingFilterChange={setRatingFilter}
        filtersExpanded={filtersExpanded}
        onFiltersExpandedChange={setFiltersExpanded}
        activeFiltersCount={activeFiltersCount}
        userVisitsCount={userVisitsCount}
        friendVisitsCount={friendVisitsCount}
        quickTrackCount={quickTrackItems.length}
        filteredVisitsCount={filteredVisits.length}
        filteredQuickTrackCount={filteredQuickTrackItems.length}
        isSearching={!!deferredSearchQuery.trim()}
      />

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
              {deferredSearchQuery.trim() && (
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
              {!deferredSearchQuery.trim() && hasMoreVisits && (
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
              {!deferredSearchQuery.trim() && !hasMoreVisits && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Users className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 mb-2">
                      {filterType === "friends"
                        ? "No visits from friends"
                        : filterType === "user_visits"
                          ? "No visits from you"
                          : filterType === "user_quick_track"
                            ? "No quick track items from you"
                            : "No items from you"}
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Try changing the filter to see all items
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setFilterType("all")}
                    >
                      Show All
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}

        {renderedGroupedVisits.map(({ monthKey, monthLabel, days }) => (
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
                  const total =
                    userVisits +
                    friendVisits +
                    userQuickTrack +
                    friendQuickTrack;

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
                          const friendName = isFriend
                            ? visit.expand?.user?.name ||
                              visit.expand?.user?.email?.split("@")[0]
                            : null;

                          return (
                            <VisitCard
                              key={visit.id}
                              visit={visit}
                              isFriend={isFriend}
                              friendName={friendName}
                              visitPhotos={visitPhotos}
                              onEdit={onEditVisit}
                              onDelete={setVisitToDelete}
                              onSharePhoto={handleSharePhotoClick}
                              onShareVisit={handleShareVisitClick}
                              onPhotoClick={setFullscreenPhoto}
                            />
                          );
                        })}

                        {/* Quick Track Items for this day */}
                        {dayQuickTrackItems.map((item) => {
                          const photo = visitPhotos.find(
                            (p) => p.food_item === item.id
                          );

                          return (
                            <QuickTrackCard
                              key={item.id}
                              item={item}
                              photo={photo}
                              onEdit={(itemId) => navigate({ to: `/edit-quick-track/${itemId}` })}
                              onDelete={(foodItem) => setQuickTrackItemToDelete({ ...foodItem, type: "quick_track" as const })}
                              onSharePhoto={(photo, foodItem) => handleSharePhotoClick(photo, foodItem, null as unknown as Restaurant, foodItem.itemDate || foodItem.created)}
                              onPhotoClick={setFullscreenPhoto}
                            />
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

        {/* Load More Rendered Months Button */}
        {hasMoreMonthsToRender && (
          <div className="pt-2 pb-4">
            <Button
              onClick={loadMoreRenderedMonths}
              variant="outline"
              className="w-full"
            >
              Load More Months ({grouping.groupedVisits.length - grouping.renderedMonthsLimit} remaining)
            </Button>
          </div>
        )}

        {/* Load More Data Button (older visits not yet loaded) */}
        {hasMoreVisits && !hasMoreMonthsToRender && (
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

      {/* Delete Quick Track Item Confirmation Dialog */}
      <AlertDialog
        open={!!quickTrackItemToDelete}
        onOpenChange={(open) => !open && setQuickTrackItemToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quick Track Item?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete this item? This action cannot
                  be undone.
                </p>
                {quickTrackItemToDelete && (
                  <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {quickTrackItemToDelete.name}
                      </p>
                      {quickTrackItemToDelete.itemCategory && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {quickTrackItemToDelete.itemCategory.replace(
                            /_/g,
                            " "
                          )}
                        </Badge>
                      )}
                      {quickTrackItemToDelete.location_text && (
                        <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {quickTrackItemToDelete.location_text}
                        </p>
                      )}
                      {quickTrackItemToDelete.notes && (
                        <p className="text-xs text-gray-600 mt-1 italic">
                          "{quickTrackItemToDelete.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (quickTrackItemToDelete) {
                  const photo = visitPhotos.find(
                    (p) => p.food_item === quickTrackItemToDelete.id
                  );
                  handleDeleteQuickTrackItem(
                    quickTrackItemToDelete.id,
                    photo?.id
                  );
                }
              }}
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
          onClose={closeShareModal}
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
          onClose={closeVisitShareModal}
          restaurantName={visitToShare.restaurant.name}
          visitDate={visitToShare.visitDate}
          photosWithFoodItems={visitPhotos
            .filter((photo) =>
              visitToShare.foodItems?.some(
                (item) => item.id === photo.food_item
              )
            )
            .map((photo) => {
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
