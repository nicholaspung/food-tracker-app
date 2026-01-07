import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList } from "@/lib/pocketbase";
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
import { Lock, Users, Globe, Plus, Star, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface SaveToListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  restaurantName: string;
  recommendedItemIds?: string[];
  sourceNote?: string;
  onCreateNewList?: () => void;
}

export default function SaveToListModal({
  open,
  onOpenChange,
  restaurantId,
  restaurantName,
  recommendedItemIds = [],
  sourceNote,
  onCreateNewList,
}: SaveToListModalProps) {
  const queryClient = useQueryClient();
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
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

  // Check which of user's lists already have this restaurant
  const { data: existingUserItems = [] } = useUserListItemsForRestaurant(restaurantId);

  // Get IDs of lists that already contain this restaurant
  const existingListIds = useMemo(() => {
    return new Set(existingUserItems.map((item) => item.list));
  }, [existingUserItems]);

  // Sort lists to put default "Saved" list first
  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });
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
  useEffect(() => {
    if (!open) {
      setSelectedLists(new Set());
      clearError();
    }
  }, [open, clearError]);

  // Create default "Saved" list if it doesn't exist
  const createDefaultListIfNeeded = async () => {
    if (defaultList || isCreatingDefaultList) return defaultList;

    try {
      setIsCreatingDefaultList(true);
      const newDefaultList = await repositories.restaurantLists.createDefaultList(user!.id);

      // Invalidate queries to refresh the lists
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

  const handleSubmit = async () => {
    if (selectedLists.size === 0) {
      showValidation(ERROR_MESSAGES.LISTS.SELECT_AT_LEAST_ONE);
      return;
    }
    clearError();

    // Save restaurant to each selected list
    const listsToSave = Array.from(selectedLists).filter(listId => !existingListIds.has(listId));

    if (listsToSave.length === 0) {
      // All selected lists already have this restaurant
      onOpenChange(false);
      return;
    }

    try {
      await Promise.all(
        listsToSave.map((listId) =>
          saveToListMutation.mutateAsync({
            listId,
            restaurantId,
            recommendedItemIds,
            note: sourceNote,
          })
        )
      );

      showSuccess(`Saved to ${listsToSave.length} ${listsToSave.length === 1 ? 'list' : 'lists'}`);

      // Small delay to show success message
      setTimeout(() => {
        setSelectedLists(new Set());
        onOpenChange(false);
      }, 500);
    } catch {
      // Error already handled by mutation
    }
  };

  // Quick save to default "Saved" list
  const handleQuickSave = async () => {
    clearError();

    let targetList = defaultList;

    // Create default list if it doesn't exist
    if (!targetList) {
      targetList = await createDefaultListIfNeeded();
      if (!targetList) return; // Error already shown
    }

    // Check if already saved to default list
    if (existingListIds.has(targetList.id)) {
      showValidation("Already saved to your Saved list");
      return;
    }

    try {
      await saveToListMutation.mutateAsync({
        listId: targetList.id,
        restaurantId,
        recommendedItemIds,
        note: sourceNote,
      });

      showSuccess("Saved!");

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
  const alreadyInDefaultList = defaultList ? existingListIds.has(defaultList.id) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save "{restaurantName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick Save Button */}
          <Button
            onClick={handleQuickSave}
            disabled={saveToListMutation.isPending || isCreatingDefaultList || alreadyInDefaultList}
            className="w-full flex items-center justify-center gap-2"
            variant={alreadyInDefaultList ? "outline" : "default"}
          >
            {alreadyInDefaultList ? (
              <>
                <Check className="w-4 h-4" />
                Already in Saved list
              </>
            ) : saveToListMutation.isPending || isCreatingDefaultList ? (
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
              <p className="text-sm text-gray-600 mb-4">
                You don't have any lists yet
              </p>
              {onCreateNewList && (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onCreateNewList();
                  }}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First List
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {sortedLists.map((list) => {
                  const alreadyInList = existingListIds.has(list.id);
                  return (
                    <div
                      key={list.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        alreadyInList
                          ? "bg-gray-50 border-gray-200 opacity-60"
                          : selectedLists.has(list.id)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Checkbox
                        id={`save-list-${list.id}`}
                        checked={alreadyInList || selectedLists.has(list.id)}
                        onCheckedChange={() => {
                          if (!alreadyInList) {
                            toggleList(list.id);
                          }
                        }}
                        disabled={alreadyInList}
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`save-list-${list.id}`}
                          className="flex items-center gap-2 font-semibold text-sm cursor-pointer"
                        >
                          {list.isDefault && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                          {list.name}
                          {getVisibilityIcon(list.visibility)}
                        </Label>
                        {list.description && (
                          <p className="text-xs text-gray-600 mt-1">
                            {list.description}
                          </p>
                        )}
                        {alreadyInList && (
                          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Already saved
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
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

          {/* Error Message */}
          <ErrorDisplay error={error} onClear={clearError} />

          {/* Actions */}
          {sortedLists.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1"
                disabled={saveToListMutation.isPending || selectedLists.size === 0}
              >
                {saveToListMutation.isPending
                  ? "Saving..."
                  : `Save to ${selectedLists.size} ${
                      selectedLists.size === 1 ? "List" : "Lists"
                    }`}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
