import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList, FoodItem } from "@/lib/pocketbase";
import { repositories } from '@/repositories';
import { useSaveToList } from "@/hooks/offline/useSaveToList";
import { useDefaultList, useUserListItemsForRestaurant } from "@/hooks/api/useRestaurantLists";
import { restaurantListKeys } from "@/constants/queryKeys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Lock, Users, Globe, Plus, Star, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";

interface SaveToListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  restaurantName: string;
  foodItems?: FoodItem[]; // Food items to choose from (from friend's visit)
  sourceNote?: string;
  sourceUserId?: string; // ID of the friend whose list items are being saved from
  onCreateNewList?: () => void;
}

export default function SaveToListModal({
  open,
  onOpenChange,
  restaurantId,
  restaurantName,
  foodItems = [],
  sourceNote,
  sourceUserId,
  onCreateNewList,
}: SaveToListModalProps) {
  const queryClient = useQueryClient();
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isCreatingDefaultList, setIsCreatingDefaultList] = useState(false);
  const { error, handleError, clearError, showValidation, showSuccess } = useErrorHandler({
    source: 'SaveToListModal',
    defaultSeverity: 'error',
  });
  const user = pb.authStore.record;

  // Fetch user's default "Saved" list
  const { data: defaultList, isLoading: defaultListLoading } = useDefaultList();

  // Fetch user's lists
  const { data: lists = [], isLoading: listsLoading } = useQuery<RestaurantList[]>({
    queryKey: ["restaurant_lists", user?.id],
    queryFn: async () => {
      return await repositories.restaurantLists.getFullList({
        sort: "-updated",
        filter: `user = "${user?.id}"`,
      });
    },
    enabled: !!user && open,
  });

  // Check which food items are already saved in user's lists
  const { data: existingUserItems = [] } = useUserListItemsForRestaurant(restaurantId);

  // Get IDs of food items already saved from this source user
  const alreadySavedItemIds = useMemo(() => {
    const savedIds = new Set<string>();
    existingUserItems.forEach(item => {
      if (item.sourceUser === (sourceUserId || null) && item.foodItem) {
        savedIds.add(item.foodItem);
      }
    });
    return savedIds;
  }, [existingUserItems, sourceUserId]);

  // Filter out the default "Saved" list and sort by updated time
  const sortedLists = useMemo(() => {
    return [...lists]
      .filter((list) => !list.isDefault)
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }, [lists]);

  // Save to list mutation
  const saveToListMutation = useSaveToList({
    onSuccess: () => {
      // Will be handled in handleSubmit for batch success
    },
    onError: (err) => {
      handleError(err, { customMessage: ERROR_MESSAGES.LISTS.SAVE_TO_LIST_FAILED });
    },
  });

  // Reset state when modal opens/closes
  // Note: We only depend on `open` to avoid infinite loops from array recreation
  useEffect(() => {
    if (open) {
      // Pre-select all items that aren't already saved (using current values, not deps)
      const availableItems = foodItems.filter(item => !alreadySavedItemIds.has(item.id));
      setSelectedItems(new Set(availableItems.map(item => item.id)));
    } else {
      setSelectedLists(new Set());
      setSelectedItems(new Set());
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Create default "Saved" list if it doesn't exist
  const createDefaultListIfNeeded = async () => {
    if (defaultList || isCreatingDefaultList) return defaultList;

    try {
      setIsCreatingDefaultList(true);
      const newDefaultList = await repositories.restaurantLists.createDefaultList(user!.id);

      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.all(user!.id, undefined)
      });
      queryClient.invalidateQueries({
        queryKey: restaurantListKeys.defaultList(user!.id)
      });

      return newDefaultList;
    } catch (err) {
      handleError(err, { customMessage: ERROR_MESSAGES.LISTS.DEFAULT_LIST_CREATE_FAILED });
      return null;
    } finally {
      setIsCreatingDefaultList(false);
    }
  };

  const toggleList = (listId: string) => {
    const newSelected = new Set(selectedLists);
    if (newSelected.has(listId)) {
      newSelected.delete(listId);
    } else {
      newSelected.add(listId);
    }
    setSelectedLists(newSelected);
  };

  const toggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSubmit = async () => {
    if (selectedLists.size === 0) {
      showValidation(ERROR_MESSAGES.LISTS.SELECT_AT_LEAST_ONE);
      return;
    }
    if (selectedItems.size === 0) {
      showValidation("Please select at least one item to save");
      return;
    }
    clearError();

    try {
      // Create one list_item per (foodItem, list) combination
      const savePromises: Promise<any>[] = [];

      for (const listId of selectedLists) {
        for (const itemId of selectedItems) {
          // Skip if already saved
          if (alreadySavedItemIds.has(itemId)) continue;

          savePromises.push(
            saveToListMutation.mutateAsync({
              listId,
              restaurantId,
              foodItemId: itemId,
              note: sourceNote,
              sourceUserId,
            })
          );
        }
      }

      if (savePromises.length === 0) {
        showValidation("All selected items are already saved");
        return;
      }

      await Promise.all(savePromises);
      showSuccess(`Saved ${selectedItems.size} ${selectedItems.size === 1 ? 'item' : 'items'} to ${selectedLists.size} ${selectedLists.size === 1 ? 'list' : 'lists'}`);

      setTimeout(() => {
        setSelectedLists(new Set());
        setSelectedItems(new Set());
        onOpenChange(false);
      }, 500);
    } catch {
      // Error already handled by mutation
    }
  };

  // Quick save to default "Saved" list
  const handleQuickSave = async () => {
    if (selectedItems.size === 0) {
      showValidation("Please select at least one item to save");
      return;
    }
    clearError();

    let targetList = defaultList;

    if (!targetList) {
      targetList = await createDefaultListIfNeeded();
      if (!targetList) return;
    }

    try {
      // Create one list_item per selected food item
      const savePromises: Promise<any>[] = [];

      for (const itemId of selectedItems) {
        if (alreadySavedItemIds.has(itemId)) continue;

        savePromises.push(
          saveToListMutation.mutateAsync({
            listId: targetList.id,
            restaurantId,
            foodItemId: itemId,
            note: sourceNote,
            sourceUserId,
          })
        );
      }

      if (savePromises.length === 0) {
        showValidation("All selected items are already saved");
        return;
      }

      await Promise.all(savePromises);
      showSuccess(`Saved ${savePromises.length} ${savePromises.length === 1 ? 'item' : 'items'}!`);

      setTimeout(() => {
        onOpenChange(false);
      }, 500);
    } catch {
      // Error already handled by mutation
    }
  };

  const getVisibilityIcon = (visibility: "private" | "friends" | "public") => {
    switch (visibility) {
      case "private":
        return <Lock className="w-3 h-3 text-gray-600" />;
      case "friends":
        return <Users className="w-3 h-3 text-blue-600" />;
      case "public":
        return <Globe className="w-3 h-3 text-green-600" />;
    }
  };

  const isLoading = listsLoading || defaultListLoading;
  const availableItemsCount = foodItems.filter(item => !alreadySavedItemIds.has(item.id)).length;
  const allItemsAlreadySaved = availableItemsCount === 0 && foodItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save from "{restaurantName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Food Items Selection */}
          {foodItems.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Select items to save:
              </p>
              <div className="space-y-2 max-h-[30vh] overflow-y-auto border rounded-lg p-2">
                {foodItems.map((item) => {
                  const isAlreadySaved = alreadySavedItemIds.has(item.id);
                  const visitDate = item.expand?.visit?.visitDate;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-2 rounded-lg ${
                        isAlreadySaved
                          ? "bg-gray-50 opacity-60"
                          : selectedItems.has(item.id)
                          ? "bg-blue-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={isAlreadySaved || selectedItems.has(item.id)}
                        onCheckedChange={() => {
                          if (!isAlreadySaved) {
                            toggleItem(item.id);
                          }
                        }}
                        disabled={isAlreadySaved}
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`item-${item.id}`}
                          className="flex items-center gap-2 text-sm cursor-pointer flex-wrap"
                        >
                          <span className="font-medium truncate">{item.name}</span>
                          <Badge
                            className={`${
                              RATING_COLORS[item.rating - 1] || "bg-gray-500"
                            } text-white text-xs flex-shrink-0`}
                          >
                            {RATING_LABELS[item.rating - 1] || "Unknown"}
                          </Badge>
                          {visitDate && (
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(visitDate).toLocaleDateString(undefined, {
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </Label>
                        {isAlreadySaved && (
                          <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3" />
                            Already saved
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allItemsAlreadySaved ? (
            <div className="text-center py-4">
              <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600">All items are already saved!</p>
            </div>
          ) : (
            <>
              {/* Quick Save Button */}
              <Button
                onClick={handleQuickSave}
                disabled={saveToListMutation.isPending || isCreatingDefaultList || selectedItems.size === 0}
                className="w-full flex items-center justify-center gap-2"
              >
                {saveToListMutation.isPending || isCreatingDefaultList ? (
                  "Saving..."
                ) : (
                  <>
                    <Star className="w-4 h-4" />
                    Quick Save to "Saved" list
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or choose lists</span>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-gray-500">Loading lists...</p>
                </div>
              ) : sortedLists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-gray-500 mb-4">
                    No other lists available
                  </p>
                  {onCreateNewList && (
                    <Button
                      onClick={() => {
                        onOpenChange(false);
                        onCreateNewList();
                      }}
                      size="sm"
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create New List
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                    {sortedLists.map((list) => (
                      <div
                        key={list.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          selectedLists.has(list.id)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <Checkbox
                          id={`save-list-${list.id}`}
                          checked={selectedLists.has(list.id)}
                          onCheckedChange={() => toggleList(list.id)}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`save-list-${list.id}`}
                            className="flex items-center gap-2 font-semibold text-sm cursor-pointer"
                          >
                            {list.name}
                            {getVisibilityIcon(list.visibility)}
                          </Label>
                          {list.description && (
                            <p className="text-xs text-gray-600 mt-1">
                              {list.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {onCreateNewList && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        onCreateNewList();
                      }}
                      className="w-full flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create New List
                    </Button>
                  )}
                </>
              )}

              {/* Actions */}
              {sortedLists.length > 0 && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSubmit}
                    className="flex-1"
                    disabled={saveToListMutation.isPending || selectedLists.size === 0 || selectedItems.size === 0}
                  >
                    {saveToListMutation.isPending
                      ? "Saving..."
                      : `Save ${selectedItems.size} ${selectedItems.size === 1 ? 'item' : 'items'} to ${selectedLists.size} ${selectedLists.size === 1 ? 'list' : 'lists'}`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={saveToListMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Error Message */}
          <ErrorDisplay error={error} onClear={clearError} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
