import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ArrowLeft, Upload, Loader2, ChevronRight, ChevronDown, ChevronUp, Copy, Camera, Search, Check, History, WifiOff, Store, X, MapPin } from "lucide-react";
import { RATING_OPTIONS, RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { useOfflineVisitCreation } from "@/hooks/useOfflineVisitCreation";
import { useOfflineRestaurantCreation } from "@/hooks/useOfflineRestaurantCreation";
import { useSync } from "@/contexts/SyncContext";
import RestaurantNameFinder from "@/components/RestaurantNameFinder";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import { pb, Restaurant, MenuItem } from "@/lib/pocketbase";
import { createMenuItems } from "@/services/ocrService";
import { processPhotosDraftService, dataUrlToFile } from "@/services/processPhotosDraftService";
import { Switch } from "@/components/ui/switch";
import {
  searchAndCacheRestaurantsByText,
} from "@/services/googlePlaces";

type ScreenState = 'upload' | 'process' | 'review';

interface PhotoToProcess {
  id: string;
  file: File;
  previewUrl: string;
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

  // Add restaurant state
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState("");
  const [newRestaurantLocation, setNewRestaurantLocation] = useState("");
  const [newRestaurantCuisine, setNewRestaurantCuisine] = useState("");
  const [isCreatingRestaurant, setIsCreatingRestaurant] = useState(false);

  // Load camera history
  useEffect(() => {
    try {
      const saved = localStorage.getItem('restaurantNameFinderHistory');
      if (saved) {
        setCameraHistory(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to load camera history:', err);
    }
  }, []);

  const handleGooglePlacesSearch = async () => {
    if (!isOnline) {
      setSearchError("Cannot search while offline. Google Places requires internet connection.");
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
      setSearchError(err instanceof Error ? err.message : "Failed to search restaurants");
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
      <Card className="border-primary">
        <CardContent className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <div className="font-medium">{selectedRestaurant.name}</div>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {selectedRestaurant.location}
                {selectedRestaurant.cuisineType && ` • ${selectedRestaurant.cuisineType}`}
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
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Add New Restaurant</Label>
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
                  <Label htmlFor="new-restaurant-location">Location (Optional)</Label>
                  <Input
                    id="new-restaurant-location"
                    value={newRestaurantLocation}
                    onChange={(e) => setNewRestaurantLocation(e.target.value)}
                    placeholder="e.g., 123 Main St, New York, NY"
                    disabled={isCreatingRestaurant}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-restaurant-cuisine">Cuisine Type (Optional)</Label>
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
              <Label className="text-sm font-medium text-primary">Google Places Results</Label>
              {googlePlaces.map((restaurant) => (
                <Card
                  key={restaurant.id}
                  className="cursor-pointer hover:border-primary transition-colors border-primary/30"
                  onClick={() => onRestaurantSelected(restaurant)}
                >
                  <CardContent className="p-3">
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
                {showGoogleResults && googlePlaces.length > 0 ? "Saved Restaurants" : "Results"}
              </Label>
              {restaurants.slice(0, 10).map((restaurant) => (
                <Card
                  key={restaurant.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => onRestaurantSelected(restaurant)}
                >
                  <CardContent className="p-3">
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

          {/* Empty states */}
          {!showGoogleResults && restaurants.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Store className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{searchQuery ? "No saved restaurants found" : "No saved restaurants yet"}</p>
              <p className="text-xs mt-1">Use the search button to find restaurants on Google Places</p>
            </div>
          )}

          {showGoogleResults && googlePlaces.length === 0 && restaurants.length === 0 && (
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
            Take or upload a photo of the restaurant sign or menu to automatically detect the name
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
            cameraHistory.slice().reverse().map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <img
                      src={item.imagePreview}
                      alt="Scanned"
                      className="w-16 h-16 object-cover rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      {item.result.found && item.result.options && item.result.options.length > 0 ? (
                        <div className="space-y-1">
                          {item.result.options.slice(0, 2).map((option, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                // Search for this restaurant name in saved restaurants
                                const found = restaurants.find(r =>
                                  r.name.toLowerCase() === option.name.toLowerCase()
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

  // Screen state
  const [screen, setScreen] = useState<ScreenState>('upload');

  // Photo management
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);

  // Form state for current photo
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [menuItemName, setMenuItemName] = useState("");
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState("");
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);
  const [rating, setRating] = useState<number | null>(3); // Default to "worth trying"
  const [notes, setNotes] = useState("");
  const [menuItemPhoto, setMenuItemPhoto] = useState<File | null>(null);
  const [menuItemPhotoPreview, setMenuItemPhotoPreview] = useState<string | null>(null);

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);
  const [isProcessing, setIsProcessing] = useState(false);

  // Dialog state
  const [showBackDialog, setShowBackDialog] = useState(false);
  const [backDialogType, setBackDialogType] = useState<'upload' | 'cancel'>('cancel');
  const [showRequiredFieldsDialog, setShowRequiredFieldsDialog] = useState(false);
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

  const filteredRestaurants = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      (r.cuisineType?.toLowerCase() || "").includes(
        restaurantSearchQuery.toLowerCase()
      )
  );

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
    .filter(p => p.restaurant?.id === selectedRestaurant?.id)
    .map(p => p.menuItemName.toLowerCase());

  const filteredMenuItems = menuItems.filter((item) =>
    item.name.toLowerCase().includes(menuItemSearchQuery.toLowerCase()) &&
    !usedMenuItemNames.includes(item.name.toLowerCase())
  );

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos: PhotoToProcess[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPhotos(newPhotos);
    setCurrentPhotoIndex(0);
    setScreen('process');

    // Save to draft
    await processPhotosDraftService.savePhotos(files);

    e.target.value = ""; // Reset input
  };

  // Load draft on mount
  useEffect(() => {
    const draft = processPhotosDraftService.getDraft();
    if (draft.photos.length > 0) {
      console.log('[ProcessPhotos] Restoring draft with', draft.photos.length, 'photos');

      // Convert data URLs back to File objects
      const restoredPhotos: PhotoToProcess[] = draft.photos.map((p) => {
        const file = dataUrlToFile(p.dataUrl, `photo-${p.id}.jpg`);
        return {
          id: p.id,
          file,
          previewUrl: URL.createObjectURL(file),
        };
      });

      setPhotos(restoredPhotos);
      setCurrentPhotoIndex(draft.currentPhotoIndex);
      setScreen('process');

      // Restore processed photos (convert data URLs to Files)
      const restoredProcessed: ProcessedPhoto[] = draft.processedPhotos.map((p) => ({
        ...p,
        photo: dataUrlToFile(p.photoDataUrl, `photo-${p.photoId}.jpg`),
      }));
      setProcessedPhotos(restoredProcessed);

      // Restore current form state if available
      if (draft.currentFormState) {
        setSelectedRestaurant(draft.currentFormState.selectedRestaurant);
        setMenuItemName(draft.currentFormState.menuItemName);
        setRating(draft.currentFormState.rating);
        setNotes(draft.currentFormState.notes);
        setIsCreatingNewItem(draft.currentFormState.isCreatingNewItem);
      }
    }
  }, []);

  // Disable "Create new" mode when going offline
  useEffect(() => {
    if (!isOnline && isCreatingNewItem) {
      setIsCreatingNewItem(false);
    }
  }, [isOnline, isCreatingNewItem]);

  // Save form state to draft when it changes
  useEffect(() => {
    if (screen === 'process' && photos.length > 0) {
      processPhotosDraftService.saveFormState(
        selectedRestaurant,
        menuItemName,
        rating,
        notes,
        isCreatingNewItem
      );
    }
  }, [screen, photos.length, selectedRestaurant, menuItemName, rating, notes, isCreatingNewItem]);

  // Reset form when photo index changes
  useEffect(() => {
    if (screen === 'process' && photos.length > 0) {
      // Save current index to draft
      processPhotosDraftService.saveCurrentIndex(currentPhotoIndex);

      // Reset form for new photo
      setSelectedRestaurant(null);
      setSelectedMenuItem(null);
      setMenuItemName("");
      setMenuItemSearchQuery("");
      setIsCreatingNewItem(false);
      setRating(3);
      setNotes("");
      handleRemoveMenuItemPhoto();
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
  };

  const handleMenuItemPhotoCapture = (key: string | number, file: File) => {
    setMenuItemPhoto(file);
    const previewUrl = URL.createObjectURL(file);
    if (menuItemPhotoPreview) {
      URL.revokeObjectURL(menuItemPhotoPreview);
    }
    setMenuItemPhotoPreview(previewUrl);
  };

  const handleRemoveMenuItemPhoto = () => {
    setMenuItemPhoto(null);
    if (menuItemPhotoPreview) {
      URL.revokeObjectURL(menuItemPhotoPreview);
    }
    setMenuItemPhotoPreview(null);
  };

  const handleSubmitCurrent = async () => {
    console.log('[ProcessPhotos] handleSubmitCurrent called');

    if (!selectedRestaurant || !menuItemName.trim() || rating === null) {
      console.log('[ProcessPhotos] Validation failed');
      setShowRequiredFieldsDialog(true);
      return;
    }

    setIsProcessing(true);

    try {
      const currentPhoto = photos[currentPhotoIndex];

      // If creating a new menu item, create it immediately so it's available for next photo
      if (isCreatingNewItem && isOnline) {
        console.log('[ProcessPhotos] Creating new menu item immediately:', menuItemName);
        await createMenuItems(
          selectedRestaurant.id,
          [{ name: menuItemName, description: selectedMenuItem?.description || "" }],
          undefined,
          { skipValidation: true, isFromOCR: false }
        );

        // Invalidate menu items query so it appears for next photo
        await queryClient.invalidateQueries({ queryKey: ['menu_items', selectedRestaurant.id] });
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
      };

      const updatedProcessedPhotos = [...processedPhotos, newProcessedPhoto];
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

      console.log('[ProcessPhotos] Photo marked as processed:', newProcessedPhoto);

      // Move to next photo or finish
      if (currentPhotoIndex < photos.length - 1) {
        const nextPhotoIndex = currentPhotoIndex + 1;
        setCurrentPhotoIndex(nextPhotoIndex);

        // Reset form for next photo
        setSelectedRestaurant(null);
        setSelectedMenuItem(null);
        setMenuItemName("");
        setMenuItemSearchQuery("");
        setIsCreatingNewItem(false);
        setRating(3);
        setNotes("");
        handleRemoveMenuItemPhoto();
      } else {
        // All photos processed - create visits
        handleFinishProcessing(updatedProcessedPhotos);
      }
    } catch (error: any) {
      console.error('[ProcessPhotos] Failed to create menu item:', error);
      alert(`Failed to create menu item: ${error.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishProcessing = async (allProcessedPhotos: ProcessedPhoto[]) => {
    console.log('[ProcessPhotos] Finishing processing with', allProcessedPhotos.length, 'photos');
    // Navigate to review screen instead of immediately creating visits
    setScreen('review');
  };

  const handleSubmitVisits = async () => {
    console.log('[ProcessPhotos] Submitting visits with', processedPhotos.length, 'photos');
    setIsProcessing(true);

    try {
      // Group photos by restaurant
      const photosByRestaurant = new Map<string, ProcessedPhoto[]>();
      for (const photo of processedPhotos) {
        const restaurantId = photo.restaurant.id;
        if (!photosByRestaurant.has(restaurantId)) {
          photosByRestaurant.set(restaurantId, []);
        }
        photosByRestaurant.get(restaurantId)!.push(photo);
      }

      console.log('[ProcessPhotos] Grouped into', photosByRestaurant.size, 'restaurants');

      // Create a visit for each restaurant
      for (const [restaurantId, restaurantPhotos] of photosByRestaurant) {
        const restaurant = restaurantPhotos[0].restaurant;
        console.log('[ProcessPhotos] Creating visit for restaurant:', restaurant.name);

        // Menu items are already created immediately when user processes each photo
        // (in handleSubmitCurrent), so no need to create them here again

        // Prepare visit data
        const foodItems = restaurantPhotos.map(p => ({
          name: p.menuItemName,
          description: p.menuItemDescription,
          rating: p.rating,
          notes: p.notes,
        }));

        const itemPhotos = new Map<number, File>();
        restaurantPhotos.forEach((p, index) => {
          itemPhotos.set(index, p.photo);
        });

        // Create visit with all food items
        await visitCreationMutation.mutateAsync({
          restaurant: restaurantId,
          visitDate: new Date().toISOString(),
          visibility: "private",
          notes: "",
          foodItems,
          itemPhotos,
        });

        console.log('[ProcessPhotos] Visit created successfully');
      }

      // Clear draft on success
      processPhotosDraftService.clearDraft();

      localStorage.setItem("hasRatedBefore", "true");
      navigate({ to: "/home" });
    } catch (error: any) {
      console.error("[ProcessPhotos] Failed to create visits:", error);
      alert(`Failed to save: ${error.message || 'Unknown error'}. Check browser console for details.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (screen === 'process' && currentPhotoIndex === 0) {
      // Go back to upload screen to review photos
      setScreen('upload');
    } else {
      // Clear draft and exit completely
      processPhotosDraftService.clearDraft();
      navigate({ to: "/add-visit" });
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    const updatedPhotos = photos.filter(p => p.id !== photoId);
    setPhotos(updatedPhotos);

    // If no photos left, go back to add-visit
    if (updatedPhotos.length === 0) {
      processPhotosDraftService.clearDraft();
      navigate({ to: "/add-visit" });
    }
  };

  const handleStartProcessing = () => {
    if (photos.length > 0) {
      setCurrentPhotoIndex(0);
      setScreen('process');
    }
  };

  const handleEditFromReview = () => {
    // Go back to the first photo to allow editing
    setCurrentPhotoIndex(0);
    setScreen('process');
  };

  // Review Screen - Show preview of visits to be created
  if (screen === 'review') {
    // Group processed photos by restaurant
    const photosByRestaurant = new Map<string, ProcessedPhoto[]>();
    for (const photo of processedPhotos) {
      const restaurantId = photo.restaurant.id;
      if (!photosByRestaurant.has(restaurantId)) {
        photosByRestaurant.set(restaurantId, []);
      }
      photosByRestaurant.get(restaurantId)!.push(photo);
    }

    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Review Your Visits</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {photosByRestaurant.size} visit{photosByRestaurant.size !== 1 ? 's' : ''} • {processedPhotos.length} item{processedPhotos.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Content - Visits Preview */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Array.from(photosByRestaurant.entries()).map(([restaurantId, restaurantPhotos]) => {
            const restaurant = restaurantPhotos[0].restaurant;

            return (
              <Card key={restaurantId}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {restaurant.location}
                        {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {restaurantPhotos.length > 0 ? (
                    <div className="space-y-2">
                      {restaurantPhotos.map((processedPhoto) => {
                        const photoUrl = URL.createObjectURL(processedPhoto.photo);

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
                                    RATING_COLORS[processedPhoto.rating - 1] ||
                                    "bg-gray-300"
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
          })}
        </div>

        {/* Footer - Action Buttons */}
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
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isProcessing ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Upload Screen
  if (screen === 'upload') {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Process Saved Photos</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-1">Upload and rate multiple food photos</p>
        </div>

        {/* Upload Screen */}
        {photos.length === 0 ? (
          // No photos selected yet - show upload UI
          <div className="flex-1 p-4 flex flex-col items-center justify-center">
            <Upload className="h-20 w-20 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Upload Photos</h2>
            <p className="text-muted-foreground text-center mb-8 max-w-md">
              Select multiple photos from your camera roll. You'll select a restaurant and rate each photo.
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
                {photos.length} photo{photos.length !== 1 ? 's' : ''} selected. Review and remove any you don't want to process.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo, index) => (
                  <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
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
                  <span className="text-sm font-medium text-muted-foreground">Add More Photos</span>
                  <input
                    id="photo-upload-more"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;

                      const newPhotos: PhotoToProcess[] = files.map((file, index) => ({
                        id: `${Date.now()}-${index}`,
                        file,
                        previewUrl: URL.createObjectURL(file),
                      }));

                      setPhotos([...photos, ...newPhotos]);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Footer with Cancel/Next buttons */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleStartProcessing}
                  className="flex-1"
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Processing Screen
  const currentPhoto = photos[currentPhotoIndex];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Process Saved Photos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Photo {currentPhotoIndex + 1} of {photos.length}
        </p>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full mt-3">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${((currentPhotoIndex + 1) / photos.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Photo Preview */}
        <div className="mb-4">
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
            <img
              src={currentPhoto.previewUrl}
              alt="Food photo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
        {/* Restaurant Selection Card */}
        <Card className="border-2 border-blue-200">
          <CardContent className="pt-4 space-y-2">
            <Label className="text-base font-semibold">1. Select Restaurant *</Label>
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
              previousRestaurant={processedPhotos.length > 0 ? processedPhotos[processedPhotos.length - 1].restaurant : null}
              onUsePreviousRestaurant={() => {
                const prevRestaurant = processedPhotos[processedPhotos.length - 1].restaurant;
                handleRestaurantSelected(prevRestaurant);
              }}
              showSameAsAbove={currentPhotoIndex > 0 && processedPhotos.length > 0}
              restaurantCreationMutation={restaurantCreationMutation}
            />
          </CardContent>
        </Card>

        {/* Show menu item and rating UI only when restaurant is selected */}
        {selectedRestaurant && (
          <>
            {/* Menu Item Selection Card */}
            <Card className="border-2 border-green-200">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">2. Select Menu Item *</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="create-new-toggle" className={`text-sm cursor-pointer ${!isOnline ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                    Create new {!isOnline && "(Offline)"}
                  </Label>
                  <Switch
                    id="create-new-toggle"
                    checked={isCreatingNewItem}
                    onCheckedChange={setIsCreatingNewItem}
                    disabled={isProcessing || !isOnline}
                  />
                </div>
              </div>
              {!isOnline && isCreatingNewItem && (
                <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                  <div className="flex items-center gap-2">
                    <WifiOff className="w-3 h-3" />
                    <span>You're offline. Cannot create new menu items. Switch to search mode or go online.</span>
                  </div>
                </div>
              )}

          {!isCreatingNewItem ? (
            /* Search existing menu items */
            <div className="space-y-2">
              {!selectedMenuItem ? (
                <>
                  <Input
                    type="text"
                    placeholder="Search menu items..."
                    value={menuItemSearchQuery}
                    onChange={(e) => {
                      setMenuItemSearchQuery(e.target.value);
                    }}
                    disabled={isProcessing || !selectedRestaurant}
                    className="text-base"
                  />

                  {filteredMenuItems.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {filteredMenuItems.slice(0, 20).map((item) => (
                        <Card
                          key={item.id}
                          className="cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
                          onClick={() => {
                            setSelectedMenuItem(item);
                            setMenuItemName(item.name);
                            setMenuItemSearchQuery("");
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{item.name}</div>
                                {item.description && (
                                  <div className="text-sm text-muted-foreground mt-1">{item.description}</div>
                                )}
                              </div>
                              <Check className="w-5 h-5 text-gray-300 flex-shrink-0" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {menuItems.length === 0 && !menuItemSearchQuery && (
                    <p className="text-sm text-muted-foreground">
                      No menu items found. Toggle "Create new" to add one.
                    </p>
                  )}

                  {menuItems.length > 0 && filteredMenuItems.length === 0 && menuItemSearchQuery && (
                    <p className="text-sm text-muted-foreground">
                      No matches found. Try a different search or toggle "Create new".
                    </p>
                  )}
                </>
              ) : (
                <Card className="border-green-500 bg-green-50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{selectedMenuItem.name}</div>
                        {selectedMenuItem.description && (
                          <div className="text-sm text-muted-foreground mt-1">{selectedMenuItem.description}</div>
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
            </div>
          ) : (
            /* Create new menu item */
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="e.g., Margherita Pizza, Pad Thai"
                value={menuItemName}
                onChange={(e) => setMenuItemName(e.target.value)}
                maxLength={200}
                required
                disabled={isProcessing}
                className="text-base"
              />
            </div>
          )}

          {/* Photo upload - scan menu to prepopulate items (only in search mode) */}
          {!isCreatingNewItem && (
            <MenuItemPhotoInput
              photoKey="current"
              newPhotoPreviewUrl={menuItemPhotoPreview || undefined}
              onPhotoCapture={handleMenuItemPhotoCapture}
              onRemoveNewPhoto={handleRemoveMenuItemPhoto}
              showLabel={true}
              showNewPhotoBadge={false}
              labelText="Scan Menu Photo (optional)"
              helpText="Photo of menu will be scanned to find matching items"
            />
          )}
              </CardContent>
            </Card>

        {/* Rating Selection Card */}
        <Card className="border-2 border-purple-200">
          <CardContent className="pt-4 space-y-3">
            <Label className="text-base font-semibold">3. Rate Your Food *</Label>

            {/* Rating Guide - Collapsible */}
            <Card className="border-2 border-blue-200 bg-blue-50/30">
          <CardContent className="p-4">
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

        {/* Rating Selection */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Rating *</Label>
          <div className="grid grid-cols-5 gap-2">
            {RATING_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRating(option.value)}
                disabled={isProcessing}
                className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-all ${
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
              {RATING_OPTIONS.find((o) => o.value === rating)?.label}
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-base font-semibold">
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

            {/* Error Display */}
            {visitCreationMutation.isError && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
                <p className="font-semibold">Error saving visits</p>
                <p className="text-sm">
                  {visitCreationMutation.error?.message || 'Please try again. Check browser console for details.'}
                </p>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Bottom Action Buttons - always visible */}
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
            disabled={!selectedRestaurant || !menuItemName.trim() || rating === null || isProcessing}
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

      {/* Dialogs */}
      <AlertDialog open={showBackDialog} onOpenChange={setShowBackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {backDialogType === 'upload' ? 'Go back?' : 'Cancel processing?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {backDialogType === 'upload'
                ? "You'll need to re-upload photos if you go back."
                : "Unprocessed photos will be lost. Are you sure you want to cancel?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (backDialogType === 'upload') {
                  setPhotos([]);
                  setScreen('upload');
                } else {
                  navigate({ to: "/add-visit" });
                }
                setShowBackDialog(false);
              }}
            >
              {backDialogType === 'upload' ? 'Go Back' : 'Cancel Processing'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRequiredFieldsDialog} onOpenChange={setShowRequiredFieldsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Required Fields</AlertDialogTitle>
            <AlertDialogDescription>
              Please fill in all required fields: restaurant, menu item name, and rating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowRequiredFieldsDialog(false)}>
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
    </div>
  );
}
