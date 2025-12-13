import { Search, CheckCircle, FileText, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MenuItem } from "@/lib/pocketbase";

interface SelectedItemWithDescription {
  menuItem: MenuItem;
  description: string;
  showDescriptionInput: boolean;
}

interface MenuItemSearchProps {
  // Search state
  searchQuery: string;
  searchResults: MenuItem[];
  isSearching: boolean;
  onSearchChange: (query: string) => void;

  // Selection state
  selectedItems: Map<string, SelectedItemWithDescription>;
  onToggleItem: (item: MenuItem) => void;
  onToggleDescriptionInput: (itemId: string) => void;
  onUpdateDescription: (itemId: string, description: string) => void;

  // Display helpers
  isParsedItem: (itemId: string) => boolean;
  getVisibilityBadge: (
    visibility?: "private" | "friends" | "public"
  ) => React.JSX.Element | null;

  // Additional context
  parsedItemsCount?: number;

  // Refs for mobile scrolling
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  descriptionInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function MenuItemSearch({
  searchQuery,
  searchResults,
  isSearching,
  onSearchChange,
  selectedItems,
  onToggleItem,
  onToggleDescriptionInput,
  onUpdateDescription,
  isParsedItem,
  getVisibilityBadge,
  parsedItemsCount = 0,
  searchInputRef,
  descriptionInputRef,
}: MenuItemSearchProps) {
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
    <Card>
      <CardContent className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            ref={searchInputRef}
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
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
                : parsedItemsCount > 0
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
                              onClick={() => onToggleItem(item)}
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
                                  <Badge variant="secondary" className="text-xs">
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
                                      onToggleDescriptionInput(item.id)
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
                                    onUpdateDescription(item.id, e.target.value)
                                  }
                                  className="text-sm bg-white"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    onToggleDescriptionInput(item.id)
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
  );
}
