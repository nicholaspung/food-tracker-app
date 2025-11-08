import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList, ListItem, Restaurant } from "@/lib/pocketbase";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Lock,
  Users,
  Globe,
  Trash2,
  MapPin,
  Plus,
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
import AddRestaurantToListModal from "./AddRestaurantToListModal";

interface ListDetailPageProps {
  listId: string;
  onNavigateBack?: () => void;
}

export default function ListDetailPage({ listId, onNavigateBack }: ListDetailPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ListItem | null>(null);
  const [listToDelete, setListToDelete] = useState(false);
  const [addRestaurantModalOpen, setAddRestaurantModalOpen] = useState(false);
  const user = pb.authStore.record;

  // Fetch list details
  const { data: list, isLoading: listLoading } = useQuery<RestaurantList>({
    queryKey: ["restaurant_list", listId],
    queryFn: async () => {
      return await pb.collection("restaurant_lists").getOne(listId);
    },
  });

  // Fetch list items with expanded restaurant and recommended items data
  const { data: listItems = [], isLoading: itemsLoading } = useQuery<
    ListItem[]
  >({
    queryKey: ["list_items", listId],
    queryFn: async () => {
      return await pb.collection("list_items").getFullList({
        filter: `list = "${listId}"`,
        sort: "position",
        expand: "restaurant,recommendedItems",
      });
    },
    enabled: !!list,
  });

  // Delete list item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await pb.collection("list_items").delete(itemId);
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
      await pb.collection("restaurant_lists").delete(listId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_lists"] });
      onNavigateBack?.();
    },
  });

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
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateBack}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
              {getVisibilityIcon(list.visibility)}
            </div>
            {list.description && (
              <p className="text-sm text-gray-600 mt-1">{list.description}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {listItems.length} {listItems.length === 1 ? "restaurant" : "restaurants"}
            </p>
          </div>
        </div>

        {/* Actions (only for owner) */}
        {isOwner && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setAddRestaurantModalOpen(true)}
              className="flex items-center gap-2"
              data-testid="add-restaurant-button"
            >
              <Plus className="w-4 h-4" />
              Add Restaurant
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteList}
              className="flex items-center gap-2"
              data-testid="delete-list-button"
            >
              <Trash2 className="w-4 h-4" />
              Delete List
            </Button>
          </div>
        )}
      </div>

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
                onClick={() => setAddRestaurantModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Your First Restaurant
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {listItems.map((item, index) => {
              const restaurant = item.expand?.restaurant as Restaurant;
              const recommendedItems = item.expand?.recommendedItems || [];
              if (!restaurant) return null;

              return (
                <Card
                  key={item.id}
                  className="hover:shadow-md transition-shadow"
                  data-testid={`list-item-${item.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div
                          className="cursor-pointer"
                          onClick={() =>
                            navigate({ to: `/restaurants/${restaurant.id}` })
                          }
                        >
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

                        {/* Recommended Items */}
                        {recommendedItems.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-700 mb-2">
                              Recommended Items:
                            </p>
                            <div className="space-y-1">
                              {recommendedItems.map((foodItem: any) => (
                                <div
                                  key={foodItem.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                                  <span className="text-gray-900 font-medium">
                                    {foodItem.name}
                                  </span>
                                  <span className="text-gray-500">
                                    ({foodItem.rating}/5)
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Note */}
                        {item.note && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-sm text-gray-700 italic">
                              "{item.note}"
                            </p>
                          </div>
                        )}
                      </div>
                      {isOwner && (
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

      {/* Add Restaurant Modal */}
      <AddRestaurantToListModal
        open={addRestaurantModalOpen}
        onOpenChange={setAddRestaurantModalOpen}
        listId={listId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["list_items", listId] });
        }}
      />

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
    </div>
  );
}
