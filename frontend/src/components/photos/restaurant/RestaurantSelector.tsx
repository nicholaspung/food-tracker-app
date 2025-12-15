import { logger } from '@/lib/logger';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Loader2,
  WifiOff,
  Store,
  X,
  Camera,
  History,
  Check,
  Copy,
} from "lucide-react";
import { searchAndCacheRestaurantsByText } from "@/services/googlePlaces";
import { RestaurantSelectorProps, StoredCameraResult } from "@/types/photos";
import { Restaurant } from "@/lib/pocketbase";

/**
 * Enhanced Restaurant Selector Component with Google Places and History
 *
 * Features:
 * - Search saved restaurants
 * - Search Google Places API
 * - Camera-based restaurant name detection
 * - History of camera scans
 * - Add new restaurant manually
 * - "Same as previous" quick selection
 */
export function RestaurantSelector({
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
  onShowValidation,
  onHandleError,
}: RestaurantSelectorProps & {
  onShowValidation?: (message: string) => void;
  onHandleError?: (error: Error, options?: { customMessage?: string }) => void;
}) {
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
      logger.error("Failed to load camera history:", err);
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
      onShowValidation?.("Restaurant name is required");
      return;
    }

    if (!newRestaurantLocation.trim()) {
      onShowValidation?.("Location is required");
      return;
    }

    setIsCreatingRestaurant(true);
    try {
      const result = await restaurantCreationMutation.mutateAsync({
        name: newRestaurantName.trim(),
        address: newRestaurantLocation.trim(),
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
      logger.error("Failed to create restaurant:", error);
      onHandleError?.(error as Error, {
        customMessage: "Failed to create restaurant. Please try again.",
      });
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
                  <Label htmlFor="new-restaurant-location">Location *</Label>
                  <Input
                    id="new-restaurant-location"
                    value={newRestaurantLocation}
                    onChange={(e) => setNewRestaurantLocation(e.target.value)}
                    placeholder="e.g., 123 Main St, New York, NY"
                    disabled={isCreatingRestaurant}
                    required
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
                const isHighlighted = highlightedRestaurants.has(restaurant.id);
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
