import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useMatches } from "@tanstack/react-router";
import { pb, type RestaurantList } from "@/lib/pocketbase";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Lock, Users, Globe, ArrowLeft, Search, X, Star } from "lucide-react";
import { repositories } from "@/repositories";
import {
  useRestaurantLists,
  useFriendsLists,
  usePublicLists,
  useDefaultList,
} from "@/hooks/api/useRestaurantLists";
import { restaurantListKeys } from "@/constants/queryKeys";
import { LoadingState } from "@/components/ui/LoadingState";

type ListTab = "my" | "friends" | "public";

interface ListsPageProps {
  onSelectList?: (listId: string) => void;
  onNavigateBack?: () => void;
  onCreateList?: () => void;
}

export default function ListsPage({
  onSelectList,
  onNavigateBack,
  onCreateList,
}: ListsPageProps) {
  const matches = useMatches();
  const queryClient = useQueryClient();
  const user = pb.authStore.record;

  // Tab and search state
  const [activeTab, setActiveTab] = useState<ListTab>("my");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingDefaultList, setIsCreatingDefaultList] = useState(false);

  // Check if we're rendering a child route (list detail, create, or edit page)
  const isOnChildRoute = matches.some(
    (match) =>
      match.routeId === "/lists/$listId" ||
      match.routeId === "/lists/new" ||
      match.routeId === "/lists/$listId/edit" ||
      match.routeId === "/lists/$listId/add-restaurant",
  );

  // Check if user has a default "Saved" list
  const { data: defaultList, isLoading: defaultListLoading } = useDefaultList();

  // Fetch data for all tabs
  const { data: myLists = [], isLoading: myListsLoading } =
    useRestaurantLists();

  // Auto-create default "Saved" list if user doesn't have one
  // Use a ref to prevent multiple effect runs from triggering creation
  const hasTriedCreatingDefault = useRef(false);

  useEffect(() => {
    const createDefaultListIfNeeded = async () => {
      // Skip if already tried, loading, exists, or creating
      if (
        !user ||
        isOnChildRoute ||
        defaultListLoading ||
        defaultList ||
        isCreatingDefaultList ||
        hasTriedCreatingDefault.current
      ) {
        return;
      }

      // Mark as tried to prevent duplicate attempts from this component
      hasTriedCreatingDefault.current = true;
      setIsCreatingDefaultList(true);

      try {
        // createDefaultList is idempotent - it checks for existing list first
        await repositories.restaurantLists.createDefaultList(user.id);
        // Invalidate queries to refresh the lists
        queryClient.invalidateQueries({
          queryKey: restaurantListKeys.all(user.id, undefined),
        });
        queryClient.invalidateQueries({
          queryKey: restaurantListKeys.defaultList(user.id),
        });
      } catch (error) {
        console.error("Failed to create default Saved list:", error);
        // Reset flag so it can try again on next visit if it failed
        hasTriedCreatingDefault.current = false;
      } finally {
        setIsCreatingDefaultList(false);
      }
    };

    createDefaultListIfNeeded();
  }, [user, isOnChildRoute, defaultListLoading, defaultList, isCreatingDefaultList, queryClient]);

  const { data: friendsLists = [], isLoading: friendsListsLoading } =
    useFriendsLists();
  const { data: publicLists = [], isLoading: publicListsLoading } =
    usePublicLists();

  // Get visible lists based on active tab
  const visibleLists = useMemo(() => {
    switch (activeTab) {
      case "my":
        // Sort to put default "Saved" list first
        return [...myLists].sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return new Date(b.updated).getTime() - new Date(a.updated).getTime();
        });
      case "friends":
        return friendsLists;
      case "public":
        return publicLists;
    }
  }, [activeTab, myLists, friendsLists, publicLists]);

  // Fetch list items count for visible lists
  const { data: listItemCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["list_items_counts", visibleLists.map((l) => l.id)],
    queryFn: async () => {
      const counts: Record<string, number> = {};

      // Initialize counts to 0 for all visible lists
      visibleLists.forEach((list) => {
        counts[list.id] = 0;
      });

      if (visibleLists.length === 0) return counts;

      // Batch requests in chunks of 50 to avoid URL length limits
      const chunkSize = 50;
      for (let i = 0; i < visibleLists.length; i += chunkSize) {
        const chunk = visibleLists.slice(i, i + chunkSize);

        // Construct filter: (list = "id1" || list = "id2" || ...)
        const filter = chunk.map((l) => `list="${l.id}"`).join("||");

        if (!filter) continue;

        // Fetch only the 'list' field to minimize payload size
        // optimize: batch request to avoid N+1 problem
        const items = await repositories.listItems.getFullList({
          filter: `(${filter})`,
          fields: 'list',
        });

        // Aggregate counts
        for (const item of items) {
          if (counts[item.list] !== undefined) {
            counts[item.list]++;
          }
        }
      }

      return counts;
    },
    enabled: visibleLists.length > 0 && !isOnChildRoute,
  });

  // Filter lists by search query (client-side for responsiveness)
  const filteredLists = useMemo(() => {
    if (!searchQuery.trim()) return visibleLists;
    const query = searchQuery.toLowerCase();
    return visibleLists.filter(
      (list) =>
        list.name.toLowerCase().includes(query) ||
        list.description?.toLowerCase().includes(query),
    );
  }, [visibleLists, searchQuery]);

  // Loading state based on active tab
  const isLoading = useMemo(() => {
    switch (activeTab) {
      case "my":
        return myListsLoading;
      case "friends":
        return friendsListsLoading;
      case "public":
        return publicListsLoading;
    }
  }, [activeTab, myListsLoading, friendsListsLoading, publicListsLoading]);

  // If we're on a child route, just render the Outlet
  if (isOnChildRoute) {
    return <Outlet />;
  }

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

  const getOwnerName = (list: RestaurantList) => {
    if (!list.expand?.user) return "Unknown";
    return (
      list.expand.user.name ||
      list.expand.user.email?.split("@")[0] ||
      "Unknown"
    );
  };

  const renderListCard = (list: RestaurantList, showOwner: boolean = false) => (
    <Card
      key={list.id}
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        list.isDefault ? 'border-yellow-300 bg-yellow-50/30' : ''
      }`}
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
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {list.isDefault && (
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            )}
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
            {listItemCounts[list.id] === 1 ? "restaurant" : "restaurants"}
          </span>
          {showOwner && (
            <>
              <span className="text-gray-400">•</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {getOwnerName(list)}
              </span>
            </>
          )}
        </div>
      </CardHeader>
    </Card>
  );

  const renderEmptyState = () => {
    if (activeTab === "my") {
      return (
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
          <Button onClick={onCreateList} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Your First List
          </Button>
        </div>
      );
    }

    if (activeTab === "friends") {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No friends' lists
          </h3>
          <p className="text-sm text-gray-600 max-w-sm">
            Add friends to see their shared restaurant lists
          </p>
        </div>
      );
    }

    // Public tab
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Globe className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No public lists
        </h3>
        <p className="text-sm text-gray-600 max-w-sm">
          Public lists from other users will appear here
        </p>
      </div>
    );
  };

  const renderNoSearchResults = () => (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Search className="w-12 h-12 text-gray-300 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        No matching lists
      </h3>
      <p className="text-sm text-gray-600 mb-4">Try a different search term</p>
      <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
        Clear Search
      </Button>
    </div>
  );

  const renderTabContent = (showOwner: boolean) => {
    if (isLoading) {
      return <LoadingState message="Loading lists..." />;
    }

    if (filteredLists.length === 0) {
      return searchQuery ? renderNoSearchResults() : renderEmptyState();
    }

    return (
      <div className="space-y-3">
        {filteredLists.map((list) => renderListCard(list, showOwner))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateBack}
              className="p-2"
              data-testid="lists-back-button"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Lists</h1>
          </div>
          {activeTab === "my" && (
            <Button
              onClick={onCreateList}
              size="sm"
              className="flex items-center gap-2"
              data-testid="create-list-button"
            >
              <Plus className="w-4 h-4" />
              New List
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as ListTab);
          setSearchQuery("");
        }}
        className="flex-1 flex flex-col gap-0"
      >
        <TabsList className="w-full justify-start bg-white border-b px-4 p-2 rounded-none h-auto">
          <TabsTrigger
            value="my"
            className="flex-1 data-[state=active]:bg-gray-100"
          >
            My Lists
            <span className="ml-1 text-xs text-gray-500">
              ({myLists.length})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="friends"
            className="flex-1 data-[state=active]:bg-gray-100"
          >
            Friends
            <span className="ml-1 text-xs text-gray-500">
              ({friendsLists.length})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="public"
            className="flex-1 data-[state=active]:bg-gray-100"
          >
            Public
            <span className="ml-1 text-xs text-gray-500">
              ({publicLists.length})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Search Bar */}
        <div className="bg-white px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          <TabsContent value="my" className="m-0 p-4 h-full">
            {renderTabContent(false)}
          </TabsContent>

          <TabsContent value="friends" className="m-0 p-4 h-full">
            {renderTabContent(true)}
          </TabsContent>

          <TabsContent value="public" className="m-0 p-4 h-full">
            {renderTabContent(true)}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
