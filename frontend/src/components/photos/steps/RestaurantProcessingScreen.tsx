import { useRef, memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Camera,
  Check,
  X,
  Pencil,
  WifiOff,
  Lock,
  Users,
  Globe,
} from "lucide-react";
import { PhotoToProcess, RestaurantStats } from "@/types/photos";
import { Restaurant, MenuItem, pb } from "@/lib/pocketbase";
import { RestaurantSelector } from "@/components/photos/restaurant/RestaurantSelector";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import { RatingSelector } from "@/components/ui/RatingSelector";
import MenuItemPhotoInput from "@/components/visits/shared/MenuItemPhotoInput";
import { format } from "date-fns";
import { useOfflineVisitCreation } from "@/hooks/offline/useOfflineVisitCreation";
import { useOfflineRestaurantCreation } from "@/hooks/offline/useOfflineRestaurantCreation";

interface RestaurantProcessingScreenProps {
  // Photo data
  currentPhoto: PhotoToProcess;
  currentPhotoIndex: number;
  totalPhotos: number;

  // Restaurant state
  selectedRestaurant: Restaurant | null;
  restaurants: Restaurant[];
  restaurantSearchQuery: string;
  locationSearchQuery: string;
  onRestaurantSearchChange: (q: string) => void;
  onLocationSearchChange: (q: string) => void;
  onRestaurantSelected: (r: Restaurant | null) => void;
  previousRestaurant: Restaurant | null;
  onUsePreviousRestaurant: () => void;
  showSameAsAbove: boolean;

  // Menu item state
  selectedMenuItem: MenuItem | null;
  menuItems: MenuItem[];
  menuItemName: string;
  menuItemSearchQuery: string;
  menuItemSelectionMode: "search" | "scan" | "create";
  usedMenuItemNames: string[]; // Menu items already used in other photos for this restaurant
  onMenuItemSelected: (item: MenuItem | null) => void;
  onMenuItemNameChange: (name: string) => void;
  onMenuItemSearchChange: (q: string) => void;
  onMenuItemModeChange: (mode: "search" | "scan" | "create") => void;

  // Edit menu item state
  editingMenuItemId: string | null;
  editingMenuItemName: string;
  editingMenuItemVisibility: "private" | "friends" | "public";
  onEditingMenuItemIdChange: (id: string | null) => void;
  onEditingMenuItemNameChange: (name: string) => void;
  onEditingMenuItemVisibilityChange: (visibility: "private" | "friends" | "public") => void;
  onEditMenuItem: (id: string) => Promise<void>;

  // Menu item photo
  menuItemPhotoPreview: string | null;
  onMenuItemPhotoCapture: (keyOrFile: File, file?: File) => void;
  onMenuItemPhotoRemove: (key?: undefined) => void;

  // OCR state
  ocrStatus: "idle" | "preprocessing" | "compressing" | "uploading" | "processing" | "complete" | "error";
  ocrProgress: number;
  scannedMenuItems: MenuItem[];
  ocrError: string | null;

  // Rating & notes
  rating: number | null;
  notes: string;
  photoDate: Date;
  onRatingChange: (r: number | null) => void;
  onNotesChange: (notes: string) => void;
  onPhotoDateChange: (date: Date) => void;

  // Actions
  onCreateMenuItem: () => Promise<void>;
  onSubmitCurrent: () => void;
  onPrevious: () => void;
  onFullscreenPhoto: (url: string, name: string) => void;

  // UI state
  isProcessing: boolean;
  isKeyboardVisible: boolean;
  isOnline: boolean;
  isRestoringData: boolean;
  canSubmit: boolean;
  isLegendExpanded: boolean;
  onLegendExpandedChange: (expanded: boolean) => void;

  // Mutations
  restaurantCreationMutation: ReturnType<typeof useOfflineRestaurantCreation>;
  visitCreationMutation: ReturnType<typeof useOfflineVisitCreation>;

  // Error handlers
  onShowValidation?: (message: string) => void;
  onHandleError?: (error: Error, options?: { customMessage?: string }) => void;

  // Restaurant stats
  getRestaurantStats?: (restaurantId: string) => RestaurantStats;

  // Camera mode
  onOpenCamera: () => void;
}

/**
 * Restaurant Processing Screen - Complex form for processing restaurant visit photos
 *
 * Features:
 * - Restaurant selection (via RestaurantSelector component)
 * - Menu item selection with 3 modes: Search, Scan (OCR), Create
 * - Rating and notes
 * - Photo date picker
 * - Progress tracking
 */
function RestaurantProcessingScreenComponent(props: RestaurantProcessingScreenProps) {
  const {
    currentPhoto,
    currentPhotoIndex,
    totalPhotos,
    // Restaurant
    selectedRestaurant,
    restaurants,
    restaurantSearchQuery,
    locationSearchQuery,
    onRestaurantSearchChange,
    onLocationSearchChange,
    onRestaurantSelected,
    previousRestaurant,
    onUsePreviousRestaurant,
    showSameAsAbove,
    // Menu item
    selectedMenuItem,
    menuItems,
    menuItemName,
    menuItemSearchQuery,
    menuItemSelectionMode,
    usedMenuItemNames,
    onMenuItemSelected,
    onMenuItemNameChange,
    onMenuItemSearchChange,
    onMenuItemModeChange,
    // Edit menu item
    editingMenuItemId,
    editingMenuItemName,
    editingMenuItemVisibility,
    onEditingMenuItemIdChange,
    onEditingMenuItemNameChange,
    onEditingMenuItemVisibilityChange,
    onEditMenuItem,
    // Menu item photo
    menuItemPhotoPreview,
    onMenuItemPhotoCapture,
    onMenuItemPhotoRemove,
    // OCR
    ocrStatus,
    ocrProgress,
    scannedMenuItems,
    ocrError,
    // Rating & notes
    rating,
    notes,
    photoDate,
    onRatingChange,
    onNotesChange,
    onPhotoDateChange,
    // Actions
    onCreateMenuItem,
    onSubmitCurrent,
    onPrevious,
    onFullscreenPhoto,
    // UI state
    isProcessing,
    isKeyboardVisible,
    isOnline,
    isRestoringData,
    canSubmit,
    isLegendExpanded,
    onLegendExpandedChange,
    // Mutations
    restaurantCreationMutation,
    visitCreationMutation,
    // Error handlers
    onShowValidation,
    onHandleError,
    // Restaurant stats
    getRestaurantStats,
    // Camera mode
    onOpenCamera,
  } = props;

  // Refs for auto-scrolling
  const menuItemCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLDivElement>(null);

  const scrollToDateCard = () => {
    setTimeout(() => {
      dateCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 100);
  };

  // Adapter functions for MenuItemPhotoInput
  // The component expects (key, file) but usePhotoManager in single mode provides (file, file?)
  const handlePhotoCapture = (_key: string | number, file: File) => {
    onMenuItemPhotoCapture(file);
  };

  const handlePhotoRemove = (_key: string | number) => {
    onMenuItemPhotoRemove();
  };

  // Filter menu items - exclude already used items for this restaurant
  const filteredMenuItems = menuItemSelectionMode === "scan"
    ? scannedMenuItems
    : menuItems.filter(
        (item) =>
          item.name.toLowerCase().includes(menuItemSearchQuery.toLowerCase()) &&
          !usedMenuItemNames.includes(item.name.toLowerCase())
      );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Process Saved Photos
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Photo {currentPhotoIndex + 1} of {totalPhotos}
        </p>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full mt-3">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{
              width: `${((currentPhotoIndex + 1) / totalPhotos) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {/* Photo Preview */}
        <div className="mb-4" key={currentPhoto.id}>
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity">
            <img
              src={currentPhoto.previewUrl}
              alt="Food photo"
              className="w-full h-full object-contain"
              onClick={() =>
                onFullscreenPhoto(
                  currentPhoto.previewUrl,
                  menuItemName || selectedMenuItem?.name || "Photo"
                )
              }
            />
          </div>
        </div>

        {/* Loading overlay while restoring data */}
        {isRestoringData && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3 shadow-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-gray-700">
                Loading previous data...
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          {/* Restaurant Selection Card */}
          <Card className="border-2 border-blue-200">
            <CardContent className="space-y-2">
              <Label className="text-base font-semibold">
                1. Select Restaurant *
              </Label>
              <RestaurantSelector
                selectedRestaurant={selectedRestaurant}
                onRestaurantSelected={onRestaurantSelected}
                restaurants={restaurants}
                searchQuery={restaurantSearchQuery}
                onSearchQueryChange={onRestaurantSearchChange}
                locationQuery={locationSearchQuery}
                onLocationQueryChange={onLocationSearchChange}
                isOnline={isOnline}
                onOpenCamera={onOpenCamera}
                previousRestaurant={previousRestaurant}
                onUsePreviousRestaurant={onUsePreviousRestaurant}
                showSameAsAbove={showSameAsAbove}
                restaurantCreationMutation={restaurantCreationMutation}
                onShowValidation={onShowValidation}
                onHandleError={onHandleError}
                getRestaurantStats={getRestaurantStats}
              />
            </CardContent>
          </Card>

          {/* Show menu item and rating UI only when restaurant is selected */}
          {selectedRestaurant && (
            <>
              {/* Menu Item Selection Card */}
              <Card ref={menuItemCardRef} className="border-2 border-green-200">
                <CardContent className="space-y-3">
                  <Label className="text-base font-semibold">
                    2. Select Menu Item *
                  </Label>

                  <Tabs
                    value={menuItemSelectionMode}
                    onValueChange={(value) =>
                      onMenuItemModeChange(value as "search" | "scan" | "create")
                    }
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="search" disabled={isProcessing}>
                        <Search className="h-4 w-4 mr-1" />
                        Search
                      </TabsTrigger>
                      <TabsTrigger
                        value="scan"
                        disabled={isProcessing || !isOnline}
                      >
                        <Camera className="h-4 w-4 mr-1" />
                        Scan
                      </TabsTrigger>
                      <TabsTrigger
                        value="create"
                        disabled={isProcessing || !isOnline}
                      >
                        Create
                      </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Search Existing Menu Items */}
                    <TabsContent value="search" className="mt-3 space-y-2">
                      {!selectedMenuItem ? (
                        <>
                          <Input
                            type="text"
                            placeholder="Search menu items..."
                            value={menuItemSearchQuery}
                            onChange={(e) => onMenuItemSearchChange(e.target.value)}
                            disabled={isProcessing}
                            className="text-base"
                          />

                          {filteredMenuItems.length > 0 && (
                            <div className="max-h-48 overflow-y-auto space-y-2">
                              {filteredMenuItems.slice(0, 20).map((item) => {
                                const isUserCreated =
                                  item.createdBy === pb.authStore.model?.id;
                                const isEditing = editingMenuItemId === item.id;

                                return (
                                  <Card
                                    key={item.id}
                                    className={`${!isEditing ? "cursor-pointer hover:border-blue-500 hover:bg-blue-50" : ""} transition-all py-2`}
                                    onClick={
                                      !isEditing
                                        ? () => {
                                            onMenuItemSelected(item);
                                            onMenuItemNameChange(item.name);
                                            onMenuItemSearchChange("");
                                            scrollToDateCard();
                                          }
                                        : undefined
                                    }
                                  >
                                    <CardContent>
                                      {isEditing ? (
                                        <div className="space-y-3">
                                          {/* Name input row */}
                                          <div className="flex items-center gap-2">
                                            <Input
                                              type="text"
                                              value={editingMenuItemName}
                                              onChange={(e) =>
                                                onEditingMenuItemNameChange(
                                                  e.target.value
                                                )
                                              }
                                              placeholder="Menu item name"
                                              className="flex-1"
                                              autoFocus
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  onEditMenuItem(item.id);
                                                } else if (e.key === "Escape") {
                                                  onEditingMenuItemIdChange(null);
                                                  onEditingMenuItemNameChange("");
                                                }
                                              }}
                                            />
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onEditMenuItem(item.id);
                                              }}
                                              disabled={
                                                !editingMenuItemName.trim() ||
                                                isProcessing
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
                                                onEditingMenuItemIdChange(null);
                                                onEditingMenuItemNameChange("");
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
                                                  onEditingMenuItemVisibilityChange("private");
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
                                                  onEditingMenuItemVisibilityChange("friends");
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
                                                  onEditingMenuItemVisibilityChange("public");
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
                                        <div className="space-y-2">
                                          {/* Row 1: Name and checkmark */}
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium leading-snug">
                                                {item.name}
                                              </div>
                                              {item.description && (
                                                <div className="text-sm text-muted-foreground mt-1">
                                                  {item.description}
                                                </div>
                                              )}
                                            </div>
                                            <Check className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                                          </div>

                                          {/* Row 2: Visibility badge and edit button */}
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                              {item.visibility === "private" && (
                                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                                  <Lock className="h-3 w-3" />
                                                  Private
                                                </Badge>
                                              )}
                                              {item.visibility === "friends" && (
                                                <Badge variant="outline" className="text-xs flex items-center gap-1 text-blue-600 border-blue-200">
                                                  <Users className="h-3 w-3" />
                                                  Friends
                                                </Badge>
                                              )}
                                              {item.visibility === "public" && (
                                                <Badge variant="outline" className="text-xs flex items-center gap-1 text-green-600 border-green-200">
                                                  <Globe className="h-3 w-3" />
                                                  Public
                                                </Badge>
                                              )}
                                            </div>

                                            {isUserCreated && (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onEditingMenuItemIdChange(item.id);
                                                  onEditingMenuItemNameChange(
                                                    item.name
                                                  );
                                                  onEditingMenuItemVisibilityChange(
                                                    item.visibility || "private"
                                                  );
                                                }}
                                                className="h-7 px-2 text-xs text-gray-500"
                                              >
                                                <Pencil className="h-3 w-3 mr-1" />
                                                Edit
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          )}

                          {menuItems.length === 0 && !menuItemSearchQuery && (
                            <div className="text-center py-4 text-sm text-muted-foreground">
                              <p>No menu items found for this restaurant.</p>
                              <p className="text-xs mt-1">
                                Try scanning a menu or creating a new item.
                              </p>
                            </div>
                          )}

                          {menuItems.length > 0 &&
                            filteredMenuItems.length === 0 &&
                            menuItemSearchQuery && (
                              <div className="text-center py-4 text-sm text-muted-foreground">
                                <p>No matches found.</p>
                                <p className="text-xs mt-1">
                                  Try scanning a menu or creating a new item.
                                </p>
                              </div>
                            )}
                        </>
                      ) : (
                        <Card className="border-green-500 bg-green-50 py-2">
                          <CardContent>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">
                                  {selectedMenuItem.name}
                                </div>
                                {selectedMenuItem.description && (
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {selectedMenuItem.description}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Check className="w-5 h-5 text-green-600" />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    onMenuItemSelected(null);
                                    onMenuItemNameChange("");
                                  }}
                                >
                                  Change
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    {/* Tab 2: Scan Menu Photo */}
                    <TabsContent value="scan" className="mt-3 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Upload a menu photo to automatically scan and find items
                      </p>

                      <MenuItemPhotoInput
                        photoKey="current"
                        newPhotoPreviewUrl={menuItemPhotoPreview || undefined}
                        onPhotoCapture={handlePhotoCapture}
                        onRemoveNewPhoto={handlePhotoRemove}
                        showLabel={false}
                        showNewPhotoBadge={false}
                        labelText=""
                        helpText=""
                      />

                      {/* OCR scanning status */}
                      {ocrStatus !== "idle" && ocrStatus !== "complete" && (
                        <Alert>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <AlertDescription>
                            <div className="flex items-center justify-between text-sm">
                              <span>
                                {ocrStatus === "preprocessing" &&
                                  "Enhancing image for OCR..."}
                                {ocrStatus === "compressing" &&
                                  "Optimizing image..."}
                                {ocrStatus === "uploading" &&
                                  "Uploading menu photo..."}
                                {ocrStatus === "processing" &&
                                  "Reading menu text..."}
                              </span>
                              <span className="text-muted-foreground">
                                {ocrProgress}%
                              </span>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* OCR success - Show scanned menu items for selection */}
                      {ocrStatus === "complete" &&
                        scannedMenuItems.length > 0 && (
                          <>
                            <Alert className="border-green-500 bg-green-50">
                              <Check className="h-4 w-4 text-green-600" />
                              <AlertDescription className="text-green-800 text-sm">
                                Found {scannedMenuItems.length} menu item
                                {scannedMenuItems.length !== 1 ? "s" : ""}!
                                Select one below.
                              </AlertDescription>
                            </Alert>

                            <div className="max-h-48 overflow-y-auto space-y-2">
                              {scannedMenuItems.slice(0, 20).map((item) => (
                                <Card
                                  key={item.id}
                                  className="cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all px-2"
                                  onClick={() => {
                                    onMenuItemSelected(item);
                                    onMenuItemNameChange(item.name);
                                    onMenuItemModeChange("search");
                                    scrollToDateCard();
                                  }}
                                >
                                  <CardContent>
                                    <div className="font-medium">{item.name}</div>
                                    {item.description && (
                                      <div className="text-sm text-muted-foreground mt-1">
                                        {item.description}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </>
                        )}

                      {/* OCR error */}
                      {ocrError && (
                        <Alert className="border-red-500 bg-red-50">
                          <X className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-800 text-sm">
                            {ocrError}
                          </AlertDescription>
                        </Alert>
                      )}
                    </TabsContent>

                    {/* Tab 3: Create New Menu Item */}
                    <TabsContent value="create" className="mt-3 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Manually create a new menu item
                      </p>

                      <Input
                        type="text"
                        placeholder="e.g., Margherita Pizza, Pad Thai"
                        value={menuItemName}
                        onChange={(e) => onMenuItemNameChange(e.target.value)}
                        maxLength={200}
                        required
                        disabled={isProcessing || !isOnline}
                        className="text-base"
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            menuItemName.trim() &&
                            isOnline &&
                            !isProcessing
                          ) {
                            e.preventDefault();
                            onCreateMenuItem();
                          }
                        }}
                      />

                      <Button
                        onClick={onCreateMenuItem}
                        className="w-full"
                        disabled={
                          !menuItemName.trim() || isProcessing || !isOnline
                        }
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Create Item
                          </>
                        )}
                      </Button>

                      {!isOnline && (
                        <Alert className="border-orange-500 bg-orange-50">
                          <WifiOff className="h-4 w-4 text-orange-600" />
                          <AlertDescription className="text-orange-800 text-sm">
                            You're offline. Cannot create new menu items. Switch
                            to search mode or go online.
                          </AlertDescription>
                        </Alert>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Date Selection Card - Show when menu item is selected */}
              {menuItemName.trim() && (
                <Card ref={dateCardRef} className="border-2 border-orange-200">
                  <CardContent className="space-y-3">
                    <Label className="text-base font-semibold">
                      3. Visit Date
                    </Label>
                    <div className="space-y-2">
                      <Input
                        type="date"
                        value={photoDate ? format(photoDate, "yyyy-MM-dd") : ""}
                        onChange={(e) => {
                          const newDate = e.target.value
                            ? new Date(e.target.value + 'T00:00:00')
                            : new Date();
                          onPhotoDateChange(newDate);
                        }}
                        max={format(new Date(), "yyyy-MM-dd")}
                        className="text-base"
                      />
                      <p className="text-xs text-gray-600">
                        {photoDate &&
                        currentPhoto.captureDate &&
                        photoDate.getTime() !==
                          currentPhoto.captureDate.getTime()
                          ? `Original: ${format(currentPhoto.captureDate, "MMM dd, yyyy")}`
                          : "Detected from photo EXIF data"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rating Selection Card - Only show when menu item is selected */}
              {menuItemName.trim() && (
                <Card className="border-2 border-purple-200">
                  <CardContent className="space-y-3">
                    <Label className="text-base font-semibold">
                      4. Rate Your Food *
                    </Label>

                    {/* Rating Guide - Collapsible */}
                    <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
                      <CardContent>
                        <button
                          type="button"
                          onClick={() => onLegendExpandedChange(!isLegendExpanded)}
                          className="w-full flex items-center justify-between"
                        >
                          <Label className="text-sm font-semibold text-gray-700 cursor-pointer">
                            Rating Guide
                          </Label>
                          {isLegendExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-600" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-600" />
                          )}
                        </button>

                        {/* Rating legend */}
                        {isLegendExpanded && (
                          <div className="space-y-2 mt-3">
                            {RATING_OPTIONS.map((option) => (
                              <div
                                key={option.value}
                                className="flex items-center gap-3"
                              >
                                <div
                                  className={`${option.color} text-white w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0`}
                                >
                                  {option.value}
                                </div>
                                <span className="text-sm text-gray-700">
                                  {option.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Rating Selection */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">
                        Rating *
                      </Label>
                      <RatingSelector
                        value={rating}
                        onChange={onRatingChange}
                        disabled={isProcessing}
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="notes" className="text-base font-semibold">
                        Notes (Optional)
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => onNotesChange(e.target.value)}
                        placeholder="Any additional thoughts or details..."
                        maxLength={1000}
                        rows={3}
                        disabled={isProcessing}
                        className="text-base resize-none"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error Display */}
              {visitCreationMutation.isError && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
                  <p className="font-semibold">Error saving visits</p>
                  <p className="text-sm">
                    {visitCreationMutation.error?.message ||
                      "Please try again. Check browser console for details."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            {/* Left button: Cancel on first photo, Previous on others */}
            <Button
              variant="outline"
              onClick={onPrevious}
              disabled={isProcessing}
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {currentPhotoIndex === 0 ? "Cancel" : "Previous"}
            </Button>

            {/* Right button: Save & Next (or disabled Next if incomplete) */}
            <Button
              onClick={onSubmitCurrent}
              className="flex-1"
              disabled={!canSubmit || isProcessing}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isProcessing
                ? "Saving..."
                : currentPhotoIndex < totalPhotos - 1
                  ? "Save & Next"
                  : "Save & Finish"}
              {currentPhotoIndex < totalPhotos - 1 && !isProcessing && (
                <ChevronRight className="ml-2 h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
    </div>
  );
}

/**
 * Memoized version of RestaurantProcessingScreen with custom equality check
 * Only re-renders when critical props change (photo, restaurant, menu items, search queries)
 */
export const RestaurantProcessingScreen = memo(
  RestaurantProcessingScreenComponent,
  (prevProps, nextProps) => {
    // Compare critical props that affect rendering
    return (
      prevProps.currentPhoto.id === nextProps.currentPhoto.id &&
      prevProps.currentPhoto.previewUrl === nextProps.currentPhoto.previewUrl &&
      prevProps.selectedRestaurant?.id === nextProps.selectedRestaurant?.id &&
      prevProps.menuItems.length === nextProps.menuItems.length &&
      prevProps.selectedMenuItem?.id === nextProps.selectedMenuItem?.id &&
      prevProps.rating === nextProps.rating &&
      prevProps.notes === nextProps.notes &&
      prevProps.isProcessing === nextProps.isProcessing &&
      prevProps.ocrStatus === nextProps.ocrStatus &&
      prevProps.isOnline === nextProps.isOnline &&
      prevProps.canSubmit === nextProps.canSubmit &&
      // Include search queries to ensure inputs update on keystroke
      prevProps.restaurantSearchQuery === nextProps.restaurantSearchQuery &&
      prevProps.locationSearchQuery === nextProps.locationSearchQuery &&
      prevProps.menuItemSearchQuery === nextProps.menuItemSearchQuery &&
      prevProps.menuItemName === nextProps.menuItemName &&
      // Include editing state to ensure edit mode renders correctly
      prevProps.editingMenuItemId === nextProps.editingMenuItemId &&
      prevProps.editingMenuItemName === nextProps.editingMenuItemName &&
      prevProps.editingMenuItemVisibility === nextProps.editingMenuItemVisibility &&
      // Include menu item selection mode to ensure tab changes render
      prevProps.menuItemSelectionMode === nextProps.menuItemSelectionMode &&
      // Include legend expanded state to ensure collapsible works
      prevProps.isLegendExpanded === nextProps.isLegendExpanded &&
      // Include used menu item names to filter already-selected items
      prevProps.usedMenuItemNames.length === nextProps.usedMenuItemNames.length &&
      prevProps.usedMenuItemNames.every((name, i) => name === nextProps.usedMenuItemNames[i]) &&
      // Include restaurant stats function to update visit counts
      prevProps.getRestaurantStats === nextProps.getRestaurantStats
    );
  }
);
