import { useState } from "react";
import { COLLECTIONS } from '@/constants/collections';
import {
  Camera,
  CheckCircle,
  Flag,
  Lock,
  Users,
  Globe,
  WifiOff,
} from "lucide-react";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MenuItem, pb } from "@/lib/pocketbase";
import { createMenuItems } from "@/services/ocrService";
import { logger } from "@/lib/logger";
import { useSync } from "@/contexts/SyncContext";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { useMenuItemSelection } from "@/hooks/menu/useMenuItemSelection";
import { useMenuItemSearch } from "@/hooks/menu/useMenuItemSearch";
import { useMenuReviewRequest } from "@/hooks/menu/useMenuReviewRequest";
import {
  MenuItemSearch,
  ManualItemForm,
  OCRMenuIntegration,
} from "@/components/visits/add/add-items";

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
  // ===== HOOKS =====
  const { isOnline } = useSync();
  const isKeyboardVisible = useKeyboardVisible();
  const { handleError, showValidation } = useErrorHandler({
    source: "AddItemsToVisit",
    autoClearMs: 5000,
  });

  // Fetch menu items using TanStack Query (supports offline cached items)
  const { data: cachedMenuItems } = useQuery({
    queryKey: ["menu_items", restaurantId],
    queryFn: async () => {
      if (!isOnline) return [];
      return await pb.collection(COLLECTIONS.MENU_ITEMS).getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: "-created",
      });
    },
    staleTime: 0, // Always refetch when online
    enabled: parsedItems.length === 0, // Only fetch if no parsed items provided
  });

  // Custom hooks for business logic
  const menuItemSelection = useMenuItemSelection({
    restaurantId,
    initialSelectedItems,
  });

  const menuItemSearch = useMenuItemSearch({
    restaurantId,
    parsedItems,
    cachedMenuItems: cachedMenuItems || [],
    isOnline,
  });

  const menuReview = useMenuReviewRequest({
    restaurantId,
    isOnline,
    onError: handleError,
  });

  // ===== LOCAL UI STATE =====
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualItemName, setManualItemName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);

  // ===== REFS =====
  const searchInputRef = useScrollIntoView<HTMLInputElement>();
  const manualItemInputRef = useScrollIntoView<HTMLInputElement>();
  const descriptionInputRef = useScrollIntoView<HTMLInputElement>();

  // ===== HANDLERS =====
  const handleManualAdd = async () => {
    if (!manualItemName.trim()) return;

    if (!isOnline) {
      showValidation(
        "Adding menu items requires internet connection. You can still proceed with the visit without adding new menu items."
      );
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
        menuItemSelection.handleToggleItem(newItem);

        setManualItemName("");
        setShowManualAdd(false);

        // Add to search results so it appears
        menuItemSearch.setSearchResults([
          newItem,
          ...menuItemSearch.searchResults,
        ]);
      }
    } catch (error) {
      logger.error("Failed to create menu item:", error);
      handleError(error as Error, {
        customMessage: "Failed to add item. Please try again.",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleComplete = () => {
    if (menuItemSelection.selectedCount === 0) {
      showValidation("Please add at least one item to your visit.");
      return;
    }

    // Convert Map to array of MenuItems with descriptions
    const items = Array.from(menuItemSelection.selectedItems.values()).map(
      (selected) => ({
        ...selected.menuItem,
        userDescription: selected.description, // Store user's custom description
      })
    );
    onComplete(items);
  };

  const handleMenuScanned = (scannedItems: MenuItem[], debugInfo?: any) => {
    // Add newly scanned items to the newly parsed set
    menuItemSearch.addNewlyParsedItems(scannedItems);

    // Store debug data if provided
    if (debugInfo) {
      setDebugData(debugInfo);
    }

    // Hide scan menu
    setShowScanMenu(false);

    // Reload all menu items to show the new ones
    menuItemSearch.handleSearch("");
  };

  // Get visibility badge for menu item
  const getVisibilityBadge = (
    visibility?: "private" | "friends" | "public"
  ) => {
    switch (visibility) {
      case "private":
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Lock className="w-3 h-3 text-gray-600" />
            <span>Private</span>
          </Badge>
        );
      case "friends":
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Users className="w-3 h-3 text-blue-600" />
            <span>Friends</span>
          </Badge>
        );
      case "public":
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

  // ===== RENDER =====
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
                {menuReview.hasPendingReview ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 px-2 py-1.5 rounded-md">
                    <Flag className="w-4 h-4" />
                    <span>Review requested</span>
                  </div>
                ) : menuReview.reviewRequested ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1.5 rounded-md animate-in fade-in duration-200">
                    <CheckCircle className="w-4 h-4" />
                    <span>Request submitted</span>
                  </div>
                ) : (
                  <button
                    onClick={menuReview.handleRequestReview}
                    disabled={menuReview.reviewRequested}
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
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {showScanMenu ? (
          <OCRMenuIntegration
            showScanMenu={showScanMenu}
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            onItemsExtracted={handleMenuScanned}
            onCancel={() => setShowScanMenu(false)}
            debugData={debugData}
          />
        ) : (
          <div className="space-y-4">
            {/* Admin Debug View */}
            <OCRMenuIntegration
              showScanMenu={false}
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              onItemsExtracted={handleMenuScanned}
              onCancel={() => setShowScanMenu(false)}
              debugData={debugData}
            />

            {/* Quick Actions Container */}
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

                {/* Manual Add Form */}
                <ManualItemForm
                  showManualAdd={showManualAdd}
                  onShowChange={setShowManualAdd}
                  itemName={manualItemName}
                  onItemNameChange={setManualItemName}
                  isAdding={isAdding}
                  onSubmit={handleManualAdd}
                  isOnline={isOnline}
                  manualItemInputRef={manualItemInputRef}
                />
              </CardContent>
            </Card>

            {/* Search and Results */}
            <MenuItemSearch
              searchQuery={menuItemSearch.searchQuery}
              searchResults={menuItemSearch.searchResults}
              isSearching={menuItemSearch.isSearching}
              onSearchChange={menuItemSearch.handleSearch}
              selectedItems={menuItemSelection.selectedItems}
              onToggleItem={menuItemSelection.handleToggleItem}
              onToggleDescriptionInput={
                menuItemSelection.handleToggleDescriptionInput
              }
              onUpdateDescription={menuItemSelection.handleUpdateDescription}
              isParsedItem={menuItemSearch.isParsedItem}
              getVisibilityBadge={getVisibilityBadge}
              parsedItemsCount={parsedItems.length}
              searchInputRef={searchInputRef}
              descriptionInputRef={descriptionInputRef}
            />
          </div>
        )}
      </div>

      {/* Bottom Action Buttons */}
      {!isKeyboardVisible && (
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
                  disabled={menuItemSelection.selectedCount === 0}
                >
                  Continue to Rating ({menuItemSelection.selectedCount})
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
