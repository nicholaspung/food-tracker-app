import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ArrowLeft, Upload, Loader2, ChevronRight, ChevronDown, ChevronUp, Copy, Camera, Search, Check, History, WifiOff, Store, X } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import { useOfflineQuickTrack } from "@/hooks/useOfflineQuickTrack";
import { useSync } from "@/contexts/SyncContext";
import RestaurantNameFinder from "@/components/RestaurantNameFinder";
import { pb, Restaurant } from "@/lib/pocketbase";
import {
  searchAndCacheRestaurantsByText,
} from "@/services/googlePlaces";

type ScreenState = 'upload' | 'assign-restaurants' | 'process';

interface PhotoToProcess {
  id: string;
  file: File;
  previewUrl: string;
}

interface ProcessedPhoto {
  photoId: string;
  restaurant: any;
  menuItemName: string;
  rating: number;
  notes: string;
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
}: RestaurantSelectorProps) {
  const [googlePlaces, setGooglePlaces] = useState<Restaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [cameraHistory, setCameraHistory] = useState<StoredCameraResult[]>([]);
  const [showGoogleResults, setShowGoogleResults] = useState(false);

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
        </div>

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
            Take a photo of the restaurant sign or menu to automatically detect the name
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onOpenCamera}
          >
            <Camera className="h-4 w-4 mr-2" />
            Open Camera
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
  const quickTrackMutation = useOfflineQuickTrack();

  // Screen state
  const [screen, setScreen] = useState<ScreenState>('upload');

  // Photo management
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [photoRestaurants, setPhotoRestaurants] = useState<Map<string, any>>(new Map());
  const [currentAssigningPhotoIndex, setCurrentAssigningPhotoIndex] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);

  // Form state for current photo
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [menuItemName, setMenuItemName] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);
  const [isProcessing, setIsProcessing] = useState(false);

  // Dialog state
  const [showBackDialog, setShowBackDialog] = useState(false);
  const [backDialogType, setBackDialogType] = useState<'upload' | 'assignment' | 'cancel'>('cancel');
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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos: PhotoToProcess[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPhotos(newPhotos);
    setPhotoRestaurants(new Map());
    setCurrentAssigningPhotoIndex(0);
    setCurrentPhotoIndex(0);
    setScreen('assign-restaurants');
    e.target.value = ""; // Reset input
  };

  // Pre-fill restaurant when moving to processing screen
  useEffect(() => {
    if (screen === 'process' && photos.length > 0) {
      const currentPhoto = photos[currentPhotoIndex];
      const assignedRestaurant = photoRestaurants.get(currentPhoto.id);
      if (assignedRestaurant && !selectedRestaurant) {
        setSelectedRestaurant(assignedRestaurant);
      }
    }
  }, [screen, currentPhotoIndex, photos, photoRestaurants]);

  const handleRestaurantSelected = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
  };

  // Restaurant assignment handlers
  const handleAssignRestaurant = (photoId: string, restaurant: any) => {
    setPhotoRestaurants(new Map(photoRestaurants.set(photoId, restaurant)));
  };

  const handleSameAsAbove = (photoIndex: number) => {
    if (photoIndex === 0) return;

    const previousPhoto = photos[photoIndex - 1];
    const previousRestaurant = photoRestaurants.get(previousPhoto.id);

    if (previousRestaurant) {
      const currentPhoto = photos[photoIndex];
      handleAssignRestaurant(currentPhoto.id, previousRestaurant);
    }
  };

  const handleContinueToProcessing = () => {
    setScreen('process');
    setCurrentPhotoIndex(0);
    // Pre-fill first photo's restaurant if assigned
    if (photos.length > 0) {
      const firstPhoto = photos[0];
      const assignedRestaurant = photoRestaurants.get(firstPhoto.id);
      if (assignedRestaurant) {
        setSelectedRestaurant(assignedRestaurant);
      }
    }
  };

  const handleSkipRestaurantAssignment = () => {
    setScreen('process');
    setCurrentPhotoIndex(0);
  };

  const handleSubmitCurrent = async () => {
    if (!selectedRestaurant || !menuItemName.trim() || rating === null) {
      setShowRequiredFieldsDialog(true);
      return;
    }

    setIsProcessing(true);
    const currentPhoto = photos[currentPhotoIndex];

    try {
      // Save this photo's data using Quick Track
      await quickTrackMutation.mutateAsync({
        name: menuItemName,
        rating: rating,
        notes: notes || undefined,
        itemCategory: "restaurant",
        location_text: selectedRestaurant.name,
        latitude: selectedRestaurant.latitude,
        longitude: selectedRestaurant.longitude,
        photo: currentPhoto.file,
      });

      // Mark as processed
      setProcessedPhotos([...processedPhotos, {
        photoId: currentPhoto.id,
        restaurant: selectedRestaurant,
        menuItemName,
        rating,
        notes,
      }]);

      // Move to next photo or finish
      if (currentPhotoIndex < photos.length - 1) {
        const nextPhotoIndex = currentPhotoIndex + 1;
        setCurrentPhotoIndex(nextPhotoIndex);

        // Reset form and pre-fill restaurant if assigned
        const nextPhoto = photos[nextPhotoIndex];
        const nextRestaurant = photoRestaurants.get(nextPhoto.id);
        setSelectedRestaurant(nextRestaurant || null);
        setMenuItemName("");
        setRating(null);
        setNotes("");
      } else {
        // All photos processed
        localStorage.setItem("hasRatedBefore", "true");
        navigate({ to: "/home" });
      }
    } catch (error: any) {
      console.error("Failed to save photo:", error);

      // Show helpful message if offline
      if (!isOnline && error.message?.includes('queued')) {
        // Still move forward since it's queued
        if (currentPhotoIndex < photos.length - 1) {
          const nextPhotoIndex = currentPhotoIndex + 1;
          setCurrentPhotoIndex(nextPhotoIndex);

          // Reset form and pre-fill restaurant if assigned
          const nextPhoto = photos[nextPhotoIndex];
          const nextRestaurant = photoRestaurants.get(nextPhoto.id);
          setSelectedRestaurant(nextRestaurant || null);
          setMenuItemName("");
          setRating(null);
          setNotes("");
        } else {
          localStorage.setItem("hasRatedBefore", "true");
          navigate({ to: "/home" });
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload Screen
  if (screen === 'upload') {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => navigate({ to: "/add-visit" })}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-semibold">Process Photos</h1>
            <div className="w-9" />
          </div>
        </div>

        {/* Upload Screen */}
        <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
          <Upload className="h-20 w-20 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Upload Photos</h2>
          <p className="text-muted-foreground text-center mb-8 max-w-md">
            Select multiple photos from your camera roll. You'll assign restaurants, then rate each item.
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
      </div>
    );
  }

  // Restaurant Assignment Screen - Sequential one-by-one
  if (screen === 'assign-restaurants') {
    const currentAssigningPhoto = photos[currentAssigningPhotoIndex];
    const assignedRestaurant = photoRestaurants.get(currentAssigningPhoto.id);
    const previousRestaurant = currentAssigningPhotoIndex > 0
      ? photoRestaurants.get(photos[currentAssigningPhotoIndex - 1].id)
      : null;

    const handleNextPhoto = () => {
      if (currentAssigningPhotoIndex < photos.length - 1) {
        setCurrentAssigningPhotoIndex(currentAssigningPhotoIndex + 1);
      } else {
        // All photos have been shown, move to processing
        handleContinueToProcessing();
      }
    };

    const handlePreviousPhoto = () => {
      if (currentAssigningPhotoIndex > 0) {
        setCurrentAssigningPhotoIndex(currentAssigningPhotoIndex - 1);
      }
    };

    return (
      <div className="min-h-screen bg-background pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => {
                if (currentAssigningPhotoIndex === 0) {
                  setBackDialogType('upload');
                  setShowBackDialog(true);
                } else {
                  handlePreviousPhoto();
                }
              }}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-semibold">
              Photo {currentAssigningPhotoIndex + 1} of {photos.length}
            </h1>
            <div className="w-9" />
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentAssigningPhotoIndex + 1) / photos.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Info */}
        <div className="p-4 pb-2">
          <p className="text-sm text-muted-foreground">
            Assign a restaurant to this photo. This will speed up rating later.
          </p>
        </div>

        {/* Photo Preview */}
        <div className="p-4">
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
            <img
              src={currentAssigningPhoto.previewUrl}
              alt="Food photo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Restaurant Selection */}
        <div className="p-4 space-y-4">
          <RestaurantSelector
            selectedRestaurant={assignedRestaurant || null}
            onRestaurantSelected={(restaurant) => handleAssignRestaurant(currentAssigningPhoto.id, restaurant)}
            restaurants={filteredRestaurants}
            searchQuery={restaurantSearchQuery}
            onSearchQueryChange={setRestaurantSearchQuery}
            locationQuery={locationSearchQuery}
            onLocationQueryChange={setLocationSearchQuery}
            isOnline={isOnline}
            onOpenCamera={() => setShowCameraMode(true)}
          />

          {/* Same as Above Button */}
          {currentAssigningPhotoIndex > 0 && previousRestaurant && !assignedRestaurant && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleSameAsAbove(currentAssigningPhotoIndex)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Same as above ({previousRestaurant.name})
            </Button>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-2">
            {currentAssigningPhotoIndex > 0 && (
              <Button
                variant="outline"
                onClick={handlePreviousPhoto}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
            )}

            <Button
              onClick={handleNextPhoto}
              className={`${currentAssigningPhotoIndex > 0 ? 'flex-1' : 'w-full'}`}
            >
              {currentAssigningPhotoIndex < photos.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  Continue to Rating
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>

          <Button
            variant="ghost"
            className="w-full text-xs"
            onClick={handleSkipRestaurantAssignment}
          >
            Skip All - Assign During Rating
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {photoRestaurants.size} of {photos.length} restaurants assigned
          </p>
        </div>
      </div>
    );
  }

  // Processing Screen
  const currentPhoto = photos[currentPhotoIndex];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => {
              if (currentPhotoIndex === 0) {
                // Go back to restaurant assignment
                setBackDialogType('assignment');
                setShowBackDialog(true);
              } else {
                // Ask if they want to cancel entirely
                setBackDialogType('cancel');
                setShowBackDialog(true);
              }
            }}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            disabled={isProcessing}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">
            Photo {currentPhotoIndex + 1} of {photos.length}
          </h1>
          <div className="w-9" />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentPhotoIndex + 1) / photos.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Photo Preview */}
      <div className="p-4">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
          <img
            src={currentPhoto.previewUrl}
            alt="Food photo"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitCurrent();
        }}
        className="p-4 space-y-6"
      >
        {/* Restaurant Selection */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Restaurant *</Label>
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
          />
        </div>

        {/* Menu Item Name */}
        <div className="space-y-2">
          <Label htmlFor="menuItemName" className="text-base font-semibold">
            Menu Item *
          </Label>
          <Input
            id="menuItemName"
            type="text"
            value={menuItemName}
            onChange={(e) => setMenuItemName(e.target.value)}
            placeholder="e.g., Margherita Pizza, Pad Thai"
            maxLength={200}
            required
            disabled={isProcessing}
            className="text-base"
          />
        </div>

        {/* Rating */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Rating *</Label>
              <button
                type="button"
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLegendExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Rating legend */}
            {isLegendExpanded && (
              <div className="space-y-2 text-sm border-l-4 border-primary pl-4 py-2">
                {RATING_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-start gap-2">
                    <span className="font-medium min-w-[20px]">{option.value}★</span>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-muted-foreground">{option.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rating buttons */}
            <div className="flex gap-2">
              {RATING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRating(option.value)}
                  disabled={isProcessing}
                  className={`flex-1 py-3 rounded-lg border-2 font-semibold text-lg transition-all ${
                    rating === option.value
                      ? "bg-primary text-primary-foreground border-primary shadow-lg scale-105"
                      : "bg-background border-border hover:border-primary/50 hover:scale-105"
                  }`}
                >
                  {option.value}★
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

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

        {/* Error Display */}
        {quickTrackMutation.isError && !quickTrackMutation.error?.message?.includes('queued') && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            <p className="font-semibold">Error saving photo</p>
            <p className="text-sm">
              Please try again. Check browser console for details.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full py-6 text-lg font-semibold"
          disabled={!selectedRestaurant || !menuItemName.trim() || rating === null || isProcessing}
        >
          {isProcessing && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {isProcessing
            ? "Saving..."
            : currentPhotoIndex < photos.length - 1
              ? "Save & Next Photo"
              : "Save & Finish"}
          {currentPhotoIndex < photos.length - 1 && !isProcessing && (
            <ChevronRight className="ml-2 h-5 w-5" />
          )}
        </Button>
      </form>

      {/* Dialogs */}
      <AlertDialog open={showBackDialog} onOpenChange={setShowBackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {backDialogType === 'upload' ? 'Go back?' : backDialogType === 'assignment' ? 'Go back to restaurant assignment?' : 'Cancel processing?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {backDialogType === 'upload'
                ? "You'll need to re-upload photos if you go back."
                : backDialogType === 'assignment'
                ? "Your current progress on this photo will be lost."
                : "Unprocessed photos will be lost. Are you sure you want to cancel?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (backDialogType === 'upload') {
                  setPhotos([]);
                  setPhotoRestaurants(new Map());
                  setScreen('upload');
                } else if (backDialogType === 'assignment') {
                  setScreen('assign-restaurants');
                  setSelectedRestaurant(null);
                  setMenuItemName("");
                  setRating(null);
                  setNotes("");
                } else {
                  navigate({ to: "/add-visit" });
                }
                setShowBackDialog(false);
              }}
            >
              {backDialogType === 'upload' ? 'Go Back' : backDialogType === 'assignment' ? 'Go Back' : 'Cancel Processing'}
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
