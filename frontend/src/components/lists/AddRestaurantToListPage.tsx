import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, Restaurant, FoodItem, Visit } from "@/lib/pocketbase";
import { repositories } from "@/repositories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Plus, Calendar, Utensils, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface RestaurantWithStats extends Restaurant {
  itemCount: number;
  visitDates: string[]; // All visit dates, sorted newest first
  foodItemIds: string[]; // All food item IDs for this restaurant
}

interface FoodItemWithVisit extends FoodItem {
  expand?: {
    visit?: Visit;
  };
}

interface AddRestaurantToListPageProps {
  listId: string;
  onNavigateBack: () => void;
  onSuccess: () => void;
}

export default function AddRestaurantToListPage({
  listId,
  onNavigateBack,
  onSuccess,
}: AddRestaurantToListPageProps) {
  const queryClient = useQueryClient();
  const user = pb.authStore.record;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedFoodItems, setSelectedFoodItems] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const { error, handleError, clearError } = useErrorHandler({
    source: "AddRestaurantToListPage",
    defaultSeverity: "error",
  });

  // Fetch existing list items to check for already-added restaurants and food items
  const { data: existingListItems = [] } = useQuery({
    queryKey: ["list_items", listId],
    queryFn: async () => {
      return await repositories.listItems.getByList(listId);
    },
    enabled: !!listId,
  });

  // Create a Set of restaurant IDs already in the list for quick lookup
  const existingRestaurantIds = useMemo(() => {
    return new Set(existingListItems.map((item) => item.restaurant));
  }, [existingListItems]);

  // Create a Set of all food item IDs already recommended in this list
  const existingRecommendedItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const listItem of existingListItems) {
      if (listItem.recommendedItems && Array.isArray(listItem.recommendedItems)) {
        for (const itemId of listItem.recommendedItems) {
          ids.add(itemId);
        }
      }
    }
    return ids;
  }, [existingListItems]);

  // Fetch restaurants the user has visited with stats (item count, all visit dates)
  const { data: visitedRestaurants = [], isLoading: loadingRestaurants } = useQuery<
    RestaurantWithStats[]
  >({
    queryKey: ["visited_restaurants_with_stats", user?.id],
    queryFn: async () => {
      // Get all food items for this user with visit info
      const foodItems = await repositories.foodItems.getFullList({
        filter: `user = "${user?.id}"`,
        expand: "visit.restaurant",
      });

      // Build restaurant stats with all visit dates and food item IDs
      const restaurantStats = new Map<string, {
        restaurant: Restaurant;
        itemCount: number;
        visitDates: Set<string>;
        foodItemIds: Set<string>;
      }>();

      for (const item of foodItems) {
        const visit = item.expand?.visit;
        if (visit?.expand?.restaurant) {
          const restaurant = visit.expand.restaurant as Restaurant;
          const visitDateKey = new Date(visit.visitDate).toISOString().split("T")[0];
          const existing = restaurantStats.get(restaurant.id);

          if (existing) {
            existing.itemCount++;
            existing.visitDates.add(visitDateKey);
            existing.foodItemIds.add(item.id);
          } else {
            restaurantStats.set(restaurant.id, {
              restaurant,
              itemCount: 1,
              visitDates: new Set([visitDateKey]),
              foodItemIds: new Set([item.id]),
            });
          }
        }
      }

      // Convert to array and sort by most recent visit date (newest first)
      return Array.from(restaurantStats.values())
        .map(({ restaurant, itemCount, visitDates, foodItemIds }) => {
          const sortedDates = Array.from(visitDates).sort((a, b) =>
            new Date(b).getTime() - new Date(a).getTime()
          );
          return {
            ...restaurant,
            itemCount,
            visitDates: sortedDates,
            foodItemIds: Array.from(foodItemIds),
          };
        })
        .sort((a, b) => new Date(b.visitDates[0]).getTime() - new Date(a.visitDates[0]).getTime());
    },
    enabled: !!user,
  });

  // Fetch food items for selected restaurant with visit info
  const { data: restaurantFoodItems = [] } = useQuery<FoodItemWithVisit[]>({
    queryKey: ["restaurant_food_items", selectedRestaurant?.id, user?.id],
    queryFn: async () => {
      if (!selectedRestaurant) return [];

      // Get all visits for this restaurant by this user
      const visits = await repositories.visits.getFullList({
        filter: `restaurant = "${selectedRestaurant.id}" && user = "${user?.id}"`,
      });

      if (visits.length === 0) return [];

      // Get all food items from these visits with visit expanded
      const visitIds = visits.map((v) => v.id);
      const filter = visitIds.map((id) => `visit = "${id}"`).join(" || ");

      return await repositories.foodItems.getFullList({
        filter: `user = "${user?.id}" && (${filter})`,
        expand: "visit",
        sort: "-created",
      });
    },
    enabled: !!selectedRestaurant && !!user,
  });

  // Group food items by visit date (newest first)
  const groupedFoodItems = useMemo(() => {
    if (restaurantFoodItems.length === 0) return [];

    // Group by visit date
    const groups = new Map<string, { visitDate: string; items: FoodItemWithVisit[] }>();

    for (const item of restaurantFoodItems) {
      const visitDate = item.expand?.visit?.visitDate || item.created;
      const dateKey = new Date(visitDate).toISOString().split("T")[0];

      if (groups.has(dateKey)) {
        groups.get(dateKey)!.items.push(item);
      } else {
        groups.set(dateKey, { visitDate, items: [item] });
      }
    }

    // Sort groups by date (newest first) and items within groups by rating
    return Array.from(groups.values())
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => b.rating - a.rating),
      }));
  }, [restaurantFoodItems]);

  // Filter restaurants by search query
  const filteredRestaurants = visitedRestaurants.filter((restaurant) =>
    restaurant.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add or update restaurant mutation
  const addRestaurantMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRestaurant) throw new Error("No restaurant selected");

      // Check if this restaurant is already in the list
      const existingListItem = existingListItems.find(
        (item) => item.restaurant === selectedRestaurant.id
      );

      if (existingListItem) {
        // Update existing list item - merge recommended items
        const existingRecommended = existingListItem.recommendedItems || [];
        const mergedRecommendedItems = [
          ...new Set([...existingRecommended, ...selectedFoodItems]),
        ];

        return await repositories.listItems.update(existingListItem.id, {
          recommendedItems: mergedRecommendedItems.length > 0 ? mergedRecommendedItems : undefined,
          // Only update note if a new one was provided
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else {
        // Create new list item
        const allItems = await repositories.listItems.getByList(listId, {
          sort: "-position",
        });

        const nextPosition = allItems.length > 0 ? allItems[0].position + 1 : 1;

        return await repositories.listItems.create({
          list: listId,
          restaurant: selectedRestaurant.id,
          addedBy: user?.id,
          position: nextPosition,
          note: note.trim() || undefined,
          recommendedItems: selectedFoodItems.length > 0 ? selectedFoodItems : undefined,
        });
      }
    },
    onSuccess: () => {
      // Invalidate queries so they refetch with fresh data
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_list", listId] });
      onSuccess();
    },
    onError: (err: unknown) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.CREATE_FAILED("list item") });
    },
  });

  const handleSelectRestaurant = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setSelectedFoodItems([]);
    clearError();
  };

  const handleBackToSearch = () => {
    setSelectedRestaurant(null);
    setSelectedFoodItems([]);
    setNote("");
    clearError();
  };

  const handleToggleFoodItem = (foodItemId: string) => {
    setSelectedFoodItems((prev) =>
      prev.includes(foodItemId)
        ? prev.filter((id) => id !== foodItemId)
        : [...prev, foodItemId]
    );
  };

  const handleSubmit = () => {
    addRestaurantMutation.mutate();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectedRestaurant ? handleBackToSearch : onNavigateBack}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {selectedRestaurant
                ? `Add ${selectedRestaurant.name}`
                : "Add Restaurant to List"}
            </h1>
            <p className="text-sm text-gray-500">
              {selectedRestaurant
                ? "Select menu items you recommend and add a note"
                : "Search for a restaurant you've visited"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Message */}
        <ErrorDisplay error={error} onClear={clearError} />

        {!selectedRestaurant ? (
          // Step 1: Search and select restaurant
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search restaurants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
                data-testid="restaurant-search-input"
              />
            </div>

            {loadingRestaurants ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-gray-500">Loading restaurants...</p>
              </div>
            ) : filteredRestaurants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-gray-500">
                  {searchQuery
                    ? "No matching restaurants found"
                    : "No visited restaurants yet"}
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Visit a restaurant and rate some items first
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRestaurants.map((restaurant) => {
                  const isAlreadyAdded = existingRestaurantIds.has(restaurant.id);
                  // Check if all food items from this restaurant are already recommended
                  const allItemsRecommended = restaurant.foodItemIds.length > 0 &&
                    restaurant.foodItemIds.every((id) => existingRecommendedItemIds.has(id));
                  // Only disable if ALL items are already recommended
                  const isDisabled = allItemsRecommended;
                  // Count how many items are still available to add
                  const availableItemsCount = restaurant.foodItemIds.filter(
                    (id) => !existingRecommendedItemIds.has(id)
                  ).length;

                  return (
                    <Card
                      key={restaurant.id}
                      className={`transition-shadow ${
                        isDisabled
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:shadow-md"
                      }`}
                      onClick={() => !isDisabled && handleSelectRestaurant(restaurant)}
                      data-testid={`restaurant-option-${restaurant.id}`}
                    >
                      <CardHeader className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <CardTitle className={`text-base ${isDisabled ? "text-gray-500" : ""}`}>
                              {restaurant.name}
                            </CardTitle>
                            <CardDescription className="text-sm">
                              {restaurant.location}
                              {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {allItemsRecommended ? (
                              <Badge variant="outline" className="text-xs flex items-center gap-1 text-green-600 border-green-300 bg-green-50">
                                <Check className="w-3 h-3" />
                                All items added
                              </Badge>
                            ) : isAlreadyAdded ? (
                              <Badge variant="outline" className="text-xs flex items-center gap-1 text-blue-600 border-blue-300 bg-blue-50">
                                <Utensils className="w-3 h-3" />
                                {availableItemsCount} more {availableItemsCount === 1 ? "item" : "items"}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <Utensils className="w-3 h-3" />
                                {restaurant.itemCount} {restaurant.itemCount === 1 ? "item" : "items"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {/* Visit dates */}
                        <div className="flex items-start gap-1.5 mt-2">
                          <Calendar className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-gray-400" />
                          <div className="flex flex-wrap gap-1.5">
                            {restaurant.visitDates.map((date) => (
                              <span
                                key={date}
                                className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                              >
                                {new Date(date).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "2-digit",
                                })}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          // Step 2: Select food items and add note
          <>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-gray-700">
                  Recommended Items (Optional)
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Select items you've tried and recommend
                </p>
              </div>

              {groupedFoodItems.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No items found for this restaurant
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedFoodItems.map((group) => (
                    <div key={group.visitDate} className="space-y-2">
                      {/* Date Header */}
                      <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(group.visitDate).toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-gray-400">
                          ({group.items.length} {group.items.length === 1 ? "item" : "items"})
                        </span>
                      </div>

                      {/* Items for this date */}
                      <div className="space-y-2 pl-2 border-l-2 border-gray-200">
                        {group.items.map((item) => {
                          const isAlreadyRecommended = existingRecommendedItemIds.has(item.id);
                          return (
                            <Card
                              key={item.id}
                              className={`transition-shadow ${
                                isAlreadyRecommended
                                  ? "opacity-60 cursor-not-allowed"
                                  : "cursor-pointer hover:shadow-sm"
                              }`}
                              onClick={() => !isAlreadyRecommended && handleToggleFoodItem(item.id)}
                            >
                              <CardHeader className="py-3">
                                <div className="flex items-start gap-3">
                                  {isAlreadyRecommended ? (
                                    <div className="mt-1 w-4 h-4 rounded border border-green-500 bg-green-100 flex items-center justify-center">
                                      <Check className="w-3 h-3 text-green-600" />
                                    </div>
                                  ) : (
                                    <Checkbox
                                      checked={selectedFoodItems.includes(item.id)}
                                      onCheckedChange={() => handleToggleFoodItem(item.id)}
                                      className="mt-1"
                                      data-testid={`food-item-checkbox-${item.id}`}
                                    />
                                  )}
                                  <div className="flex-1">
                                    <CardTitle className={`text-sm flex items-center gap-2 ${isAlreadyRecommended ? "text-gray-500" : ""}`}>
                                      {item.name}
                                      <Badge
                                        className={`${
                                          RATING_COLORS[item.rating - 1] || "bg-gray-500"
                                        } text-white text-xs`}
                                      >
                                        {RATING_LABELS[item.rating - 1] || "Unknown"}
                                      </Badge>
                                      {isAlreadyRecommended && (
                                        <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50">
                                          Added
                                        </Badge>
                                      )}
                                    </CardTitle>
                                    {item.notes && (
                                      <CardDescription className="text-xs mt-1">
                                        {item.notes}
                                      </CardDescription>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="note" className="text-sm font-medium text-gray-700">
                General Note (Optional)
              </Label>
              <Textarea
                id="note"
                placeholder="Why do you recommend this restaurant? What makes it special?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={3}
                className="resize-none"
                data-testid="list-item-note"
              />
              <p className="text-xs text-gray-500 text-right">
                {note.length}/300 characters
              </p>
            </div>
          </>
        )}
      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          {!selectedRestaurant ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={onNavigateBack}
            >
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleBackToSearch}
                className="flex-1"
                disabled={addRestaurantMutation.isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  addRestaurantMutation.isPending ||
                  // When updating existing entry, require at least one new item selected
                  (existingRestaurantIds.has(selectedRestaurant?.id || "") && selectedFoodItems.length === 0)
                }
                className="flex-1 flex items-center justify-center gap-2"
                data-testid="add-restaurant-submit"
              >
                <Plus className="w-4 h-4" />
                {addRestaurantMutation.isPending
                  ? "Saving..."
                  : existingRestaurantIds.has(selectedRestaurant?.id || "")
                    ? "Add Items"
                    : "Add to List"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
