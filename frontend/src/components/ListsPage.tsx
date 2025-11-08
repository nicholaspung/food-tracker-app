import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, RestaurantList, ListItem } from "@/lib/pocketbase";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Lock, Users, Globe, Image } from "lucide-react";
import CreateListDialog from "./CreateListDialog";

interface ListsPageProps {
  onSelectList?: (listId: string) => void;
}

export default function ListsPage({ onSelectList }: ListsPageProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
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
    enabled: !!user,
  });

  // Fetch list items count for each list
  const { data: listItemCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["list_items_counts", lists.map((l) => l.id)],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const list of lists) {
        const items = await pb.collection("list_items").getFullList({
          filter: `list = "${list.id}"`,
        });
        counts[list.id] = items.length;
      }
      return counts;
    },
    enabled: lists.length > 0,
  });

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

  const getCoverImageUrl = (list: RestaurantList) => {
    if (!list.coverImage) return null;
    return pb.files.getURL(list, list.coverImage, { thumb: "300x200" });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Lists</h1>
            <p className="text-sm text-gray-500 mt-1">
              {lists.length} {lists.length === 1 ? "list" : "lists"}
            </p>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            size="sm"
            className="flex items-center gap-2"
            data-testid="create-list-button"
          >
            <Plus className="w-4 h-4" />
            New List
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-500">Loading lists...</p>
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No lists yet
            </h3>
            <p className="text-sm text-gray-600 mb-6 max-w-sm">
              Create your first list to organize your favorite restaurants
            </p>
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Your First List
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {lists.map((list) => (
              <Card
                key={list.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onSelectList?.(list.id)}
                data-testid={`list-card-${list.id}`}
              >
                {list.coverImage && (
                  <div className="w-full h-32 overflow-hidden rounded-t-lg">
                    <img
                      src={getCoverImageUrl(list) || ""}
                      alt={list.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {!list.coverImage && (
                  <div className="w-full h-32 bg-gradient-to-br from-blue-100 to-purple-100 rounded-t-lg flex items-center justify-center">
                    <Image className="w-12 h-12 text-gray-400" />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {list.name}
                      {getVisibilityIcon(list.visibility)}
                    </CardTitle>
                  </div>
                  {list.description && (
                    <CardDescription className="line-clamp-2">
                      {list.description}
                    </CardDescription>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                    <span>
                      {listItemCounts[list.id] || 0}{" "}
                      {listItemCounts[list.id] === 1
                        ? "restaurant"
                        : "restaurants"}
                    </span>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create List Dialog */}
      <CreateListDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["restaurant_lists"] });
        }}
      />
    </div>
  );
}
