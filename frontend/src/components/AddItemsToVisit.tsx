import { useState, useEffect } from "react";
import { Search, Plus, X, CheckCircle, Camera, FileText, Flag, Lock, Users, Globe, ChevronDown, ChevronUp, AlertCircle, WifiOff } from "lucide-react";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MenuItem, pb, User } from "@/lib/pocketbase";
import { searchMenuItems, createMenuItems } from "@/services/ocrService";
import { logger } from "@/lib/logger";
import MenuScanStep from "@/components/MenuScanStep";
import { visitDraftService } from "@/services/visitDraftService";
import { requestMenuReview, hasPendingReviewRequest } from "@/services/menuReviewService";
import { useSync } from "@/contexts/SyncContext";

interface SelectedItemWithDescription {
  menuItem: MenuItem;
  description: string;
  showDescriptionInput: boolean;
}

interface AddItemsToVisitProps {
  restaurantId: string;
  restaurantName: string;
  parsedItems?: MenuItem[]; // Recently parsed items from scan
  initialSelectedItems?: MenuItem[]; // Pre-selected items for editing
  onComplete: (selectedItems: MenuItem[]) => void;
  onCancel: () => void;
  hideHeader?: boolean; // Hide the header section
  hideScanMenu?: boolean; // Hide scan menu photo option
}

export default function AddItemsToVisit({
  restaurantId,
  restaurantName,
  parsedItems = [],
  initialSelectedItems = [],
  onComplete,
  onCancel,
  hideHeader = false,
  hideScanMenu = false,
}: AddItemsToVisitProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MenuItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<
    Map<string, SelectedItemWithDescription>
  >(new Map());
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualItemName, setManualItemName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [newlyParsedItems, setNewlyParsedItems] = useState<Set<string>>(
    new Set()
  );
  const [reviewRequested, setReviewRequested] = useState(false);
  const [hasPendingReview, setHasPendingReview] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebugData, setShowDebugData] = useState(false);

  // Online/offline status
  const { isOnline } = useSync();

  // Fetch menu items using TanStack Query (supports offline cached items)
  const { data: cachedMenuItems } = useQuery({
    queryKey: ['menu_items', restaurantId],
    queryFn: async () => {
      if (!isOnline) return [];
      return await pb.collection("menu_items").getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: "-created",
      });
    },
    staleTime: 0, // Always refetch when online
    enabled: parsedItems.length === 0, // Only fetch if no parsed items provided
  });

  // Refs for auto-scrolling inputs into view on mobile
  const manualItemInputRef = useScrollIntoView<HTMLInputElement>();
  const descriptionInputRef = useScrollIntoView<HTMLInputElement>();

  // Load initial results only on mount
  useEffect(() => {
    if (parsedItems.length > 0) {
      setSearchResults(parsedItems);
      // Mark parsed items as new
      setNewlyParsedItems(new Set(parsedItems.map((item) => item.id)));
    } else if (cachedMenuItems) {
      // Use cached menu items from TanStack Query (includes offline optimistic items)
      setSearchResults(cachedMenuItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedMenuItems]); // Run when cached items load

  // Restore previously selected items from localStorage OR initialize with pre-selected items
  useEffect(() => {
    // Priority: initialSelectedItems > draft
    if (initialSelectedItems.length > 0) {
      // Initialize with pre-selected items (for editing)
      const initialMap = new Map<string, SelectedItemWithDescription>();
      initialSelectedItems.forEach((item) => {
        initialMap.set(item.id, {
          menuItem: item,
          description: item.description || '',
          showDescriptionInput: false,
        });
      });
      setSelectedItems(initialMap);
    } else {
      const draft = visitDraftService.getDraft();
      if (draft.items.length > 0) {
        // Filter items to only include those from the current restaurant
        const itemsForCurrentRestaurant = draft.items.filter(
          (draftItem) => draftItem.menuItem.restaurant === restaurantId
        );

        if (itemsForCurrentRestaurant.length > 0) {
          // Convert draft items back to Map structure
          const restoredMap = new Map<string, SelectedItemWithDescription>();
          itemsForCurrentRestaurant.forEach((draftItem) => {
            restoredMap.set(draftItem.menuItem.id, {
              menuItem: draftItem.menuItem,
              description: draftItem.description,
              showDescriptionInput: false,
            });
          });
          setSelectedItems(restoredMap);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save selected items to localStorage whenever they change
  useEffect(() => {
    if (selectedItems.size > 0) {
      const items = Array.from(selectedItems.values()).map((selected) => ({
        ...selected.menuItem,
        description: selected.description,
      }));
      visitDraftService.saveItems(items);
    }
  }, [selectedItems]);

  // Check if there's already a pending review request
  useEffect(() => {
    const checkPendingReview = async () => {
      if (!isOnline) {
        // Skip when offline - just assume no pending review
        setHasPendingReview(false);
        return;
      }

      try {
        const pending = await hasPendingReviewRequest(restaurantId);
        setHasPendingReview(pending);
      } catch (error) {
        logger.error("Failed to check pending review:", error);
        setHasPendingReview(false);
      }
    };
    checkPendingReview();
  }, [restaurantId, isOnline]);

  const loadAllMenuItems = async () => {
    if (!isOnline) {
      // Skip loading when offline - just show empty results
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const items = await pb.collection("menu_items").getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: "-created",
      });
      setSearchResults(items);
    } catch (error) {
      logger.error("Failed to load menu items:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      // Show parsed items or all items if no search query
      if (parsedItems.length > 0) {
        setSearchResults(parsedItems);
      } else {
        loadAllMenuItems();
      }
      return;
    }

    if (!isOnline) {
      // When offline, only search in parsed items
      if (parsedItems.length > 0) {
        const filtered = parsedItems.filter(item =>
          item.name.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
      } else {
        setSearchResults([]);
      }
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchMenuItems(restaurantId, query);
      setSearchResults(results);
    } catch (error) {
      logger.error("Search failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleItem = (item: MenuItem) => {
    const newSelected = new Map(selectedItems);

    if (newSelected.has(item.id)) {
      // Deselect
      newSelected.delete(item.id);
    } else {
      // Select
      newSelected.set(item.id, {
        menuItem: item,
        description: "",
        showDescriptionInput: false,
      });
    }

    setSelectedItems(newSelected);
  };

  const handleToggleDescriptionInput = (itemId: string) => {
    const newSelected = new Map(selectedItems);
    const item = newSelected.get(itemId);

    if (item) {
      newSelected.set(itemId, {
        ...item,
        showDescriptionInput: !item.showDescriptionInput,
      });
      setSelectedItems(newSelected);
    }
  };

  const handleUpdateDescription = (itemId: string, description: string) => {
    const newSelected = new Map(selectedItems);
    const item = newSelected.get(itemId);

    if (item) {
      newSelected.set(itemId, {
        ...item,
        description,
      });
      setSelectedItems(newSelected);
    }
  };

  const handleManualAdd = async () => {
    if (!manualItemName.trim()) return;

    if (!isOnline) {
      alert("Adding menu items requires internet connection. You can still proceed with the visit without adding new menu items.");
      return;
    }

    setIsAdding(true);
    try {
      const created = await createMenuItems(
        restaurantId,
        [{ name: manualItemName }],
        undefined, // no sourceImageId for manual adds
        { skipValidation: true, isFromOCR: false } // Skip validation for manual adds
      );

      if (created.length > 0) {
        const newItem = created[0];

        // Auto-select the newly created item
        const newSelected = new Map(selectedItems);
        newSelected.set(newItem.id, {
          menuItem: newItem,
          description: "",
          showDescriptionInput: false,
        });
        setSelectedItems(newSelected);

        setManualItemName("");
        setShowManualAdd(false);

        // Add to search results so it appears
        setSearchResults([newItem, ...searchResults]);
      }
    } catch (error) {
      logger.error("Failed to create menu item:", error);
      alert("Failed to add item. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleComplete = () => {
    if (selectedItems.size === 0) {
      alert("Please add at least one item to your visit.");
      return;
    }

    // Convert Map to array of MenuItems with descriptions
    const items = Array.from(selectedItems.values()).map((selected) => ({
      ...selected.menuItem,
      userDescription: selected.description, // Store user's custom description
    }));
    onComplete(items);
  };

  const handleMenuScanned = (scannedItems: MenuItem[], debugInfo?: any) => {
    // Add newly scanned items to the newly parsed set
    const newIds = new Set([
      ...newlyParsedItems,
      ...scannedItems.map((item) => item.id),
    ]);
    setNewlyParsedItems(newIds);

    // Store debug data if provided
    if (debugInfo) {
      setDebugData(debugInfo);
    }

    // Hide scan menu
    setShowScanMenu(false);

    // Reload all menu items to show the new ones
    loadAllMenuItems();
  };

  const handleScanCancelled = () => {
    setShowScanMenu(false);
  };

  const isParsedItem = (itemId: string) => {
    return newlyParsedItems.has(itemId);
  };

  // Get visibility badge for menu item
  const getVisibilityBadge = (visibility?: 'private' | 'friends' | 'public') => {
    switch (visibility) {
      case 'private':
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Lock className="w-3 h-3 text-gray-600" />
            <span>Private</span>
          </Badge>
        );
      case 'friends':
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Users className="w-3 h-3 text-blue-600" />
            <span>Friends</span>
          </Badge>
        );
      case 'public':
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Globe className="w-3 h-3 text-green-600" />
            <span>Community</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleRequestReview = async () => {
    try {
      await requestMenuReview(
        restaurantId,
        "User reported incorrect menu items"
      );
      // Show green confirmation first
      setReviewRequested(true);

      // After 3 seconds, switch to the persistent "pending review" state
      setTimeout(() => {
        setReviewRequested(false);
        setHasPendingReview(true);
      }, 3000);
    } catch (error) {
      logger.error("Failed to request menu review:", error);
      alert("Failed to request review. Please try again.");
    }
  };

  // Get display results with selected items always on top
  const getDisplayResults = () => {
    // Get all selected items (always show these, even if they don't match search)
    const selectedItemsList = Array.from(selectedItems.values()).map(
      (item) => item.menuItem
    );

    // Get unselected items from search results
    const selectedIds = new Set(selectedItems.keys());
    const unselected = searchResults.filter(
      (item) => !selectedIds.has(item.id)
    );

    // Return selected items first, then unselected
    return [...selectedItemsList, ...unselected];
  };

  const displayResults = getDisplayResults();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      {!hideHeader && (
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">
                Add Items to Your Visit
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {showScanMenu
                  ? `Scan a menu photo to auto-extract items for ${restaurantName}`
                  : `Search and select items you had at ${restaurantName}`}
              </p>
            </div>

            {/* Report incorrect items button */}
            {!showScanMenu && (
              <div className="flex-shrink-0">
                {hasPendingReview ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 px-2 py-1.5 rounded-md">
                    <Flag className="w-4 h-4" />
                    <span>Review requested</span>
                  </div>
                ) : reviewRequested ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1.5 rounded-md animate-in fade-in duration-200">
                    <CheckCircle className="w-4 h-4" />
                    <span>Request submitted</span>
                  </div>
                ) : (
                  <button
                    onClick={handleRequestReview}
                    disabled={reviewRequested}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Report incorrect menu items"
                  >
                    <Flag className="w-4 h-4" />
                    <span>Report items</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Menu Scan Section */}
        {showScanMenu ? (
          <MenuScanStep
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            onItemsExtracted={handleMenuScanned}
            onSkip={handleScanCancelled}
          />
        ) : (
          <div className="space-y-4">
            {/* Persistent Admin Debug View */}
            {(() => {
              const user = pb.authStore.record as User | null;
              const isAdmin = user?.isAdmin === true;

              // Only show for admins when debug data is available
              if (!isAdmin || !debugData) {
                return null;
              }

              return (
                <Card className="border-2 border-purple-500 bg-purple-50">
                  <CardContent className="pt-4 space-y-2">
                    <button
                      onClick={() => setShowDebugData(!showDebugData)}
                      className="w-full flex items-center justify-between text-sm font-semibold text-purple-900"
                    >
                      <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Admin Debug View (Last Gemini Response)
                      </span>
                      {showDebugData ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {showDebugData && (
                      <div className="space-y-3 text-xs">
                        {/* Raw Response */}
                        <div>
                          <div className="font-semibold text-purple-900 mb-1">Raw Response:</div>
                          <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words">
                            {debugData.rawResponse}
                          </pre>
                        </div>

                        {/* Model Info */}
                        <div>
                          <div className="font-semibold text-purple-900 mb-1">Model:</div>
                          <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                            {debugData.model}
                          </div>
                        </div>

                        {/* Candidates Count */}
                        <div>
                          <div className="font-semibold text-purple-900 mb-1">Candidates Count:</div>
                          <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                            {debugData.candidatesCount}
                          </div>
                        </div>

                        {/* Finish Reason */}
                        {debugData.finishReason !== undefined && (
                          <div>
                            <div className="font-semibold text-purple-900 mb-1">Finish Reason:</div>
                            <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                              {JSON.stringify(debugData.finishReason)}
                            </div>
                          </div>
                        )}

                        {/* Parts */}
                        {debugData.parts && debugData.parts.length > 0 && (
                          <div>
                            <div className="font-semibold text-purple-900 mb-1">Parts ({debugData.parts.length}):</div>
                            <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-40">
                              {JSON.stringify(debugData.parts, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Safety Ratings */}
                        {debugData.safetyRatings && (
                          <div>
                            <div className="font-semibold text-purple-900 mb-1">Safety Ratings:</div>
                            <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-40">
                              {JSON.stringify(debugData.safetyRatings, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Full JSON */}
                        <div>
                          <div className="font-semibold text-purple-900 mb-1">Full Debug JSON:</div>
                          <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-60">
                            {JSON.stringify(debugData, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
            {/* Quick Actions Container - Different color */}
            <Card className="border-2 border-blue-200 bg-blue-50/30">
              <CardContent className="space-y-3">
                {/* Scan Menu Button */}
                {!hideScanMenu && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full bg-white"
                      onClick={() => setShowScanMenu(true)}
                      disabled={!isOnline}
                    >
                      {isOnline ? (
                        <>
                          <Camera className="w-4 h-4 mr-2" />
                          Scan Menu Photo
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-4 h-4 mr-2" />
                          Scan Menu (Offline)
                        </>
                      )}
                    </Button>
                    {!isOnline && (
                      <p className="text-xs text-orange-600 text-center">
                        AI menu scanning requires internet connection
                      </p>
                    )}
                  </div>
                )}

                {/* Manual add section */}
                {!showManualAdd ? (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full bg-white"
                      onClick={() => setShowManualAdd(true)}
                      disabled={!isOnline}
                    >
                      {isOnline ? (
                        <><Plus className="w-4 h-4 mr-2" />Can't find it? Add manually</>
                      ) : (
                        <><WifiOff className="w-4 h-4 mr-2" />Add Manually (Offline)</>
                      )}
                    </Button>
                    {!isOnline && (
                      <p className="text-xs text-orange-600 text-center">
                        Adding menu items requires internet connection
                      </p>
                    )}
                  </div>
                ) : (
                  <Card className="border-2 border-blue-500 bg-white">
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="manualItemName">Item Name</Label>
                        <Input
                          ref={manualItemInputRef}
                          id="manualItemName"
                          value={manualItemName}
                          onChange={(e) => setManualItemName(e.target.value)}
                          placeholder="Enter item name"
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleManualAdd()
                          }
                          disabled={!isOnline}
                        />
                      </div>
                      {!isOnline && (
                        <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                          <div className="flex items-center gap-2">
                            <WifiOff className="w-3 h-3" />
                            <span>You're offline. Cannot add new menu items.</span>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={handleManualAdd}
                          disabled={!isOnline || !manualItemName.trim() || isAdding}
                        >
                          {!isOnline ? (
                            <><WifiOff className="w-4 h-4 mr-2" />Add Item (Offline)</>
                          ) : isAdding ? (
                            "Adding..."
                          ) : (
                            <><Plus className="w-4 h-4 mr-2" />Add Item</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowManualAdd(false);
                            setManualItemName("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            {/* Search and Menu Items Container */}
            <Card>
              <CardContent className="space-y-3">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder="Search menu items..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10"
                    data-testid="search-menu-items"
                  />
                </div>

                {/* Search results */}
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 flex items-center justify-between">
                    <span>
                      {searchQuery
                        ? `Search results (${searchResults.length})`
                        : parsedItems.length > 0
                          ? `Recently scanned items (${searchResults.length})`
                          : `All menu items (${searchResults.length})`}
                    </span>
                    {selectedItems.size > 0 && (
                      <span className="text-green-600 font-medium">
                        {selectedItems.size} selected
                      </span>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {isSearching ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
                        <p className="text-gray-500">Searching...</p>
                      </div>
                    ) : displayResults.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        {searchQuery
                          ? "No items found. Try a different search or add manually."
                          : "No items available"}
                      </div>
                    ) : (
                      <>
                        {displayResults.map((item, index) => {
                          const isSelected = selectedItems.has(item.id);
                          const selectedData = selectedItems.get(item.id);
                          const isNew = isParsedItem(item.id);

                          // Check if this is the first unselected item (add divider before it)
                          const showDivider =
                            index > 0 &&
                            !isSelected &&
                            selectedItems.has(displayResults[index - 1].id);

                          return (
                            <div key={item.id}>
                              {showDivider && (
                                <div className="flex items-center gap-2 py-2">
                                  <div className="flex-1 border-t border-gray-300"></div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                                    Other Items
                                  </span>
                                  <div className="flex-1 border-t border-gray-300"></div>
                                </div>
                              )}
                              <div
                                className={`p-3 rounded-lg border transition-all ${
                                  isSelected
                                    ? "border-green-500 bg-green-50"
                                    : "border-gray-200 hover:border-blue-500 hover:bg-blue-50"
                                }`}
                              >
                                <div className="space-y-2">
                                  {/* Item header with toggle */}
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      onClick={() => handleToggleItem(item)}
                                      className="flex-1 text-left min-w-0"
                                    >
                                      <div className="font-medium">
                                        <span>{item.name}</span>
                                      </div>
                                      {item.description && (
                                        <div className="text-sm text-gray-500 mt-1">
                                          {item.description}
                                        </div>
                                      )}
                                      {/* Badges row - below the name */}
                                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                        {isNew && (
                                          <Badge
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            New
                                          </Badge>
                                        )}
                                        {getVisibilityBadge(item.visibility)}
                                      </div>
                                    </button>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <CheckCircle
                                        className={`w-5 h-5 ${
                                          isSelected
                                            ? "text-green-600"
                                            : "text-gray-300"
                                        }`}
                                      />

                                      {/* Add description button (inline, only shown when selected and input not open) */}
                                      {isSelected &&
                                        selectedData &&
                                        !selectedData.showDescriptionInput && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              handleToggleDescriptionInput(
                                                item.id
                                              )
                                            }
                                            className="text-xs"
                                          >
                                            <FileText className="w-3 h-3 mr-1" />
                                            Add description
                                          </Button>
                                        )}
                                    </div>
                                  </div>

                                  {/* Description input (shown when open) */}
                                  {isSelected &&
                                    selectedData &&
                                    selectedData.showDescriptionInput && (
                                      <div className="flex gap-2 bg-white p-2 rounded-md border border-gray-300">
                                        <Input
                                          ref={descriptionInputRef}
                                          placeholder="Add description..."
                                          value={selectedData.description}
                                          onChange={(e) =>
                                            handleUpdateDescription(
                                              item.id,
                                              e.target.value
                                            )
                                          }
                                          className="text-sm bg-white"
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleToggleDescriptionInput(
                                              item.id
                                            )
                                          }
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          {showScanMenu ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowScanMenu(false)}
            >
              Back to Item Selection
            </Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={handleComplete}
                disabled={selectedItems.size === 0}
              >
                Continue to Rating ({selectedItems.size})
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
