import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList, ListItem, Restaurant } from "@/lib/pocketbase";
import { Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { repositories } from '@/repositories';
import { useRestaurantLists } from "@/hooks/api/useRestaurantLists";
import SaveToListModal from "./SaveToListModal";
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
  Bookmark,
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

interface ListDetailPageProps {
  listId: string;
  onNavigateBack?: () => void;
  onEditList?: () => void;
  onAddRestaurant?: () => void;
}

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
  const user = pb.authStore.record;

  // Fetch user's own lists to check which restaurants are already saved
  const { data: userLists = [] } = useRestaurantLists();

  // Check if we're rendering a child route (edit or add-restaurant page)
  const isOnChildRoute = matches.some(
    (match) => match.routeId === '/lists/$listId/edit' || match.routeId === '/lists/$listId/add-restaurant'
  );

  // Fetch list details
  const { data: list, isLoading: listLoading } = useQuery<RestaurantList>({
    queryKey: ["restaurant_list", listId],
    queryFn: async () => {
      return await repositories.restaurantLists.getOne(listId);
    },
    enabled: !isOnChildRoute,
  });

  // Fetch list items with expanded restaurant and recommended items with visit data
  const { data: listItems = [], isLoading: itemsLoading, refetch: refetchListItems } = useQuery<
    ListItem[]
  >({
    queryKey: ["list_items", listId],
    queryFn: async () => {
      return await repositories.listItems.getByList(listId, {
        sort: "position",
        expand: "restaurant,recommendedItems.visit",
      });
    },
    enabled: !!list && !isOnChildRoute,
  });

  // Track previous child route state to detect when returning from child routes
  const wasOnChildRoute = useRef(isOnChildRoute);

  // Fetch user's saved list items to check which restaurants are already in user's lists
  const { data: userListItems = [] } = useQuery<ListItem[]>({
    queryKey: ["user_list_items", user?.id],
    queryFn: async () => {
      if (!user || userLists.length === 0) return [];
      const listIds = userLists.map(l => l.id);
      return await repositories.listItems.getFullList({
        filter: listIds.map(id => `list = "${id}"`).join(' || '),
      });
    },
    enabled: !!user && userLists.length > 0 && !isOnChildRoute,
  });

  // Create a set of restaurant IDs that are already in user's lists
  const savedRestaurantIds = useMemo(() => {
    return new Set(userListItems.map(item => item.restaurant));
  }, [userListItems]);

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
      queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
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

  const handleDeleteItem = (item: ListItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

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
        ) : (
          <div className="space-y-3">
            {(isReorderMode ? localItems : listItems).map((item, index) => {
              const restaurant = item.expand?.restaurant as Restaurant;
              const recommendedItems = item.expand?.recommendedItems || [];
              if (!restaurant) return null;

              return (
                <Card
                  key={item.id}
                  className={`transition-shadow ${isReorderMode ? 'border-blue-200 bg-blue-50/30' : 'hover:shadow-md'}`}
                  data-testid={`list-item-${item.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      {/* Reorder controls */}
                      {isReorderMode && (
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
                      )}
                      <div className="flex-1">
                        <div>
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
                            {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
                          </CardDescription>
                        </div>

                        {/* Recommended Items - hidden in reorder mode */}
                        {!isReorderMode && recommendedItems.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-700 mb-2">
                              Recommended Items:
                            </p>
                            <div className="space-y-1.5">
                              {recommendedItems.map((foodItem: any) => {
                                const visitDate = foodItem.expand?.visit?.visitDate;
                                return (
                                  <div
                                    key={foodItem.id}
                                    className="flex items-center gap-2 text-sm flex-wrap"
                                  >
                                    <span className="text-gray-900 font-medium">
                                      {foodItem.name}
                                    </span>
                                    <Badge
                                      className={`${
                                        RATING_COLORS[foodItem.rating - 1] || "bg-gray-500"
                                      } text-white text-xs`}
                                    >
                                      {RATING_LABELS[foodItem.rating - 1] || "Unknown"}
                                    </Badge>
                                    {visitDate && (
                                      <span className="text-xs text-gray-400">
                                        {new Date(visitDate).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        })}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Note - hidden in reorder mode */}
                        {!isReorderMode && item.note && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-sm text-gray-700 italic">
                              "{item.note}"
                            </p>
                          </div>
                        )}
                      </div>
                      {/* Save to list button (only for non-owners) */}
                      {!isOwner && !isReorderMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToSave(item);
                            setSaveModalOpen(true);
                          }}
                          className="p-2"
                          data-testid={`save-item-${item.id}`}
                        >
                          <Bookmark
                            className={`w-4 h-4 ${
                              savedRestaurantIds.has(restaurant.id)
                                ? 'fill-blue-600 text-blue-600'
                                : 'text-gray-600'
                            }`}
                          />
                        </Button>
                      )}
                      {/* Delete button (only for owners) */}
                      {isOwner && !isReorderMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(item);
                          }}
                          className="p-2"
                          data-testid={`delete-item-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
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
            if (!open) setItemToSave(null);
          }}
          restaurantId={itemToSave.expand?.restaurant?.id || itemToSave.restaurant}
          restaurantName={itemToSave.expand?.restaurant?.name || 'Restaurant'}
          recommendedItemIds={itemToSave.recommendedItems}
          sourceNote={itemToSave.note}
          onCreateNewList={() => navigate({ to: '/lists/new' })}
        />
      )}
    </div>
  );
}
