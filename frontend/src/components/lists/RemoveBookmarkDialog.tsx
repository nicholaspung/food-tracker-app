import { useState, useMemo } from "react";
import { ListItem, RestaurantList } from "@/lib/pocketbase";
import { useRemoveFromList, findListItemsWithSourceUser } from "@/hooks/offline/useRemoveFromList";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Lock, Users, Globe, BookmarkMinus } from "lucide-react";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";

interface RemoveBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  restaurantName: string;
  sourceUserId: string;
  sourceUserName: string;
  userListItems: ListItem[];
  userLists: RestaurantList[];
}

export default function RemoveBookmarkDialog({
  open,
  onOpenChange,
  restaurantId,
  restaurantName,
  sourceUserId,
  sourceUserName,
  userListItems,
  userLists,
}: RemoveBookmarkDialogProps) {
  const [selectedListItemIds, setSelectedListItemIds] = useState<Set<string>>(new Set());
  const { error, handleError, clearError, showSuccess } = useErrorHandler({
    source: 'RemoveBookmarkDialog',
    defaultSeverity: 'error',
  });

  const removeFromListMutation = useRemoveFromList({
    onError: (err) => {
      handleError(err, { customMessage: "Failed to remove bookmark" });
    },
  });

  // Find list items that contain food items from this source user for this restaurant
  const matchingListItems = useMemo(() => {
    return findListItemsWithSourceUser(userListItems, restaurantId, sourceUserId);
  }, [userListItems, restaurantId, sourceUserId]);

  // Create a map of list IDs to list names for display
  const listMap = useMemo(() => {
    return new Map(userLists.map((list) => [list.id, list]));
  }, [userLists]);

  const toggleListItem = (listItemId: string) => {
    const newSelected = new Set(selectedListItemIds);
    if (newSelected.has(listItemId)) {
      newSelected.delete(listItemId);
    } else {
      newSelected.add(listItemId);
    }
    setSelectedListItemIds(newSelected);
  };

  const handleRemove = async () => {
    if (selectedListItemIds.size === 0) return;
    clearError();

    try {
      // Remove items from all selected list items
      const removePromises = matchingListItems
        .filter((item) => selectedListItemIds.has(item.listItem.id))
        .map((item) =>
          removeFromListMutation.mutateAsync({
            listItemId: item.listItem.id,
            itemIdsToRemove: item.matchingItemIds,
          })
        );

      await Promise.all(removePromises);
      showSuccess(`Removed from ${selectedListItemIds.size} ${selectedListItemIds.size === 1 ? 'list' : 'lists'}`);

      // Reset and close
      setTimeout(() => {
        setSelectedListItemIds(new Set());
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

  // Reset state when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedListItemIds(new Set());
      clearError();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkMinus className="w-5 h-5 text-red-500" />
            Remove Bookmark
          </DialogTitle>
          <DialogDescription>
            Remove "{restaurantName}" items from {sourceUserName} from your lists
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {matchingListItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No saved items found from {sourceUserName} for this restaurant.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Select the lists to remove from:
              </p>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {matchingListItems.map(({ listItem, matchingItemIds }) => {
                  const list = listMap.get(listItem.list);
                  if (!list) return null;

                  return (
                    <div
                      key={listItem.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        selectedListItemIds.has(listItem.id)
                          ? "border-red-500 bg-red-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Checkbox
                        id={`remove-list-${listItem.id}`}
                        checked={selectedListItemIds.has(listItem.id)}
                        onCheckedChange={() => toggleListItem(listItem.id)}
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`remove-list-${listItem.id}`}
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
                        <p className="text-xs text-gray-500 mt-1">
                          {matchingItemIds.length} {matchingItemIds.length === 1 ? 'item' : 'items'} from {sourceUserName}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Error Message */}
          <ErrorDisplay error={error} onClear={clearError} />

          {/* Actions */}
          {matchingListItems.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleRemove}
                variant="destructive"
                className="flex-1"
                disabled={removeFromListMutation.isPending || selectedListItemIds.size === 0}
              >
                {removeFromListMutation.isPending
                  ? "Removing..."
                  : `Remove from ${selectedListItemIds.size} ${
                      selectedListItemIds.size === 1 ? "List" : "Lists"
                    }`}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={removeFromListMutation.isPending}
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
