import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList } from "@/lib/pocketbase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Users, Globe, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface AddToListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  onCreateNewList?: () => void;
}

export default function AddToListModal({
  open,
  onOpenChange,
  restaurantId,
  onCreateNewList,
}: AddToListModalProps) {
  const queryClient = useQueryClient();
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const { error, handleError, clearError, showValidation } = useErrorHandler({
    source: 'AddToListModal',
    defaultSeverity: 'error',
  });
  const user = pb.authStore.record;

  // Fetch user's lists
  const { data: lists = [], isLoading } = useQuery<RestaurantList[]>({
    queryKey: ["restaurant_lists", user?.id],
    queryFn: async () => {
      return await pb.collection("restaurant_lists").getFullList({
        sort: "-updated",
        filter: `user = "${user?.id}"`,
      });
    },
    enabled: !!user && open,
  });

  // Fetch existing list items for this restaurant
  const { data: existingListItems = [] } = useQuery({
    queryKey: ["list_items_for_restaurant", restaurantId],
    queryFn: async () => {
      return await pb.collection("list_items").getFullList({
        filter: `restaurant = "${restaurantId}"`,
      });
    },
    enabled: !!restaurantId && open,
  });

  // Get IDs of lists that already contain this restaurant
  const existingListIds = new Set(
    existingListItems.map((item: any) => item.list)
  );

  // Add to lists mutation
  const addToListsMutation = useMutation({
    mutationFn: async () => {
      const promises = Array.from(selectedLists).map(async (listId) => {
        // Skip if already in list
        if (existingListIds.has(listId)) return;

        // Get current max position in list
        const existingItems = await pb.collection("list_items").getFullList({
          filter: `list = "${listId}"`,
          sort: "-position",
        });

        const maxPosition =
          existingItems.length > 0 ? existingItems[0].position : -1;

        // Create list item
        return await pb.collection("list_items").create({
          list: listId,
          restaurant: restaurantId,
          addedBy: user?.id,
          position: maxPosition + 1,
        });
      });

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_items"] });
      queryClient.invalidateQueries({
        queryKey: ["list_items_for_restaurant", restaurantId],
      });
      setSelectedLists(new Set());
      onOpenChange(false);
    },
    onError: (err) => {
      handleError(err, { customMessage: ERROR_MESSAGES.LISTS.ADD_TO_LIST_FAILED });
    },
  });

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
    await addToListsMutation.mutateAsync();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to List</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-gray-500">Loading lists...</p>
            </div>
          ) : lists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-gray-600 mb-4">
                You don't have any lists yet
              </p>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onCreateNewList?.();
                }}
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Your First List
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {lists.map((list) => {
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
                        id={`list-${list.id}`}
                        checked={
                          alreadyInList || selectedLists.has(list.id)
                        }
                        onCheckedChange={() => {
                          if (!alreadyInList) {
                            toggleList(list.id);
                          }
                        }}
                        disabled={alreadyInList}
                        data-testid={`list-checkbox-${list.id}`}
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`list-${list.id}`}
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
                        {alreadyInList && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            Already in this list
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
                  data-testid="create-new-list-from-modal"
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
          {lists.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1"
                disabled={
                  addToListsMutation.isPending || selectedLists.size === 0
                }
                data-testid="add-to-lists-submit"
              >
                {addToListsMutation.isPending
                  ? "Adding..."
                  : `Add to ${selectedLists.size} ${
                      selectedLists.size === 1 ? "List" : "Lists"
                    }`}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={addToListsMutation.isPending}
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
