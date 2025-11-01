import { useState, useEffect } from "react";
import { Search, Plus, X, CheckCircle, Camera, FileText } from "lucide-react";
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
import { MenuItem, pb } from "@/lib/pocketbase";
import { searchMenuItems, createMenuItems } from "@/services/ocrService";
import { logger } from "@/lib/logger";
import MenuScanStep from "@/components/MenuScanStep";
import { visitDraftService } from "@/services/visitDraftService";

interface SelectedItemWithDescription {
  menuItem: MenuItem;
  description: string;
  showDescriptionInput: boolean;
}

interface AddItemsToVisitProps {
  restaurantId: string;
  restaurantName: string;
  parsedItems?: MenuItem[]; // Recently parsed items from scan
  onComplete: (selectedItems: MenuItem[]) => void;
  onCancel: () => void;
}

export default function AddItemsToVisit({
  restaurantId,
  restaurantName,
  parsedItems = [],
  onComplete,
  onCancel,
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

  // Load initial results only on mount
  useEffect(() => {
    if (parsedItems.length > 0) {
      setSearchResults(parsedItems);
      // Mark parsed items as new
      setNewlyParsedItems(new Set(parsedItems.map((item) => item.id)));
    } else {
      // Load all menu items if no parsed items
      loadAllMenuItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Restore previously selected items from localStorage
  useEffect(() => {
    const draft = visitDraftService.getDraft();
    if (draft.items.length > 0) {
      // Convert draft items back to Map structure
      const restoredMap = new Map<string, SelectedItemWithDescription>();
      draft.items.forEach((draftItem) => {
        restoredMap.set(draftItem.menuItem.id, {
          menuItem: draftItem.menuItem,
          description: draftItem.description,
          showDescriptionInput: false,
        });
      });
      setSelectedItems(restoredMap);
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

  const loadAllMenuItems = async () => {
    setIsSearching(true);
    try {
      const items = await pb.collection("menu_items").getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: "-created",
      });
      setSearchResults(items);
    } catch (error) {
      logger.error("Failed to load menu items:", error);
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

    setIsSearching(true);
    try {
      const results = await searchMenuItems(restaurantId, query);
      setSearchResults(results);
    } catch (error) {
      logger.error("Search failed:", error);
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

  const handleMenuScanned = (scannedItems: MenuItem[]) => {
    // Add newly scanned items to the newly parsed set
    const newIds = new Set([
      ...newlyParsedItems,
      ...scannedItems.map((item) => item.id),
    ]);
    setNewlyParsedItems(newIds);

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
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Add Items to Your Visit
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {showScanMenu
            ? `Scan a menu photo to auto-extract items for ${restaurantName}`
            : `Search and select items you had at ${restaurantName}`}
        </p>
      </div>

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
            {/* Quick Actions Container - Different color */}
            <Card className="border-2 border-blue-200 bg-blue-50/30">
              <CardContent className="space-y-3">
                {/* Scan Menu Button */}
                <Button
                  variant="outline"
                  className="w-full bg-white"
                  onClick={() => setShowScanMenu(true)}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Scan Menu Photo
                </Button>

                {/* Manual add section */}
                {!showManualAdd ? (
                  <Button
                    variant="outline"
                    className="w-full bg-white"
                    onClick={() => setShowManualAdd(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Can't find it? Add manually
                  </Button>
                ) : (
                  <Card className="border-2 border-blue-500 bg-white">
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="manualItemName">Item Name</Label>
                        <Input
                          id="manualItemName"
                          value={manualItemName}
                          onChange={(e) => setManualItemName(e.target.value)}
                          placeholder="Enter item name"
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleManualAdd()
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={handleManualAdd}
                          disabled={!manualItemName.trim() || isAdding}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {isAdding ? "Adding..." : "Add Item"}
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
                                      <div className="font-medium flex items-center gap-2">
                                        {item.name}
                                        {isNew && (
                                          <Badge
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            New
                                          </Badge>
                                        )}
                                      </div>
                                      {item.description && (
                                        <div className="text-sm text-gray-500 mt-1">
                                          {item.description}
                                        </div>
                                      )}
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
