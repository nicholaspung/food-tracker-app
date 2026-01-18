import { Search, CheckCircle, FileText, X, Pencil, Check, Lock, Users, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MenuItem, pb } from "@/lib/pocketbase";

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

  // Initial items (for edit mode - items that were originally selected)
  initiallySelectedItems?: MenuItem[];

  // Edit menu item state (optional - for editing user-created items)
  editingMenuItemId?: string | null;
  editingMenuItemName?: string;
  editingMenuItemVisibility?: "private" | "friends" | "public";
  onEditingMenuItemIdChange?: (id: string | null) => void;
  onEditingMenuItemNameChange?: (name: string) => void;
  onEditingMenuItemVisibilityChange?: (visibility: "private" | "friends" | "public") => void;
  onEditMenuItem?: (id: string) => Promise<void>;
  isEditingMenuItem?: boolean;

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
  initiallySelectedItems = [],
  editingMenuItemId,
  editingMenuItemName = "",
  editingMenuItemVisibility = "private",
  onEditingMenuItemIdChange,
  onEditingMenuItemNameChange,
  onEditingMenuItemVisibilityChange,
  onEditMenuItem,
  isEditingMenuItem = false,
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

    // Track all IDs we've already added
    const includedIds = new Set(selectedItems.keys());

    // Get unselected items from search results
    const unselected = searchResults.filter(
      (item) => !includedIds.has(item.id)
    );
    unselected.forEach((item) => includedIds.add(item.id));

    // Also include initially selected items that are no longer selected
    // (for edit mode - ensures de-selected items remain visible)
    const initiallyUnselected = initiallySelectedItems.filter(
      (item) => !includedIds.has(item.id)
    );

    // Return selected items first, then unselected (including initially selected)
    return [...selectedItemsList, ...unselected, ...initiallyUnselected];
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
                  const isUserCreated = item.createdBy === pb.authStore.model?.id;
                  const isEditing = editingMenuItemId === item.id;

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
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "border-green-500 bg-green-50"
                            : "border-gray-200 hover:border-blue-500 hover:bg-blue-50"
                        }`}
                        onClick={() => !isEditing && onToggleItem(item)}
                      >
                        <div className="space-y-2">
                          {/* Item header with toggle */}
                          {isEditing ? (
                            /* Inline editing mode */
                            <div className="space-y-3">
                              {/* Name input row */}
                              <div className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  value={editingMenuItemName}
                                  onChange={(e) =>
                                    onEditingMenuItemNameChange?.(e.target.value)
                                  }
                                  placeholder="Menu item name"
                                  className="flex-1"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      onEditMenuItem?.(item.id);
                                    } else if (e.key === "Escape") {
                                      onEditingMenuItemIdChange?.(null);
                                      onEditingMenuItemNameChange?.("");
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditMenuItem?.(item.id);
                                  }}
                                  disabled={
                                    !editingMenuItemName.trim() ||
                                    isEditingMenuItem
                                  }
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditingMenuItemIdChange?.(null);
                                    onEditingMenuItemNameChange?.("");
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Visibility selector row */}
                              <div className="space-y-2">
                                <span className="text-xs text-gray-500 font-medium">Visibility</span>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditingMenuItemVisibilityChange?.("private");
                                    }}
                                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all border ${
                                      editingMenuItemVisibility === "private"
                                        ? "bg-gray-900 text-white border-gray-900"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                    }`}
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                    <span>Private</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditingMenuItemVisibilityChange?.("friends");
                                    }}
                                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all border ${
                                      editingMenuItemVisibility === "friends"
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                    }`}
                                  >
                                    <Users className="h-3.5 w-3.5" />
                                    <span>Friends</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditingMenuItemVisibilityChange?.("public");
                                    }}
                                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all border ${
                                      editingMenuItemVisibility === "public"
                                        ? "bg-green-600 text-white border-green-600"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                    }`}
                                  >
                                    <Globe className="h-3.5 w-3.5" />
                                    <span>Public</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Normal display mode */
                            <div className="space-y-2">
                              {/* Row 1: Name and checkmark */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium leading-snug">
                                    {item.name}
                                  </div>
                                  {item.description && (
                                    <div className="text-sm text-gray-500 mt-1">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                                <CheckCircle
                                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                                    isSelected
                                      ? "text-green-600"
                                      : "text-gray-300"
                                  }`}
                                />
                              </div>

                              {/* Row 2: Badges and edit button */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isNew && (
                                    <Badge variant="secondary" className="text-xs">
                                      New
                                    </Badge>
                                  )}
                                  {getVisibilityBadge(item.visibility)}
                                </div>

                                {isUserCreated && onEditingMenuItemIdChange && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditingMenuItemIdChange(item.id);
                                      onEditingMenuItemNameChange?.(item.name);
                                      onEditingMenuItemVisibilityChange?.(item.visibility || "private");
                                    }}
                                    className="h-7 px-2 text-xs text-gray-500"
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                )}
                              </div>

                              {/* Row 3: Add description button (only when selected) */}
                              {isSelected &&
                                selectedData &&
                                !selectedData.showDescriptionInput && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleDescriptionInput(item.id);
                                    }}
                                    className="w-full text-xs h-8"
                                  >
                                    <FileText className="w-3 h-3 mr-1.5" />
                                    Add description
                                  </Button>
                                )}
                            </div>
                          )}

                          {/* Description input (shown when open) */}
                          {isSelected &&
                            selectedData &&
                            selectedData.showDescriptionInput && (
                              <div
                                className="flex gap-2 bg-white p-2 rounded-md border border-gray-300"
                                onClick={(e) => e.stopPropagation()}
                              >
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
