import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList, ListItem, Restaurant } from "@/lib/pocketbase";
import { Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { repositories } from '@/repositories';
import { useRestaurantLists } from "@/hooks/api/useRestaurantLists";
import SaveToListModal from "./SaveToListModal";
import RemoveBookmarkDialog from "./RemoveBookmarkDialog";
import { IWentThereButton } from "./IWentThereButton";
import RestaurantGroupCard from "./RestaurantGroupCard";
import { GroupedRestaurant, UserReviewData } from "./types";
import {
  ArrowLeft,
  Lock,
  Users,
  Globe,
  Trash2,
  MapPin,
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
  GripVertical,
  X,
  Star,
} from "lucide-react";
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
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { User, FoodItem } from "@/lib/pocketbase";

interface ListDetailPageProps {
  listId: string;
  onNavigateBack?: () => void;
  onEditList?: () => void;
  onAddRestaurant?: () => void;
}

const EMPTY_LIST_ITEMS: ListItem[] = [];
const EMPTY_RESTAURANT_LISTS: RestaurantList[] = [];

export default function ListDetailPage({ listId, onNavigateBack, onEditList, onAddRestaurant }: ListDetailPageProps) {
  const matches = useMatches();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ListItem | null>(null);
  const [listToDelete, setListToDelete] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [localItems, setLocalItems] = useState<ListItem[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [itemToSave, setItemToSave] = useState<ListItem | null>(null);
  const [foodItemToSave, setFoodItemToSave] = useState<FoodItem | null>(null); // Specific food item clicked
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<ListItem | null>(null);
  const [fullscreenReview, setFullscreenReview] = useState<UserReviewData | null>(null);
  const user = pb.authStore.record;

  // Fetch user's own lists to check which restaurants are already saved
  const { data: userListsData } = useRestaurantLists();
  const userLists = userListsData || EMPTY_RESTAURANT_LISTS;

  // Check if we're rendering a child route (edit or add-restaurant page)
  const isOnChildRoute = matches.some(
    (match) => match.routeId === '/lists/$listId/edit' || match.routeId === '/lists/$listId/add-restaurant'
  );

  // Fetch list details with owner info for friend lists
  const { data: list, isLoading: listLoading } = useQuery<RestaurantList>({
    queryKey: ["restaurant_list", listId],
    queryFn: async () => {
      return await repositories.restaurantLists.getOne(listId, {
        expand: "user",
      });
    },
    enabled: !isOnChildRoute,
  });

  // Fetch list items with expanded restaurant, sourceUser, foodItem, and userFoodItem with visit data
  const { data: listItemsData, isLoading: itemsLoading, refetch: refetchListItems } = useQuery<
    ListItem[]
  >({
    queryKey: ["list_items", listId],
    queryFn: async () => {
      return await repositories.listItems.getByList(listId, {
        sort: "position",
        expand: "restaurant,sourceUser,foodItem.visit,foodItem.user,userFoodItem.visit,userFoodItem.user,recommendedItems.visit,recommendedItems.user",
      });
    },
    enabled: !!list && !isOnChildRoute,
  });
  const listItems = listItemsData || EMPTY_LIST_ITEMS;

  // Track previous child route state to detect when returning from child routes
  const wasOnChildRoute = useRef(isOnChildRoute);

  // Fetch user's saved list items to check which food items are already bookmarked
  const { data: userListItemsData } = useQuery<ListItem[]>({
    queryKey: ["user_list_items", user?.id, "with_food_items"],
    queryFn: async () => {
      if (!user || userLists.length === 0) return [];
      const listIds = userLists.map(l => l.id);
      return await repositories.listItems.getFullList({
        filter: listIds.map(id => `list = "${id}"`).join(' || '),
        expand: "foodItem,sourceUser",
      });
    },
    enabled: !!user && userLists.length > 0 && !isOnChildRoute,
  });
  const userListItems = userListItemsData || EMPTY_LIST_ITEMS;

  // Helper to check if user has saved a specific food item
  const hasSavedFoodItem = useMemo(() => {
    const savedItemIds = new Set(userListItems.map(item => item.foodItem).filter(Boolean));
    return (foodItemId: string): boolean => savedItemIds.has(foodItemId);
  }, [userListItems]);

  // Fetch photo for fullscreen review when a review is selected
  const { data: reviewPhoto } = useQuery({
    queryKey: ["visit_photo", fullscreenReview?.foodItem.id],
    queryFn: async () => {
      if (!fullscreenReview?.foodItem.id) return null;
      const photos = await repositories.visitPhotos.getFullList({
        filter: `food_item = "${fullscreenReview.foodItem.id}"`,
        sort: "-created",
      });
      if (photos.length > 0) {
        const photo = photos[0];
        return pb.files.getURL(photo, photo.photo);
      }
      return null;
    },
    enabled: !!fullscreenReview?.foodItem.id,
  });

  // Group list items by restaurant, then by source user for consolidated display
  // Each list_item now represents ONE bookmarked food item
  const groupedItems = useMemo((): GroupedRestaurant[] => {
    const restaurantMap = new Map<string, GroupedRestaurant>();

    for (const item of listItems) {
      const restaurant = item.expand?.restaurant as Restaurant | undefined;
      if (!restaurant) continue;

      // Get the food item - either from new foodItem field or legacy recommendedItems
      const foodItem = item.expand?.foodItem as FoodItem | undefined;
      const legacyItems = (item.expand?.recommendedItems || []) as FoodItem[];

      // Skip items without food item data
      if (!foodItem && legacyItems.length === 0) continue;

      const sourceUser = item.expand?.sourceUser as User | undefined;
      const sourceUserId = sourceUser?.id || '_self';

      let grouped = restaurantMap.get(restaurant.id);
      if (!grouped) {
        grouped = {
          restaurant,
          itemsBySource: [],
          firstPosition: item.position,
        };
        restaurantMap.set(restaurant.id, grouped);
      }

      // Update first position if needed
      if (item.position < grouped.firstPosition) {
        grouped.firstPosition = item.position;
      }

      // Find or create source group
      let sourceGroup = grouped.itemsBySource.find(
        s => (s.sourceUser?.id || '_self') === sourceUserId
      );
      if (!sourceGroup) {
        sourceGroup = {
          sourceUser: sourceUser || null,
          items: [],
          notes: [],
        };
        grouped.itemsBySource.push(sourceGroup);
      }

      // Add food item(s)
      if (foodItem) {
        sourceGroup.items.push({ listItem: item, foodItem });
      } else {
        // Handle legacy items
        for (const legacyItem of legacyItems) {
          sourceGroup.items.push({ listItem: item, foodItem: legacyItem });
        }
      }

      // Add note if present
      if (item.note && !sourceGroup.notes.includes(item.note)) {
        sourceGroup.notes.push(item.note);
      }
    }

    // Sort by first position
    return Array.from(restaurantMap.values()).sort(
      (a, b) => a.firstPosition - b.firstPosition
    );
  }, [listItems]);

  // Refetch list items when returning from a child route (e.g., after adding items)
  useEffect(() => {
    if (wasOnChildRoute.current && !isOnChildRoute) {
      // We just returned from a child route, refetch the data
      refetchListItems();
    }
    wasOnChildRoute.current = isOnChildRoute;
  }, [isOnChildRoute, refetchListItems]);

  // Delete list item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await repositories.listItems.delete(itemId);
    },
    onSuccess: () => {
      // Invalidate current list's items
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });

      // Invalidate user's saved items queries so bookmark icons update on friend's lists
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'user_list_items' ||
                 (key[0] === 'list_items' && key[1] === 'user');
        },
      });

      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
  });

  // Delete list mutation
  const deleteListMutation = useMutation({
    mutationFn: async () => {
      await repositories.restaurantLists.delete(listId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_lists"] });
      onNavigateBack?.();
    },
  });

  // Reorder mutation - updates positions for all items
  const reorderMutation = useMutation({
    mutationFn: async (items: ListItem[]) => {
      // Update each item's position sequentially
      // Start from 1 to avoid issues with 0 being treated as falsy
      for (let i = 0; i < items.length; i++) {
        await repositories.listItems.update(items[i].id, { position: i + 1 });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
      setIsReorderMode(false);
    },
  });

  // Enter reorder mode
  const handleEnterReorderMode = () => {
    setLocalItems([...listItems]);
    setIsReorderMode(true);
  };

  // Cancel reorder mode
  const handleCancelReorder = () => {
    setLocalItems([]);
    setIsReorderMode(false);
  };

  // Save new order
  const handleSaveOrder = () => {
    reorderMutation.mutate(localItems);
  };

  // Move item up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...localItems];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setLocalItems(newItems);
  };

  // Move item down
  const handleMoveDown = (index: number) => {
    if (index === localItems.length - 1) return;
    const newItems = [...localItems];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setLocalItems(newItems);
  };

  // If we're on a child route (edit or add-restaurant), just render the Outlet
  if (isOnChildRoute) {
    return <Outlet />;
  }

  const getVisibilityIcon = (visibility: "private" | "friends" | "public") => {
    switch (visibility) {
      case "private":
        return <Lock className="w-4 h-4 text-gray-600" />;
      case "friends":
        return <Users className="w-4 h-4 text-blue-600" />;
      case "public":
        return <Globe className="w-4 h-4 text-green-600" />;
    }
  };

  const handleDeleteItem = useCallback((item: ListItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  }, []);

  const handleSaveItem = useCallback((item: ListItem, foodItem: FoodItem) => {
    setItemToSave(item);
    setFoodItemToSave(foodItem);
    setSaveModalOpen(true);
  }, []);

  const handleRemoveItem = useCallback((item: ListItem) => {
    setItemToRemove(item);
    setRemoveDialogOpen(true);
  }, []);

  const handleDeleteList = () => {
    setListToDelete(true);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (listToDelete) {
      await deleteListMutation.mutateAsync();
    } else if (itemToDelete) {
      await deleteItemMutation.mutateAsync(itemToDelete.id);
    }
  };

  const isOwner = list?.user === user?.id;

  if (listLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <p className="text-gray-500">Loading list...</p>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <p className="text-gray-500">List not found</p>
        <Button
          onClick={onNavigateBack}
          className="mt-4"
          variant="outline"
        >
          Back to Lists
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateBack}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 truncate">{list.name}</h1>
              {getVisibilityIcon(list.visibility)}
            </div>
            <p className="text-xs text-gray-500">
              {!isOwner && list.expand?.user && (
                <span className="text-blue-600 font-medium">
                  {list.expand.user.name || list.expand.user.email?.split("@")[0]}'s list
                </span>
              )}
              {!isOwner && list.expand?.user && " · "}
              {listItems.length} {listItems.length === 1 ? "restaurant" : "restaurants"}
            </p>
          </div>
          {/* Actions (only for owner) */}
          {isOwner && !isReorderMode && (
            <div className="flex gap-2 flex-shrink-0">
              {listItems.length > 1 && (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleEnterReorderMode}
                  data-testid="reorder-list-button"
                >
                  <GripVertical className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="outline"
                onClick={onEditList}
                data-testid="edit-list-button"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              {/* Don't allow deleting the default "Saved" list */}
              {!list.isDefault && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={handleDeleteList}
                  data-testid="delete-list-button"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
          {isReorderMode && (
            <span className="text-sm text-blue-600 font-medium">Reordering...</span>
          )}
        </div>
        {list.description && (
          <p className="text-sm text-gray-600 mt-2 ml-12">{list.description}</p>
        )}
      </div>

      {/* Add Visit Ratings Bar */}
      {isOwner && !isReorderMode && (
        <button
          onClick={onAddRestaurant}
          className="w-full bg-blue-50 border-b border-blue-100 px-4 py-3 flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
          data-testid="add-restaurant-button"
        >
          <Plus className="w-5 h-5 text-blue-600" />
          <span className="text-blue-700 font-medium">Add Visit Ratings to List</span>
        </button>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {listItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No restaurants yet
            </h3>
            <p className="text-sm text-gray-600 mb-6 max-w-sm">
              Add restaurants you've visited to this list with recommended items and notes
            </p>
            {isOwner && (
              <Button
                onClick={onAddRestaurant}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Your First Restaurant
              </Button>
            )}
          </div>
        ) : isReorderMode ? (
          /* Reorder Mode - Show flat list for reordering individual items */
          <div className="space-y-3">
            {localItems.map((item, index) => {
              const restaurant = item.expand?.restaurant as Restaurant;
              if (!restaurant) return null;

              return (
                <Card
                  key={item.id}
                  className="transition-shadow border-blue-200 bg-blue-50/30"
                  data-testid={`list-item-${item.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === localItems.length - 1}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-500">
                            {index + 1}.
                          </span>
                          <CardTitle className="text-lg">
                            {restaurant.name}
                          </CardTitle>
                        </div>
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {restaurant.location}
                        </CardDescription>
                        {item.expand?.sourceUser && (
                          <Badge
                            variant="outline"
                            className="text-xs border-blue-300 text-blue-700 mt-1"
                          >
                            <Users className="w-3 h-3 mr-1" />
                            {item.expand.sourceUser.name || item.expand.sourceUser.email?.split("@")[0]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        ) : (
          /* Grouped by restaurant (Owner & Non-owner view) */
          <div className="space-y-3">
            {groupedItems.map((group, index) => (
              <RestaurantGroupCard
                key={group.restaurant.id}
                group={group}
                index={index}
                isOwner={isOwner}
                onDeleteItem={handleDeleteItem}
                onSaveItem={handleSaveItem}
                onRemoveItem={handleRemoveItem}
                onViewReview={setFullscreenReview}
                hasSavedFoodItem={hasSavedFoodItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reorder Mode Footer */}
      {isReorderMode && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancelReorder}
              disabled={reorderMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={handleSaveOrder}
              disabled={reorderMutation.isPending}
            >
              {reorderMutation.isPending ? "Saving..." : "Save Order"}
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {listToDelete ? "Delete List?" : "Remove Restaurant?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {listToDelete
                ? `Are you sure you want to delete "${list.name}"? This action cannot be undone and will remove all restaurants from this list.`
                : `Are you sure you want to remove this restaurant from "${list.name}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setItemToDelete(null);
                setListToDelete(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {listToDelete ? "Delete List" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save to List Modal */}
      {itemToSave && (
        <SaveToListModal
          open={saveModalOpen}
          onOpenChange={(open) => {
            setSaveModalOpen(open);
            if (!open) {
              setItemToSave(null);
              setFoodItemToSave(null);
            }
          }}
          restaurantId={itemToSave.expand?.restaurant?.id || itemToSave.restaurant}
          restaurantName={itemToSave.expand?.restaurant?.name || 'Restaurant'}
          foodItems={
            // Use specific food item if set, otherwise fall back to list item's items
            foodItemToSave
              ? [foodItemToSave]
              : itemToSave.expand?.foodItem
                ? [itemToSave.expand.foodItem]
                : (itemToSave.expand?.recommendedItems as FoodItem[] || [])
          }
          sourceNote={itemToSave.note}
          sourceUserId={list?.user}
          onCreateNewList={() => navigate({ to: '/lists/new' })}
        />
      )}

      {/* Remove Bookmark Dialog */}
      {itemToRemove && list && (
        <RemoveBookmarkDialog
          open={removeDialogOpen}
          onOpenChange={(open) => {
            setRemoveDialogOpen(open);
            if (!open) setItemToRemove(null);
          }}
          restaurantId={itemToRemove.expand?.restaurant?.id || itemToRemove.restaurant}
          restaurantName={itemToRemove.expand?.restaurant?.name || 'Restaurant'}
          sourceUserId={list.user}
          sourceUserName={list.expand?.user?.name || list.expand?.user?.email?.split("@")[0] || 'Friend'}
          userListItems={userListItems}
          userLists={userLists}
        />
      )}

      {/* Fullscreen User Review Modal */}
      {fullscreenReview && (
        <div
          className="fixed inset-0 bg-white z-[100] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg text-gray-900 truncate">{fullscreenReview.foodItem.name}</p>
              <p className="text-sm text-gray-500 truncate">{fullscreenReview.restaurant.name}</p>
            </div>
            <button
              onClick={() => setFullscreenReview(null)}
              className="ml-4 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Review details - compact single line */}
            <div className="px-4 py-3 flex items-center gap-2 flex-wrap text-sm">
              {fullscreenReview.visitDate && (
                <span className="text-gray-600">
                  {new Date(fullscreenReview.visitDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              <span className="text-gray-300">·</span>
              <Badge
                className={`${
                  RATING_COLORS[fullscreenReview.foodItem.rating - 1] || "bg-gray-500"
                } text-white text-xs`}
              >
                {RATING_LABELS[fullscreenReview.foodItem.rating - 1] || "Unknown"}
              </Badge>
              {fullscreenReview.foodItem.notes && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-700">{fullscreenReview.foodItem.notes}</span>
                </>
              )}
            </div>

            {/* Photo at the bottom */}
            <div className="p-4 pt-0">
              {reviewPhoto ? (
                <img
                  src={reviewPhoto}
                  alt={fullscreenReview.foodItem.name}
                  className="w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-gray-100 rounded-lg">
                  <Star className="w-12 h-12 mb-2" />
                  <p className="text-sm">No photo for this visit</p>
                </div>
              )}
            </div>

            {/* Bottom padding for safe area */}
            <div className="h-8" />
          </div>
        </div>
      )}
    </div>
  );
}
