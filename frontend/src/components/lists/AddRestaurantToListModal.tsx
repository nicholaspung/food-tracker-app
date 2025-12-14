import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, Restaurant, FoodItem } from "@/lib/pocketbase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Plus} from "lucide-react";
import { Label } from "@/components/ui/label";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface AddRestaurantToListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  onSuccess?: () => void;
}

export default function AddRestaurantToListModal({
  open,
  onOpenChange,
  listId,
  onSuccess,
}: AddRestaurantToListModalProps) {
  const queryClient = useQueryClient();
  const user = pb.authStore.record;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedFoodItems, setSelectedFoodItems] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const { error, handleError, clearError } = useErrorHandler({
    source: 'AddRestaurantToListModal',
    defaultSeverity: 'error',
  });

  // Fetch restaurants the user has visited (where they have food items)
  const { data: visitedRestaurants = [], isLoading: loadingRestaurants } = useQuery<
    Restaurant[]
  >({
    queryKey: ["visited_restaurants", user?.id],
    queryFn: async () => {
      // Get all food items for this user
      const foodItems = await pb.collection("food_items").getFullList<FoodItem>({
        filter: `user = "${user?.id}"`,
        expand: "visit.restaurant",
      });

      // Extract unique restaurants
      const restaurantMap = new Map<string, Restaurant>();
      for (const item of foodItems) {
        const visit = item.expand?.visit;
        if (visit?.expand?.restaurant) {
          const restaurant = visit.expand.restaurant as Restaurant;
          restaurantMap.set(restaurant.id, restaurant);
        }
      }

      return Array.from(restaurantMap.values());
    },
    enabled: !!user && open,
  });

  // Fetch food items for selected restaurant
  const { data: restaurantFoodItems = [] } = useQuery<FoodItem[]>({
    queryKey: ["restaurant_food_items", selectedRestaurant?.id, user?.id],
    queryFn: async () => {
      if (!selectedRestaurant) return [];

      // Get all visits for this restaurant by this user
      const visits = await pb.collection("visits").getFullList({
        filter: `restaurant = "${selectedRestaurant.id}" && user = "${user?.id}"`,
      });

      if (visits.length === 0) return [];

      // Get all food items from these visits
      const visitIds = visits.map((v) => v.id);
      const filter = visitIds.map((id) => `visit = "${id}"`).join(" || ");

      return await pb.collection("food_items").getFullList<FoodItem>({
        filter: `user = "${user?.id}" && (${filter})`,
        sort: "-rating,-created",
      });
    },
    enabled: !!selectedRestaurant && !!user,
  });

  // Filter restaurants by search query
  const filteredRestaurants = visitedRestaurants.filter((restaurant) =>
    restaurant.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add restaurant mutation
  const addRestaurantMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRestaurant) throw new Error("No restaurant selected");

      // Get the current max position for this list
      const existingItems = await pb.collection("list_items").getFullList({
        filter: `list = "${listId}"`,
        sort: "-position",
      });

      const nextPosition = existingItems.length > 0 ? existingItems[0].position + 1 : 0;

      // Create the list item
      return await pb.collection("list_items").create({
        list: listId,
        restaurant: selectedRestaurant.id,
        addedBy: user?.id,
        position: nextPosition,
        note: note.trim() || undefined,
        recommendedItems: selectedFoodItems.length > 0 ? selectedFoodItems : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
      onSuccess?.();
      handleClose();
    },
    onError: (err: any) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.CREATE_FAILED("list item") });
    },
  });

  const handleClose = () => {
    setSearchQuery("");
    setSelectedRestaurant(null);
    setSelectedFoodItems([]);
    setNote("");
    clearError();
    onOpenChange(false);
  };

  const handleSelectRestaurant = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setSelectedFoodItems([]);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selectedRestaurant ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRestaurant(null)}
                  className="p-1 h-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span>Add {selectedRestaurant.name}</span>
              </div>
            ) : (
              "Add Restaurant to List"
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedRestaurant
              ? "Select menu items you recommend and add a note (optional)"
              : "Search for a restaurant you've visited"}
          </DialogDescription>
        </DialogHeader>

        {/* Error Alert - Show at top */}
        <div className="mx-6">
          <ErrorDisplay error={error} onClear={clearError} />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
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
                  {filteredRestaurants.map((restaurant) => (
                    <Card
                      key={restaurant.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleSelectRestaurant(restaurant)}
                      data-testid={`restaurant-option-${restaurant.id}`}
                    >
                      <CardHeader className="py-3">
                        <CardTitle className="text-base">{restaurant.name}</CardTitle>
                        <CardDescription className="text-sm">
                          {restaurant.location}
                          {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
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

                {restaurantFoodItems.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No items found for this restaurant
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {restaurantFoodItems.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer hover:shadow-sm transition-shadow"
                        onClick={() => handleToggleFoodItem(item.id)}
                      >
                        <CardHeader className="py-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedFoodItems.includes(item.id)}
                              onCheckedChange={() => handleToggleFoodItem(item.id)}
                              className="mt-1"
                              data-testid={`food-item-checkbox-${item.id}`}
                            />
                            <div className="flex-1">
                              <CardTitle className="text-sm flex items-center gap-2">
                                {item.name}
                                <Badge
                                  className={`${
                                    RATING_COLORS[item.rating - 1] || "bg-gray-500"
                                  } text-white text-xs`}
                                >
                                  {RATING_LABELS[item.rating - 1] || "Unknown"}
                                </Badge>
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

        {selectedRestaurant && (
          <div className="flex gap-2 pt-4 border-t px-6">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedRestaurant(null);
                clearError();
              }}
              className="flex-1"
              disabled={addRestaurantMutation.isPending}
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={addRestaurantMutation.isPending}
              className="flex-1 flex items-center gap-2"
              data-testid="add-restaurant-submit"
            >
              <Plus className="w-4 h-4" />
              {addRestaurantMutation.isPending ? "Adding..." : "Add to List"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
