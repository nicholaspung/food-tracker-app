import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  ArrowLeft,
  Upload,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Camera,
  Search,
  Check,
  History,
  WifiOff,
  Store,
  X,
  MapPin,
  Users,
  Pencil,
} from "lucide-react";
import {
  RATING_OPTIONS,
  RATING_LABELS,
  RATING_COLORS,
} from "@/lib/ratingConstants";
import { useOfflineVisitCreation } from "@/hooks/useOfflineVisitCreation";
import { useOfflineRestaurantCreation } from "@/hooks/useOfflineRestaurantCreation";
import { useOfflineQuickTrack } from "@/hooks/useOfflineQuickTrack";
import { ITEM_CATEGORIES } from "@/components/QuickTrackPage";
import { useSync } from "@/contexts/SyncContext";
import { useMenuOCR } from "@/hooks/useMenuOCR";
import RestaurantNameFinder from "@/components/RestaurantNameFinder";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import { pb, Restaurant, MenuItem } from "@/lib/pocketbase";
import { createMenuItems } from "@/services/ocrService";
import { processPhotosDraftService } from "@/services/processPhotosDraftServiceDB";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { searchAndCacheRestaurantsByText } from "@/services/googlePlaces";
import ExifReader from "exifreader";
import { format } from "date-fns";

type ScreenState = "choice" | "upload" | "process" | "review";
type ProcessType = "restaurant" | "quickTrack";

interface PhotoToProcess {
  id: string;
  file: File;
  previewUrl: string;
  captureDate: Date | null;
}

interface ProcessedPhoto {
  photoId: string;
  photo: File;
  restaurant: any;
  menuItemName: string;
  menuItemDescription: string;
  rating: number;
  notes: string;
  isNewMenuItem: boolean;
  captureDate: Date | null;
}

interface QuickTrackPhotoData {
  photoId: string;
  photo: File;
  previewUrl: string;
  itemName: string;
  category: string;
  rating: number;
  locationText: string;
  notes: string;
  visibility: 'friends' | 'private';
}

// Enhanced Restaurant Selector Component with Google Places and History
interface RestaurantSelectorProps {
  selectedRestaurant: Restaurant | null;
  onRestaurantSelected: (restaurant: Restaurant) => void;
  restaurants: Restaurant[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  locationQuery: string;
  onLocationQueryChange: (query: string) => void;
  isOnline: boolean;
  onOpenCamera?: () => void;
  previousRestaurant?: Restaurant | null;
  onUsePreviousRestaurant?: () => void;
  showSameAsAbove?: boolean;
  restaurantCreationMutation: any;
}

interface StoredCameraResult {
  id: string;
  imagePreview: string;
  result: {
    found: boolean;
    options?: Array<{ name: string; confidence: string }>;
  };
  timestamp: number;
}

// Utility function to extract capture date from image EXIF data
async function extractImageCaptureDate(file: File): Promise<Date | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer);

    // Try different date tags in order of preference
    const dateTag = tags['DateTimeOriginal'] || tags['DateTime'] || tags['CreateDate'];

    if (dateTag && dateTag.description) {
      // EXIF date format is "YYYY:MM:DD HH:MM:SS"
      const dateStr = dateTag.description;
      const [datePart, timePart] = dateStr.split(' ');
      const [year, month, day] = datePart.split(':');
      const [hour, minute, second] = timePart?.split(':') || ['00', '00', '00'];

      const date = new Date(
        parseInt(year),
        parseInt(month) - 1, // Month is 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );

      // Validate the date
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  } catch (error) {
    console.warn('Failed to extract EXIF date from image:', error);
  }

  // Fallback to file modification date or current date
  return file.lastModified ? new Date(file.lastModified) : new Date();
}

function RestaurantSelector({
  selectedRestaurant,
  onRestaurantSelected,
  restaurants,
  searchQuery,
  onSearchQueryChange,
  locationQuery,
  onLocationQueryChange,
  isOnline,
  onOpenCamera,
  previousRestaurant,
  onUsePreviousRestaurant,
  showSameAsAbove = false,
  restaurantCreationMutation,
}: RestaurantSelectorProps) {
  const [googlePlaces, setGooglePlaces] = useState<Restaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [cameraHistory, setCameraHistory] = useState<StoredCameraResult[]>([]);
  const [showGoogleResults, setShowGoogleResults] = useState(false);
  const [highlightedRestaurants, setHighlightedRestaurants] = useState<
    Set<string>
  >(new Set());

  // Add restaurant state
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState("");
  const [newRestaurantLocation, setNewRestaurantLocation] = useState("");
  const [newRestaurantCuisine, setNewRestaurantCuisine] = useState("");
  const [isCreatingRestaurant, setIsCreatingRestaurant] = useState(false);

  // Load camera history
  useEffect(() => {
    try {
      const saved = localStorage.getItem("restaurantNameFinderHistory");
      if (saved) {
        setCameraHistory(JSON.parse(saved));
      }
    } catch (err) {
      console.error("Failed to load camera history:", err);
    }
  }, []);

  // Highlight matching restaurants when search query changes
  useEffect(() => {
    const hasSearch = searchQuery.trim() || locationQuery.trim();

    if (hasSearch && restaurants.length > 0) {
      const matchingIds = new Set(restaurants.map((r) => r.id));
      setHighlightedRestaurants(matchingIds);

      const timer = setTimeout(() => {
        setHighlightedRestaurants(new Set());
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      setHighlightedRestaurants(new Set());
    }
  }, [searchQuery, locationQuery, restaurants.length]);

  const handleGooglePlacesSearch = async () => {
    if (!isOnline) {
      setSearchError(
        "Cannot search while offline. Google Places requires internet connection."
      );
      return;
    }

    if (!searchQuery.trim()) {
      setSearchError("Please enter a restaurant name or type to search");
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const results = await searchAndCacheRestaurantsByText({
        query: searchQuery.trim(),
        location: locationQuery.trim() || undefined,
        radius: 5000,
      });

      setGooglePlaces(results);
      setShowGoogleResults(true);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Failed to search restaurants"
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateRestaurant = async () => {
    if (!newRestaurantName.trim()) {
      return;
    }

    setIsCreatingRestaurant(true);
    try {
      const result = await restaurantCreationMutation.mutateAsync({
        name: newRestaurantName.trim(),
        address: newRestaurantLocation.trim() || undefined,
        cuisineType: newRestaurantCuisine.trim() || undefined,
        visibility: "private",
      });

      // Select the newly created restaurant
      onRestaurantSelected(result.restaurant);

      // Reset form
      setNewRestaurantName("");
      setNewRestaurantLocation("");
      setNewRestaurantCuisine("");
      setShowAddRestaurant(false);
    } catch (error) {
      console.error("Failed to create restaurant:", error);
      alert("Failed to create restaurant. Please try again.");
    } finally {
      setIsCreatingRestaurant(false);
    }
  };

  if (selectedRestaurant) {
    return (
      <Card className="border-primary py-4">
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <div className="font-medium">{selectedRestaurant.name}</div>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {selectedRestaurant.location}
                {selectedRestaurant.cuisineType &&
                  ` • ${selectedRestaurant.cuisineType}`}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRestaurantSelected(null as any)}
            >
              Change
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="search" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="search">
          <Search className="h-4 w-4 mr-1" />
          Search
        </TabsTrigger>
        <TabsTrigger value="camera">
          <Camera className="h-4 w-4 mr-1" />
          Camera
        </TabsTrigger>
        <TabsTrigger value="history">
          <History className="h-4 w-4 mr-1" />
          History
        </TabsTrigger>
      </TabsList>

      {/* Search Tab - Shows both cached and Google Places results */}
      <TabsContent value="search" className="mt-3 space-y-3">
        <div className="space-y-2">
          <div className="relative">
            <Input
              type="text"
              placeholder="Restaurant name or type..."
              value={searchQuery}
              onChange={(e) => {
                onSearchQueryChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGooglePlacesSearch();
                }
              }}
              className="w-full pr-8"
            />
            {(searchQuery || locationQuery) && (
              <button
                type="button"
                onClick={() => {
                  onSearchQueryChange("");
                  onLocationQueryChange("");
                  setShowGoogleResults(false);
                  setGooglePlaces([]);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded-full transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          <Input
            type="text"
            placeholder="Location (optional, e.g., 90210, Los Angeles)"
            value={locationQuery}
            onChange={(e) => onLocationQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleGooglePlacesSearch();
              }
            }}
          />

          <Button
            onClick={handleGooglePlacesSearch}
            className="w-full"
            disabled={!isOnline || isSearching || !searchQuery.trim()}
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching Google Places...
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="h-4 w-4 mr-2" />
                Offline
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search Google Places
              </>
            )}
          </Button>

          {/* Add Restaurant Button/Form */}
          {!showAddRestaurant ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddRestaurant(true)}
            >
              <Store className="h-4 w-4 mr-2" />
              Add New Restaurant
            </Button>
          ) : (
            <Card className="border-2 border-blue-500">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">
                    Add New Restaurant
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddRestaurant(false);
                      setNewRestaurantName("");
                      setNewRestaurantLocation("");
                      setNewRestaurantCuisine("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-restaurant-name">Restaurant Name *</Label>
                  <Input
                    id="new-restaurant-name"
                    value={newRestaurantName}
                    onChange={(e) => setNewRestaurantName(e.target.value)}
                    placeholder="e.g., Joe's Pizza"
                    disabled={isCreatingRestaurant}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-restaurant-location">
                    Location (Optional)
                  </Label>
                  <Input
                    id="new-restaurant-location"
                    value={newRestaurantLocation}
                    onChange={(e) => setNewRestaurantLocation(e.target.value)}
                    placeholder="e.g., 123 Main St, New York, NY"
                    disabled={isCreatingRestaurant}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-restaurant-cuisine">
                    Cuisine Type (Optional)
                  </Label>
                  <Input
                    id="new-restaurant-cuisine"
                    value={newRestaurantCuisine}
                    onChange={(e) => setNewRestaurantCuisine(e.target.value)}
                    placeholder="e.g., Italian, Chinese, Mexican"
                    disabled={isCreatingRestaurant}
                  />
                </div>
                <Button
                  onClick={handleCreateRestaurant}
                  className="w-full"
                  disabled={!newRestaurantName.trim() || isCreatingRestaurant}
                >
                  {isCreatingRestaurant ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4 mr-2" />
                      Create Restaurant
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Same as Above Button */}
        {showSameAsAbove && previousRestaurant && onUsePreviousRestaurant && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onUsePreviousRestaurant}
          >
            <Copy className="h-4 w-4 mr-2" />
            Same as previous ({previousRestaurant.name})
          </Button>
        )}

        {searchError && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            {searchError}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto space-y-3">
          {/* Google Places Results - Shown above cached results */}
          {showGoogleResults && googlePlaces.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-primary">
                Google Places Results
              </Label>
              {googlePlaces.map((restaurant) => (
                <Card
                  key={restaurant.id}
                  className="cursor-pointer hover:border-primary transition-colors border-primary/30 px-2"
                  onClick={() => onRestaurantSelected(restaurant)}
                >
                  <CardContent>
                    <div className="font-medium">{restaurant.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {restaurant.location}
                      {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Saved/Cached Restaurants Results */}
          {restaurants.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {showGoogleResults && googlePlaces.length > 0
                  ? "Saved Restaurants"
                  : "Results"}
              </Label>
              {restaurants.slice(0, 10).map((restaurant) => {
                const isHighlighted = highlightedRestaurants.has(
                  restaurant.id
                );
                return (
                  <Card
                    key={restaurant.id}
                    className={`cursor-pointer hover:border-primary transition-all py-2 ${
                      isHighlighted
                        ? "border-2 border-yellow-400 bg-yellow-50 animate-pulse shadow-lg"
                        : ""
                    }`}
                    onClick={() => onRestaurantSelected(restaurant)}
                  >
                    <CardContent>
                      <div className="font-medium">{restaurant.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {restaurant.location}
                        {restaurant.cuisineType &&
                          ` • ${restaurant.cuisineType}`}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Empty states */}
          {!showGoogleResults && restaurants.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Store className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>
                {searchQuery
                  ? "No saved restaurants found"
                  : "No saved restaurants yet"}
              </p>
              <p className="text-xs mt-1">
                Use the search button to find restaurants on Google Places
              </p>
            </div>
          )}

          {showGoogleResults &&
            googlePlaces.length === 0 &&
            restaurants.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No results found
              </div>
            )}
        </div>
      </TabsContent>

      {/* Camera Tab */}
      <TabsContent value="camera" className="mt-3 space-y-2">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Take or upload a photo of the restaurant sign or menu to
            automatically detect the name
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onOpenCamera}
          >
            <Camera className="h-4 w-4 mr-2" />
            Take/Upload Photo
          </Button>
        </div>
      </TabsContent>

      {/* History Tab */}
      <TabsContent value="history" className="mt-3 space-y-2">
        <div className="max-h-80 overflow-y-auto space-y-2">
          {cameraHistory.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No camera scan history yet
            </div>
          ) : (
            cameraHistory
              .slice()
              .reverse()
              .map((item) => (
                <Card key={item.id} className="overflow-hidden px-2">
                  <CardContent>
                    <div className="flex gap-3">
                      <img
                        src={item.imagePreview}
                        alt="Scanned"
                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        {item.result.found &&
                        item.result.options &&
                        item.result.options.length > 0 ? (
                          <div className="space-y-1">
                            {item.result.options
                              .slice(0, 2)
                              .map((option, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    // Search for this restaurant name in saved restaurants
                                    const found = restaurants.find(
                                      (r) =>
                                        r.name.toLowerCase() ===
                                        option.name.toLowerCase()
                                    );
                                    if (found) {
                                      onRestaurantSelected(found);
                                    } else {
                                      // Set it as search query so user can find/create it
                                      onSearchQueryChange(option.name);
                                    }
                                  }}
                                  className="text-left text-sm font-medium hover:text-primary transition-colors"
                                >
                                  {option.name}
                                </button>
                              ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No restaurant detected
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

export default function ProcessPhotosPage() {
  const navigate = useNavigate();
  const { isOnline } = useSync();
  const queryClient = useQueryClient();
  const visitCreationMutation = useOfflineVisitCreation();
  const restaurantCreationMutation = useOfflineRestaurantCreation();
  const quickTrackMutation = useOfflineQuickTrack();

  // Menu OCR hook for scanning menu photos
  const {
    status: ocrStatus,
    progress: ocrProgress,
    menuItems: scannedMenuItems,
    error: ocrError,
    processMenuImage,
    reset: resetOCR,
  } = useMenuOCR();

  // Detect when mobile keyboard is visible to hide footer
  const isKeyboardVisible = useKeyboardVisible();

  // Fullscreen photo viewer state
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{
    url: string;
    dishName: string;
  } | null>(null);

  // Screen state
  const [screen, setScreen] = useState<ScreenState>("choice");
  const [processType, setProcessType] = useState<ProcessType | null>(null);

  // Photo management
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);
  const [quickTrackPhotos, setQuickTrackPhotos] = useState<QuickTrackPhotoData[]>([]);

  // Form state for current photo
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(
    null
  );
  const [menuItemName, setMenuItemName] = useState("");
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState("");
  const [menuItemSelectionMode, setMenuItemSelectionMode] = useState<
    "search" | "scan" | "create"
  >("search");
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);
  const [rating, setRating] = useState<number | null>(3); // Default to "worth trying"
  const [notes, setNotes] = useState("");
  const [photoDate, setPhotoDate] = useState<Date>(new Date());
  const [menuItemPhoto, setMenuItemPhoto] = useState<File | null>(null);
  const [menuItemPhotoPreview, setMenuItemPhotoPreview] = useState<
    string | null
  >(null);

  // Edit menu item state
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [editingMenuItemName, setEditingMenuItemName] = useState("");

  // Form state for quick track items
  const [qtItemName, setQtItemName] = useState("");
  const [qtCategory, setQtCategory] = useState("");
  const [qtRating, setQtRating] = useState<number | null>(3);
  const [qtLocationText, setQtLocationText] = useState("");
  const [qtNotes, setQtNotes] = useState("");
  const [qtVisibility, setQtVisibility] = useState<'friends' | 'private'>('friends');

  // Visit visibility for restaurant visits
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>('friends');

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoringData, setIsRestoringData] = useState(false);

  // Refs for auto-scrolling
  const menuItemCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLDivElement>(null);

  // Dialog state
  const [showBackDialog, setShowBackDialog] = useState(false);
  const [backDialogType, setBackDialogType] = useState<"upload" | "cancel">(
    "cancel"
  );
  const [showRequiredFieldsDialog, setShowRequiredFieldsDialog] =
    useState(false);
  const [showCameraMode, setShowCameraMode] = useState(false);

  // Restaurant search state
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [locationSearchQuery, setLocationSearchQuery] = useState("");

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ["restaurants"],
    queryFn: async () => {
      return await pb.collection("restaurants").getFullList({
        sort: "-created",
      });
    },
  });

  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      (r.cuisineType?.toLowerCase() || "").includes(
        restaurantSearchQuery.toLowerCase()
      );

    const matchesLocation = locationSearchQuery.trim()
      ? r.location.toLowerCase().includes(locationSearchQuery.toLowerCase())
      : true;

    return matchesSearch && matchesLocation;
  });

  // Fetch menu items for selected restaurant
  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["menu_items", selectedRestaurant?.id],
    queryFn: async () => {
      if (!selectedRestaurant?.id || !isOnline) return [];
      return await pb.collection("menu_items").getFullList<MenuItem>({
        filter: `restaurant = "${selectedRestaurant.id}"`,
        sort: "-created",
      });
    },
    enabled: !!selectedRestaurant?.id,
  });

  // Filter out menu items already used in processed photos for the same restaurant
  const usedMenuItemNames = processedPhotos
    .filter((p) => p.restaurant?.id === selectedRestaurant?.id)
    .map((p) => p.menuItemName.toLowerCase());

  const filteredMenuItems = menuItems.filter(
    (item) =>
      item.name.toLowerCase().includes(menuItemSearchQuery.toLowerCase()) &&
      !usedMenuItemNames.includes(item.name.toLowerCase())
  );

  // Set default mode based on whether restaurant has menu items
  useEffect(() => {
    if (selectedRestaurant) {
      if (menuItems.length === 0) {
        // No menu items, default to "create new"
        setMenuItemSelectionMode("create");
      } else {
        // Has menu items, default to "search existing"
        setMenuItemSelectionMode("search");
      }
    }
  }, [selectedRestaurant, menuItems.length]);

  // Clear menu item selection when switching tabs
  useEffect(() => {
    // Only clear selection when switching to create or scan tabs
    // Don't clear when switching to search tab (might have a selected item)
    if (
      menuItemSelectionMode === "create" ||
      menuItemSelectionMode === "scan"
    ) {
      setSelectedMenuItem(null);
    }

    if (menuItemSelectionMode === "create") {
      // Clear input when switching to create tab
      setMenuItemName("");
    }
  }, [menuItemSelectionMode]);

  // Initialize photo date when current photo changes
  useEffect(() => {
    const currentPhoto = photos[currentPhotoIndex];
    if (currentPhoto?.captureDate) {
      setPhotoDate(currentPhoto.captureDate);
    } else {
      setPhotoDate(new Date());
    }
  }, [currentPhotoIndex, photos]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Extract capture dates from photos
    const photosWithDates = await Promise.all(
      files.map(async (file, index) => {
        const captureDate = await extractImageCaptureDate(file);
        return {
          id: `${Date.now()}-${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
          captureDate,
        };
      })
    );

    setPhotos(photosWithDates);
    setCurrentPhotoIndex(0);
    setScreen("process");

    // Save to draft
    await processPhotosDraftService.savePhotos(files);

    e.target.value = ""; // Reset input
  };

  // Load draft on mount
  useEffect(() => {
    async function loadDraft() {
      try {
        setIsRestoringData(true);
        console.log("[ProcessPhotos] Attempting to load draft...");

        const draft = await processPhotosDraftService.getDraft();
        console.log("[ProcessPhotos] Draft loaded:", {
          photosCount: draft.photos.length,
          processedCount: draft.processedPhotos.length,
          hasFormState: !!draft.currentFormState,
        });

        if (draft.photos.length > 0) {
          console.log(
            "[ProcessPhotos] Restoring draft with",
            draft.photos.length,
            "photos"
          );

          // Convert data URLs back to Files and restore photos
          const restoredPhotos: PhotoToProcess[] = await Promise.all(
            draft.photos.map(async (p) => {
              // Convert data URL to Blob then to File
              const response = await fetch(p.dataUrl);
              const blob = await response.blob();
              const file = new File([blob], p.fileName, { type: p.fileType });

              return {
                id: p.id,
                file,
                previewUrl: p.dataUrl, // Use data URL directly for preview
                captureDate: await extractImageCaptureDate(file),
              };
            })
          );

          setPhotos(restoredPhotos);
          setCurrentPhotoIndex(draft.currentPhotoIndex);
          setScreen("process");

          // Restore processed photos (convert data URLs back to Files)
          const restoredProcessed: ProcessedPhoto[] = await Promise.all(
            draft.processedPhotos.map(async (p) => {
              const response = await fetch(p.photoDataUrl);
              const blob = await response.blob();
              const file = new File([blob], p.photoFileName, { type: p.photoFileType });

              return {
                ...p,
                photo: file,
                captureDate: await extractImageCaptureDate(file),
              };
            })
          );
          setProcessedPhotos(restoredProcessed);

          // Restore current form state if available
          if (draft.currentFormState) {
            console.log("[ProcessPhotos] Restoring form state");
            setSelectedRestaurant(draft.currentFormState.selectedRestaurant);
            setMenuItemName(draft.currentFormState.menuItemName);
            setRating(draft.currentFormState.rating);
            setNotes(draft.currentFormState.notes);
            setIsCreatingNewItem(draft.currentFormState.isCreatingNewItem);
          }

          // Restore visit visibility
          setVisitVisibility(draft.visitVisibility);

          console.log("[ProcessPhotos] Draft restoration complete");
        } else {
          console.log("[ProcessPhotos] No draft to restore");
        }
      } catch (error) {
        console.error("[ProcessPhotos] Failed to load draft:", error);
        // Don't block the UI if draft loading fails
        // User can still use the page normally
      } finally {
        setIsRestoringData(false);
      }
    }
    loadDraft();
  }, []);

  // Disable "Create new" mode when going offline
  useEffect(() => {
    if (!isOnline && isCreatingNewItem) {
      setIsCreatingNewItem(false);
    }
  }, [isOnline, isCreatingNewItem]);

  // Save form state to draft when it changes (debounced)
  useEffect(() => {
    if (screen === "process" && photos.length > 0) {
      // Debounce the save to avoid excessive writes
      const timeoutId = setTimeout(() => {
        processPhotosDraftService.saveFormState(
          selectedRestaurant,
          menuItemName,
          rating,
          notes,
          isCreatingNewItem
        );
        // Also save current index with form state
        processPhotosDraftService.saveCurrentIndex(currentPhotoIndex);
      }, 500); // Wait 500ms after last change

      return () => clearTimeout(timeoutId);
    }
  }, [
    screen,
    photos.length,
    selectedRestaurant,
    menuItemName,
    rating,
    notes,
    isCreatingNewItem,
    currentPhotoIndex,
  ]);

  // Save visit visibility to draft when it changes
  useEffect(() => {
    if (photos.length > 0) {
      processPhotosDraftService.saveVisitVisibility(visitVisibility);
    }
  }, [visitVisibility, photos.length]);

  // Reset or restore form when photo index changes
  useEffect(() => {
    if (screen === "process" && photos.length > 0) {
      const currentPhoto = photos[currentPhotoIndex];

      // Check if this photo has already been processed
      const processedPhoto = processedPhotos.find(
        (p) => p.photoId === currentPhoto.id
      );

      if (processedPhoto) {
        // Show loading state while restoring
        setIsRestoringData(true);

        // Restore previous data
        console.log(
          "[ProcessPhotos] Restoring data for photo:",
          currentPhoto.id
        );
        setSelectedRestaurant(processedPhoto.restaurant);
        setMenuItemName(processedPhoto.menuItemName);
        setRating(processedPhoto.rating);
        setNotes(processedPhoto.notes);

        // Find and set the selected menu item
        // We'll need to fetch menu items for this restaurant if not already loaded
        if (processedPhoto.restaurant?.id) {
          // Query for menu items to find the matching one
          pb.collection("menu_items")
            .getFullList<MenuItem>({
              filter: `restaurant = "${processedPhoto.restaurant.id}"`,
              sort: "-created",
            })
            .then((items) => {
              const matchingItem = items.find(
                (item) => item.name === processedPhoto.menuItemName
              );
              if (matchingItem) {
                setSelectedMenuItem(matchingItem);
              }
              // Done restoring
              setIsRestoringData(false);
            })
            .catch((err) => {
              console.error("[ProcessPhotos] Failed to fetch menu items:", err);
              // Still stop loading even if fetch fails
              setIsRestoringData(false);
            });
        } else {
          // No restaurant, done restoring immediately
          setIsRestoringData(false);
        }

        setMenuItemSelectionMode("search");
      } else {
        // Reset form for new photo (no loading needed)
        setIsRestoringData(false);
        setSelectedRestaurant(null);
        setSelectedMenuItem(null);
        setMenuItemName("");
        setMenuItemSearchQuery("");
        setMenuItemSelectionMode("search");
        setIsCreatingNewItem(false);
        setRating(3);
        setNotes("");
        handleRemoveMenuItemPhoto();
      }
    }
  }, [currentPhotoIndex]);

  const handleRestaurantSelected = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
    // Reset menu item and rating when restaurant changes
    setSelectedMenuItem(null);
    setMenuItemName("");
    setMenuItemSearchQuery("");
    setRating(3);
    setNotes("");

    // Set default tab based on whether restaurant has menu items
    // This will be corrected after menu items are fetched
    setMenuItemSelectionMode("search");

    // Auto-scroll to menu item selection after restaurant is selected
    setTimeout(() => {
      menuItemCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  // Helper function to scroll to date card after menu item selection
  const scrollToDateCard = () => {
    setTimeout(() => {
      dateCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const handleCreateMenuItem = async () => {
    if (!menuItemName.trim() || !selectedRestaurant || !isOnline) return;

    setIsProcessing(true);
    try {
      console.log(
        "[ProcessPhotos] Creating menu item from create tab:",
        menuItemName
      );

      // Create the menu item
      await createMenuItems(
        selectedRestaurant.id,
        [{ name: menuItemName.trim(), description: "" }],
        undefined,
        { skipValidation: true, isFromOCR: false }
      );

      // Invalidate and refetch menu items
      await queryClient.invalidateQueries({
        queryKey: ["menu_items", selectedRestaurant.id],
      });

      // Wait a bit for the query to refetch
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get the updated menu items
      const updatedMenuItems = queryClient.getQueryData<MenuItem[]>([
        "menu_items",
        selectedRestaurant.id,
      ]);

      // Find the newly created item
      const newItem = updatedMenuItems?.find(
        (item) => item.name === menuItemName.trim()
      );

      if (newItem) {
        // Set it as selected
        setSelectedMenuItem(newItem);
      }

      // Switch to search tab to show the selected item
      setMenuItemSelectionMode("search");

      // Auto-scroll to date card after menu item is created
      scrollToDateCard();

      console.log(
        "[ProcessPhotos] Menu item created and selected successfully"
      );
    } catch (error: any) {
      console.error("[ProcessPhotos] Failed to create menu item:", error);
      alert(`Failed to create menu item: ${error.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditMenuItem = async (itemId: string) => {
    if (!editingMenuItemName.trim() || !isOnline) return;

    setIsProcessing(true);
    try {
      console.log("[ProcessPhotos] Updating menu item:", itemId, "to:", editingMenuItemName);

      // Update the menu item
      await pb.collection("menu_items").update(itemId, {
        name: editingMenuItemName.trim(),
      });

      // Invalidate and refetch menu items
      await queryClient.invalidateQueries({
        queryKey: ["menu_items", selectedRestaurant?.id],
      });

      // If this was the selected item, update its name
      if (selectedMenuItem?.id === itemId) {
        setSelectedMenuItem({ ...selectedMenuItem, name: editingMenuItemName.trim() });
        setMenuItemName(editingMenuItemName.trim());
      }

      // Clear editing state
      setEditingMenuItemId(null);
      setEditingMenuItemName("");

      console.log("[ProcessPhotos] Menu item updated successfully");
    } catch (error: any) {
      console.error("[ProcessPhotos] Failed to update menu item:", error);
      alert(`Failed to update menu item: ${error.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMenuItemPhotoCapture = async (
    key: string | number,
    file: File
  ) => {
    setMenuItemPhoto(file);
    const previewUrl = URL.createObjectURL(file);
    if (menuItemPhotoPreview) {
      URL.revokeObjectURL(menuItemPhotoPreview);
    }
    setMenuItemPhotoPreview(previewUrl);

    // Trigger OCR scanning if restaurant is selected and online
    if (selectedRestaurant && isOnline) {
      try {
        console.log("[ProcessPhotos] Scanning menu photo for items...");
        await processMenuImage(file, selectedRestaurant.id);
        console.log(
          "[ProcessPhotos] Menu scan complete, found",
          scannedMenuItems.length,
          "items"
        );
        // Invalidate menu items query to include newly scanned items
        await queryClient.invalidateQueries({
          queryKey: ["menu_items", selectedRestaurant.id],
        });
      } catch (error) {
        console.error("[ProcessPhotos] Menu scan failed:", error);
      }
    }
  };

  const handleRemoveMenuItemPhoto = () => {
    setMenuItemPhoto(null);
    if (menuItemPhotoPreview) {
      URL.revokeObjectURL(menuItemPhotoPreview);
    }
    setMenuItemPhotoPreview(null);
    // Reset OCR state
    resetOCR();
  };

  const handleSubmitCurrent = async () => {
    console.log("[ProcessPhotos] handleSubmitCurrent called");

    if (!selectedRestaurant || !selectedMenuItem || rating === null) {
      console.log("[ProcessPhotos] Validation failed");
      setShowRequiredFieldsDialog(true);
      return;
    }

    setIsProcessing(true);

    try {
      const currentPhoto = photos[currentPhotoIndex];

      // If creating a new menu item, create it immediately so it's available for next photo
      if (menuItemSelectionMode === "create" && isOnline) {
        console.log(
          "[ProcessPhotos] Creating new menu item immediately:",
          menuItemName
        );
        await createMenuItems(
          selectedRestaurant.id,
          [
            {
              name: menuItemName,
              description: selectedMenuItem?.description || "",
            },
          ],
          undefined,
          { skipValidation: true, isFromOCR: false }
        );

        // Invalidate menu items query so it appears for next photo
        await queryClient.invalidateQueries({
          queryKey: ["menu_items", selectedRestaurant.id],
        });
      }

      // Mark as processed (save data for later)
      const newProcessedPhoto: ProcessedPhoto = {
        photoId: currentPhoto.id,
        photo: currentPhoto.file,
        restaurant: selectedRestaurant,
        menuItemName,
        menuItemDescription: selectedMenuItem?.description || "",
        rating: rating!,
        notes: notes || "",
        isNewMenuItem: false, // Already created above, so mark as false
        captureDate: photoDate,
      };

      // Check if this photo was already processed (user went back and re-edited)
      const existingIndex = processedPhotos.findIndex(
        (p) => p.photoId === currentPhoto.id
      );
      let updatedProcessedPhotos: ProcessedPhoto[];

      if (existingIndex !== -1) {
        // Update existing entry
        updatedProcessedPhotos = [...processedPhotos];
        updatedProcessedPhotos[existingIndex] = newProcessedPhoto;
      } else {
        // Add new entry
        updatedProcessedPhotos = [...processedPhotos, newProcessedPhoto];
      }

      setProcessedPhotos(updatedProcessedPhotos);

      // Save to draft
      await processPhotosDraftService.saveProcessedPhoto(
        currentPhoto.id,
        currentPhoto.file,
        selectedRestaurant,
        menuItemName,
        selectedMenuItem?.description || "",
        rating!,
        notes || "",
        false // Already created, not a new item anymore
      );

      console.log(
        "[ProcessPhotos] Photo marked as processed:",
        newProcessedPhoto
      );

      // Move to next photo or finish
      if (currentPhotoIndex < photos.length - 1) {
        const nextPhotoIndex = currentPhotoIndex + 1;
        setCurrentPhotoIndex(nextPhotoIndex);

        // Reset form for next photo
        setSelectedRestaurant(null);
        setSelectedMenuItem(null);
        setMenuItemName("");
        setMenuItemSearchQuery("");
        setMenuItemSelectionMode("search");
        setIsCreatingNewItem(false);
        setRating(3);
        setNotes("");
        handleRemoveMenuItemPhoto();
      } else {
        // All photos processed - create visits
        handleFinishProcessing(updatedProcessedPhotos);
      }
    } catch (error: any) {
      console.error("[ProcessPhotos] Failed to create menu item:", error);
      alert(`Failed to create menu item: ${error.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishProcessing = async (
    allProcessedPhotos: ProcessedPhoto[]
  ) => {
    console.log(
      "[ProcessPhotos] Finishing processing with",
      allProcessedPhotos.length,
      "photos"
    );
    // Navigate to review screen instead of immediately creating visits
    setScreen("review");
  };

  const handleSubmitVisits = async () => {
    console.log(
      "[ProcessPhotos] Submitting visits with",
      processedPhotos.length,
      "photos"
    );
    setIsProcessing(true);

    try {
      // Group photos by restaurant AND date
      const photosByRestaurantAndDate = new Map<string, ProcessedPhoto[]>();
      for (const photo of processedPhotos) {
        const restaurantId = photo.restaurant.id;
        // Normalize date to start of day for grouping
        const photoDate = photo.captureDate || new Date();
        const dateKey = format(photoDate, 'yyyy-MM-dd');
        const groupKey = `${restaurantId}__${dateKey}`;

        if (!photosByRestaurantAndDate.has(groupKey)) {
          photosByRestaurantAndDate.set(groupKey, []);
        }
        photosByRestaurantAndDate.get(groupKey)!.push(photo);
      }

      console.log(
        "[ProcessPhotos] Grouped into",
        photosByRestaurantAndDate.size,
        "visits (restaurant + date combinations)"
      );

      // Create a visit for each restaurant-date combination
      for (const [groupKey, restaurantPhotos] of photosByRestaurantAndDate) {
        const restaurant = restaurantPhotos[0].restaurant;
        const visitDate = restaurantPhotos[0].captureDate || new Date();

        console.log(
          "[ProcessPhotos] Creating visit for restaurant:",
          restaurant.name,
          "on date:",
          format(visitDate, 'yyyy-MM-dd')
        );

        // Menu items are already created immediately when user processes each photo
        // (in handleSubmitCurrent), so no need to create them here again

        // Prepare visit data
        const foodItems = restaurantPhotos.map((p) => ({
          name: p.menuItemName,
          description: p.menuItemDescription,
          rating: p.rating,
          notes: p.notes,
        }));

        const itemPhotos = new Map<number, File>();
        restaurantPhotos.forEach((p, index) => {
          itemPhotos.set(index, p.photo);
        });

        // Create visit with all food items using the photo's date
        await visitCreationMutation.mutateAsync({
          restaurant: restaurant.id,
          visitDate: visitDate.toISOString(),
          visibility: visitVisibility,
          notes: "",
          foodItems,
          itemPhotos,
        });

        console.log("[ProcessPhotos] Visit created successfully");
      }

      // Clear draft on success
      await processPhotosDraftService.clearDraft();

      localStorage.setItem("hasRatedBefore", "true");
      navigate({ to: "/home" });
    } catch (error: any) {
      console.error("[ProcessPhotos] Failed to create visits:", error);
      alert(
        `Failed to save: ${error.message || "Unknown error"}. Check browser console for details.`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (screen === "upload" && photos.length === 0) {
      // Go back to choice screen from upload
      setScreen("choice");
      setProcessType(null);
    } else if (screen === "process" && currentPhotoIndex === 0) {
      // Go back to upload screen to review photos
      setScreen("upload");
    } else {
      // Clear draft and exit completely
      await processPhotosDraftService.clearDraft();
      navigate({ to: "/add-visit" });
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    const updatedPhotos = photos.filter((p) => p.id !== photoId);
    setPhotos(updatedPhotos);

    // Clear draft if no photos left, but stay on page to allow adding more
    if (updatedPhotos.length === 0) {
      await processPhotosDraftService.clearDraft();
    }
  };

  const handleStartProcessing = () => {
    if (photos.length > 0) {
      setCurrentPhotoIndex(0);
      setScreen("process");
    }
  };

  const handleEditFromReview = () => {
    // Go back to the last photo for step-by-step backward navigation
    setCurrentPhotoIndex(photos.length - 1);
    setScreen("process");
  };

  // Quick Track handlers
  const handleSaveQuickTrackPhoto = () => {
    if (!qtItemName.trim() || qtRating === null) {
      return;
    }

    const quickTrackData: QuickTrackPhotoData = {
      photoId: currentPhoto.id,
      photo: currentPhoto.file,
      previewUrl: currentPhoto.previewUrl,
      itemName: qtItemName,
      category: qtCategory,
      rating: qtRating,
      locationText: qtLocationText,
      notes: qtNotes,
      visibility: qtVisibility,
    };

    setQuickTrackPhotos([...quickTrackPhotos, quickTrackData]);

    // Reset form for next photo
    setQtItemName("");
    setQtCategory("");
    setQtRating(3);
    setQtLocationText("");
    setQtNotes("");
    // Keep visibility the same for convenience

    // Move to next photo or review
    if (currentPhotoIndex < photos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    } else {
      setScreen("review");
    }
  };

  const handleSubmitQuickTrackItems = async () => {
    // This will save all quick track items
    setIsProcessing(true);

    try {
      // Process each quick track item
      for (const item of quickTrackPhotos) {
        await quickTrackMutation.mutateAsync({
          name: item.itemName,
          rating: item.rating,
          notes: item.notes || undefined,
          itemCategory: item.category || undefined,
          location_text: item.locationText || undefined,
          photo: item.photo,
          visibility: item.visibility,
        });
      }

      // Success - navigate to home
      await processPhotosDraftService.clearDraft();
      navigate({ to: "/home" });
    } catch (error) {
      console.error("Failed to save quick track items:", error);
      alert("Failed to save quick track items. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Review Screen - Show preview of visits/quick track items to be created
  if (screen === "review") {
    // Quick Track Review Screen
    if (processType === "quickTrack") {
      return (
        <div className="flex flex-col h-full bg-gray-50">
          {/* Header */}
          <div className="bg-white border-b-2 border-blue-500 px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-blue-100 p-1.5 rounded">
                <Check className="h-4 w-4 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Review Quick Track Items
              </h1>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-8">
              {quickTrackPhotos.length} item
              {quickTrackPhotos.length !== 1 ? "s" : ""} ready to save
            </p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {quickTrackPhotos.map((item, index) => (
              <Card key={item.photoId}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {/* Photo */}
                    <img
                      src={item.previewUrl}
                      alt={item.itemName}
                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                    />

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.itemName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            RATING_COLORS[item.rating - 1] || "bg-gray-300"
                          }`}
                        />
                        <span className="text-sm text-gray-600">
                          {RATING_LABELS[item.rating - 1] || "Unknown"}
                        </span>
                      </div>
                      {item.category && (
                        <p className="text-xs text-gray-500 mt-1">
                          {ITEM_CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                        </p>
                      )}
                      {item.locationText && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {item.locationText}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-gray-600 mt-1 italic line-clamp-2">
                          "{item.notes}"
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {item.visibility === 'friends' ? 'Visible to friends' : 'Private'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Footer */}
          {!isKeyboardVisible && (
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleEditFromReview}
                  className="flex-1"
                >
                  Edit
                </Button>
                <Button
                  onClick={handleSubmitQuickTrackItems}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isProcessing ? "Saving..." : "Save All Items"}
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Restaurant Visit Review Screen - Group by restaurant AND date
    const photosByRestaurantAndDate = new Map<string, ProcessedPhoto[]>();
    for (const photo of processedPhotos) {
      const restaurantId = photo.restaurant.id;
      // Normalize date to start of day for grouping
      const photoDate = photo.captureDate || new Date();
      const dateKey = format(photoDate, 'yyyy-MM-dd');
      const groupKey = `${restaurantId}__${dateKey}`;

      if (!photosByRestaurantAndDate.has(groupKey)) {
        photosByRestaurantAndDate.set(groupKey, []);
      }
      photosByRestaurantAndDate.get(groupKey)!.push(photo);
    }

    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b-2 border-blue-500 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-blue-100 p-1.5 rounded">
              <Check className="h-4 w-4 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Review Your Visits
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-8">
            {photosByRestaurantAndDate.size} visit
            {photosByRestaurantAndDate.size !== 1 ? "s" : ""} •{" "}
            {processedPhotos.length} item
            {processedPhotos.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Review Notice */}
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <p className="text-sm text-blue-800">
            Review your entries below. You can edit or submit when ready.
          </p>
        </div>

        {/* Visibility Checkbox */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={visitVisibility === 'friends'}
                onChange={(e) => setVisitVisibility(e.target.checked ? 'friends' : 'private')}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Friends can view these visits</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {visitVisibility === 'friends'
                    ? 'Your friends will be able to see these visits and your ratings'
                    : 'Only you will be able to see these visits'}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Content - Visits Preview */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Array.from(photosByRestaurantAndDate.entries()).map(
            ([groupKey, restaurantPhotos]) => {
              const restaurant = restaurantPhotos[0].restaurant;
              const visitDate = restaurantPhotos[0].captureDate || new Date();

              return (
                <Card key={groupKey} className="border-l-4 border-l-blue-500">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {restaurant.name}
                        </CardTitle>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center gap-1 text-orange-700 font-semibold">
                            📅 {format(visitDate, 'EEEE, MMMM d, yyyy')}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3" />
                            {restaurant.location}
                            {restaurant.cuisineType &&
                              ` • ${restaurant.cuisineType}`}
                          </div>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {restaurantPhotos.length > 0 ? (
                      <div className="space-y-2">
                        {restaurantPhotos.map((processedPhoto) => {
                          const photoUrl = URL.createObjectURL(
                            processedPhoto.photo
                          );

                          return (
                            <div
                              key={processedPhoto.photoId}
                              className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                            >
                              {/* Photo thumbnail */}
                              <img
                                src={photoUrl}
                                alt={processedPhoto.menuItemName}
                                className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                              />

                              <div className="flex-1 min-w-0 pr-2">
                                <p className="font-medium text-gray-900 break-words">
                                  {processedPhoto.menuItemName}
                                </p>
                                {processedPhoto.menuItemDescription && (
                                  <p className="text-sm text-gray-500 mt-0.5">
                                    {processedPhoto.menuItemDescription}
                                  </p>
                                )}
                                {processedPhoto.notes && (
                                  <p className="text-xs text-gray-600 mt-1 italic">
                                    "{processedPhoto.notes}"
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-3 h-3 rounded-full ${
                                      RATING_COLORS[
                                        processedPhoto.rating - 1
                                      ] || "bg-gray-300"
                                    }`}
                                  />
                                  <span className="text-xs text-gray-600 whitespace-nowrap">
                                    {RATING_LABELS[processedPhoto.rating - 1] ||
                                      "Unknown"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">
                        No items recorded
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>

        {/* Footer - Action Buttons */}
        {!isKeyboardVisible && (
          <div className="bg-white border-t border-gray-200 p-4">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleEditFromReview}
                disabled={isProcessing}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                onClick={handleSubmitVisits}
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isProcessing ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Choice Screen - Select process type
  if (screen === "choice") {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate({ to: "/add-visit" })}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              Process Photos
            </h1>
            <div className="w-9" /> {/* Spacer for alignment */}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            What would you like to track?
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col items-center justify-center gap-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Choose tracking type
          </h2>

          {/* Restaurant Visit Option */}
          <Card
            className="w-full max-w-md cursor-pointer hover:border-primary transition-colors"
            onClick={() => {
              setProcessType("restaurant");
              setScreen("upload");
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="w-5 h-5 text-primary" />
                Restaurant Visit
              </CardTitle>
              <CardDescription>
                Track a meal at a restaurant with multiple dishes
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Quick Track Items Option */}
          <Card
            className="w-full max-w-md cursor-pointer hover:border-primary transition-colors"
            onClick={() => {
              setProcessType("quickTrack");
              setScreen("upload");
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                Quick Track Items
              </CardTitle>
              <CardDescription>
                Track individual items (snacks, groceries, homemade food, etc.)
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  // Upload Screen
  if (screen === "upload") {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Process Saved Photos
            </h1>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Upload and rate multiple food photos
          </p>
          {processType && (
            <div className="mt-2">
              <Badge variant="secondary" className="gap-1.5">
                {processType === "restaurant" ? (
                  <>
                    <Store className="w-3 h-3" />
                    Restaurant Visit
                  </>
                ) : (
                  <>
                    <Camera className="w-3 h-3" />
                    Quick Track Items
                  </>
                )}
              </Badge>
            </div>
          )}
        </div>

        {/* Upload Screen */}
        {photos.length === 0 ? (
          // No photos selected yet - show upload UI
          <div className="flex-1 p-4 flex flex-col items-center justify-center">
            <Upload className="h-20 w-20 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Upload Photos</h2>
            <p className="text-muted-foreground text-center mb-8 max-w-md">
              Select multiple photos from your camera roll. You'll select a
              restaurant and rate each photo.
            </p>

            <label
              htmlFor="photo-upload"
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium cursor-pointer hover:bg-primary/90 transition-colors"
            >
              Choose Photos
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          // Photos selected - show review UI
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-muted-foreground mb-4">
                {photos.length} photo{photos.length !== 1 ? "s" : ""} selected.
                Review and remove any you don't want to process.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
                  >
                    <img
                      src={photo.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0 opacity-90"
                        onClick={() => handleRemovePhoto(photo.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                      Photo {index + 1}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add more photos button */}
              <div className="mt-4">
                <label
                  htmlFor="photo-upload-more"
                  className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
                >
                  <Upload className="h-5 w-5 text-muted-foreground mr-2" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Add More Photos
                  </span>
                  <input
                    id="photo-upload-more"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;

                      const newPhotos: PhotoToProcess[] = await Promise.all(
                        files.map(async (file, index) => ({
                          id: `${Date.now()}-${index}`,
                          file,
                          previewUrl: URL.createObjectURL(file),
                          captureDate: await extractImageCaptureDate(file),
                        }))
                      );

                      setPhotos([...photos, ...newPhotos]);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Footer with Cancel/Next buttons */}
            {!isKeyboardVisible && (
              <div className="bg-white border-t border-gray-200 p-4">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleStartProcessing} className="flex-1">
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Processing Screen
  const currentPhoto = photos[currentPhotoIndex];

  // Quick Track Processing Screen
  if (processType === "quickTrack") {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Quick Track Item
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Photo {currentPhotoIndex + 1} of {photos.length}
          </p>

          {/* Progress bar */}
          <div className="h-1 bg-gray-200 rounded-full mt-3">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{
                width: `${((currentPhotoIndex + 1) / photos.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Photo Preview */}
          <div className="mb-4">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity">
              <img
                src={currentPhoto.previewUrl}
                alt="Food photo"
                className="w-full h-full object-contain"
                onClick={() =>
                  setFullscreenPhoto({
                    url: currentPhoto.previewUrl,
                    dishName: qtItemName || "Photo",
                  })
                }
              />
            </div>
          </div>

          {/* Quick Track Form - Similar to QuickTrackPage */}

          {/* Item Name */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qtItemName" className="font-semibold">
                  Item Name *
                </Label>
                <Input
                  id="qtItemName"
                  type="text"
                  value={qtItemName}
                  onChange={(e) => setQtItemName(e.target.value)}
                  placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
                  maxLength={200}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Category */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qtCategory" className="font-semibold">
                  Category (Optional)
                </Label>
                <Select value={qtCategory} onValueChange={setQtCategory}>
                  <SelectTrigger id="qtCategory">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Rating Legend */}
          <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
            <CardContent className="px-4">
              <button
                type="button"
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="w-full flex items-center justify-between"
              >
                <Label className="text-sm font-semibold text-gray-700 cursor-pointer">
                  Rating Guide
                </Label>
                {isLegendExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </button>
              {isLegendExpanded && (
                <div className="space-y-2 mt-3">
                  {RATING_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center gap-3">
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

          {/* Rating */}
          <Card>
            <CardContent className="space-y-3">
              <div>
                <Label className="font-semibold">Rating *</Label>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {RATING_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setQtRating(option.value)}
                      className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-opacity ${
                        option.color
                      } ${
                        qtRating === option.value
                          ? "ring-2 ring-offset-2 ring-blue-500"
                          : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      {option.value}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2 text-center">
                  {RATING_OPTIONS.find((o) => o.value === qtRating)?.label}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qtLocation" className="font-semibold">
                  Location (Optional)
                </Label>
                <Input
                  id="qtLocation"
                  type="text"
                  value={qtLocationText}
                  onChange={(e) => setQtLocationText(e.target.value)}
                  placeholder="e.g., 7-Eleven on Main St, Trader Joe's"
                  maxLength={200}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="qtNotes" className="font-semibold">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="qtNotes"
                  value={qtNotes}
                  onChange={(e) => setQtNotes(e.target.value)}
                  placeholder="Any additional thoughts or details..."
                  maxLength={1000}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Visibility */}
          <Card>
            <CardContent className="space-y-3">
              <div className="p-3 bg-white rounded-lg border border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qtVisibility === 'friends'}
                    onChange={(e) => setQtVisibility(e.target.checked ? 'friends' : 'private')}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium">Friends can view this item</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {qtVisibility === 'friends'
                        ? 'Your friends will be able to see this quick track item'
                        : 'Only you will be able to see this item'}
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        {!isKeyboardVisible && (
          <div className="bg-white border-t border-gray-200 p-4">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (currentPhotoIndex > 0) {
                    setCurrentPhotoIndex(currentPhotoIndex - 1);
                  } else {
                    setScreen("upload");
                  }
                }}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSaveQuickTrackPhoto}
                disabled={!qtItemName.trim() || qtRating === null}
                className="flex-1"
              >
                {currentPhotoIndex < photos.length - 1 ? "Next" : "Review"}
                {currentPhotoIndex < photos.length - 1 && (
                  <ChevronRight className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Restaurant Visit Processing Screen (existing)
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Process Saved Photos
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Photo {currentPhotoIndex + 1} of {photos.length}
        </p>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full mt-3">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{
              width: `${((currentPhotoIndex + 1) / photos.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Photo Preview */}
        <div className="mb-4">
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity">
            <img
              src={currentPhoto.previewUrl}
              alt="Food photo"
              className="w-full h-full object-contain"
              onClick={() =>
                setFullscreenPhoto({
                  url: currentPhoto.previewUrl,
                  dishName: menuItemName || selectedMenuItem?.name || "Photo",
                })
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
                onRestaurantSelected={handleRestaurantSelected}
                restaurants={filteredRestaurants}
                searchQuery={restaurantSearchQuery}
                onSearchQueryChange={setRestaurantSearchQuery}
                locationQuery={locationSearchQuery}
                onLocationQueryChange={setLocationSearchQuery}
                isOnline={isOnline}
                onOpenCamera={() => setShowCameraMode(true)}
                previousRestaurant={
                  processedPhotos.length > 0
                    ? processedPhotos[processedPhotos.length - 1].restaurant
                    : null
                }
                onUsePreviousRestaurant={() => {
                  const prevRestaurant =
                    processedPhotos[processedPhotos.length - 1].restaurant;
                  handleRestaurantSelected(prevRestaurant);
                }}
                showSameAsAbove={
                  currentPhotoIndex > 0 && processedPhotos.length > 0
                }
                restaurantCreationMutation={restaurantCreationMutation}
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
                      setMenuItemSelectionMode(
                        value as "search" | "scan" | "create"
                      )
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
                            onChange={(e) =>
                              setMenuItemSearchQuery(e.target.value)
                            }
                            disabled={isProcessing}
                            className="text-base"
                          />

                          {filteredMenuItems.length > 0 && (
                            <div className="max-h-48 overflow-y-auto space-y-2">
                              {filteredMenuItems.slice(0, 20).map((item) => {
                                const isUserCreated = item.createdBy === pb.authStore.model?.id;
                                const isEditing = editingMenuItemId === item.id;

                                return (
                                  <Card
                                    key={item.id}
                                    className={`${!isEditing ? 'cursor-pointer hover:border-blue-500 hover:bg-blue-50' : ''} transition-all py-2`}
                                    onClick={
                                      !isEditing
                                        ? () => {
                                            setSelectedMenuItem(item);
                                            setMenuItemName(item.name);
                                            setMenuItemSearchQuery("");
                                            scrollToDateCard();
                                          }
                                        : undefined
                                    }
                                  >
                                    <CardContent>
                                      {isEditing ? (
                                        <div className="flex items-center gap-2">
                                          <Input
                                            type="text"
                                            value={editingMenuItemName}
                                            onChange={(e) =>
                                              setEditingMenuItemName(e.target.value)
                                            }
                                            placeholder="Menu item name"
                                            className="flex-1"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleEditMenuItem(item.id);
                                              } else if (e.key === "Escape") {
                                                setEditingMenuItemId(null);
                                                setEditingMenuItemName("");
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleEditMenuItem(item.id);
                                            }}
                                            disabled={
                                              !editingMenuItemName.trim() || isProcessing
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
                                              setEditingMenuItemId(null);
                                              setEditingMenuItemName("");
                                            }}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium">
                                              {item.name}
                                            </div>
                                            {item.description && (
                                              <div className="text-sm text-muted-foreground mt-1">
                                                {item.description}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {isUserCreated && (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingMenuItemId(item.id);
                                                  setEditingMenuItemName(item.name);
                                                }}
                                                className="h-8 w-8 p-0"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </Button>
                                            )}
                                            <Check className="w-5 h-5 text-gray-300 flex-shrink-0" />
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
                                    setSelectedMenuItem(null);
                                    setMenuItemName("");
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
                        onPhotoCapture={handleMenuItemPhotoCapture}
                        onRemoveNewPhoto={handleRemoveMenuItemPhoto}
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
                              {filteredMenuItems.slice(0, 20).map((item) => {
                                const isUserCreated = item.createdBy === pb.authStore.model?.id;
                                const isEditing = editingMenuItemId === item.id;

                                return (
                                  <Card
                                    key={item.id}
                                    className={`${!isEditing ? 'cursor-pointer hover:border-blue-500 hover:bg-blue-50' : ''} transition-all px-2`}
                                    onClick={
                                      !isEditing
                                        ? () => {
                                            setSelectedMenuItem(item);
                                            setMenuItemName(item.name);
                                            // Switch to search tab after selection
                                            setMenuItemSelectionMode("search");
                                            scrollToDateCard();
                                          }
                                        : undefined
                                    }
                                  >
                                    <CardContent>
                                      {isEditing ? (
                                        <div className="flex items-center gap-2">
                                          <Input
                                            type="text"
                                            value={editingMenuItemName}
                                            onChange={(e) =>
                                              setEditingMenuItemName(e.target.value)
                                            }
                                            placeholder="Menu item name"
                                            className="flex-1"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleEditMenuItem(item.id);
                                              } else if (e.key === "Escape") {
                                                setEditingMenuItemId(null);
                                                setEditingMenuItemName("");
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleEditMenuItem(item.id);
                                            }}
                                            disabled={
                                              !editingMenuItemName.trim() || isProcessing
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
                                              setEditingMenuItemId(null);
                                              setEditingMenuItemName("");
                                            }}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium">
                                              {item.name}
                                            </div>
                                            {item.description && (
                                              <div className="text-sm text-muted-foreground mt-1">
                                                {item.description}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {isUserCreated && (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingMenuItemId(item.id);
                                                  setEditingMenuItemName(item.name);
                                                }}
                                                className="h-8 w-8 p-0"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </Button>
                                            )}
                                            <Check className="w-5 h-5 text-gray-300 flex-shrink-0" />
                                          </div>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                );
                              })}
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
                        onChange={(e) => setMenuItemName(e.target.value)}
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
                            handleCreateMenuItem();
                          }
                        }}
                      />

                      <Button
                        onClick={handleCreateMenuItem}
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
                        value={photoDate ? format(photoDate, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                          const newDate = e.target.value ? new Date(e.target.value) : new Date();
                          setPhotoDate(newDate);
                        }}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        className="text-base"
                      />
                      <p className="text-xs text-gray-600">
                        {photoDate && currentPhoto.captureDate && photoDate.getTime() !== currentPhoto.captureDate.getTime()
                          ? `Original: ${format(currentPhoto.captureDate, 'MMM dd, yyyy')}`
                          : 'Detected from photo EXIF data'}
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
                          onClick={() => setIsLegendExpanded(!isLegendExpanded)}
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
                      <div className="grid grid-cols-5 gap-2">
                        {RATING_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setRating(option.value)}
                            disabled={isProcessing}
                            className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-opacity ${
                              option.color
                            } ${
                              rating === option.value
                                ? "ring-2 ring-offset-2 ring-blue-500"
                                : "opacity-60 hover:opacity-100"
                            }`}
                          >
                            {option.value}
                          </button>
                        ))}
                      </div>
                      {rating !== null && (
                        <p className="text-xs text-gray-600 mt-2 text-center">
                          {
                            RATING_OPTIONS.find((o) => o.value === rating)
                              ?.label
                          }
                        </p>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="notes"
                        className="text-base font-semibold"
                      >
                        Notes (Optional)
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
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
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            {/* Left button: Cancel on first photo, Previous on others */}
            <Button
              variant="outline"
              onClick={() => {
                if (currentPhotoIndex === 0) {
                  // Cancel - clear draft and go back
                  handleCancel();
                } else {
                  // Previous photo
                  setCurrentPhotoIndex(currentPhotoIndex - 1);
                }
              }}
              disabled={isProcessing}
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {currentPhotoIndex === 0 ? "Cancel" : "Previous"}
            </Button>

            {/* Right button: Save & Next (or disabled Next if incomplete) */}
            <Button
              onClick={(e) => {
                e.preventDefault();
                handleSubmitCurrent();
              }}
              className="flex-1"
              disabled={
                !selectedRestaurant ||
                !selectedMenuItem ||
                rating === null ||
                isProcessing
              }
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isProcessing
                ? "Saving..."
                : currentPhotoIndex < photos.length - 1
                  ? "Save & Next"
                  : "Save & Finish"}
              {currentPhotoIndex < photos.length - 1 && !isProcessing && (
                <ChevronRight className="ml-2 h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <AlertDialog open={showBackDialog} onOpenChange={setShowBackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {backDialogType === "upload" ? "Go back?" : "Cancel processing?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {backDialogType === "upload"
                ? "You'll need to re-upload photos if you go back."
                : "Unprocessed photos will be lost. Are you sure you want to cancel?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (backDialogType === "upload") {
                  setPhotos([]);
                  setScreen("upload");
                } else {
                  navigate({ to: "/add-visit" });
                }
                setShowBackDialog(false);
              }}
            >
              {backDialogType === "upload" ? "Go Back" : "Cancel Processing"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showRequiredFieldsDialog}
        onOpenChange={setShowRequiredFieldsDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Required Fields</AlertDialogTitle>
            <AlertDialogDescription>
              Please fill in all required fields: restaurant, menu item name,
              and rating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowRequiredFieldsDialog(false)}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Camera Mode Modal */}
      {showCameraMode && (
        <div className="fixed inset-0 z-50 bg-white">
          <RestaurantNameFinder
            onSelectName={(name) => {
              // TODO: Auto-search for this restaurant name and select if found
              // For now, just close the camera mode
              setShowCameraMode(false);
            }}
            onClose={() => setShowCameraMode(false)}
          />
        </div>
      )}

      {/* Fullscreen Photo Viewer */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            onClick={() => setFullscreenPhoto(null)}
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors z-10"
            aria-label="Close fullscreen view"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-4 left-4 text-white bg-black/50 px-3 py-2 rounded-lg">
            <p className="font-medium">{fullscreenPhoto.dishName}</p>
          </div>
          <img
            src={fullscreenPhoto.url}
            alt={fullscreenPhoto.dishName}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
