import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, Friendship } from "@/lib/pocketbase";
import { useRestaurants, Restaurant } from "@/hooks/api/useRestaurants";
import { useVisitsByUser, useFriendVisits } from "@/hooks/api/useVisits";
import { useOfflineCreate } from "@/hooks/offline/useOfflineMutation";
import { visitDraftService } from "@/services/visitDraftService";
import { Button } from "@/components/ui/button";
import { COLLECTIONS } from '@/constants/collections';
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
import {
  X,
  Check,
  MapPin,
  Loader2,
  RefreshCw,
  Users,
  Lock,
  Globe,
} from "lucide-react";
import RestaurantNameFinder from "@/components/visits/shared/RestaurantNameFinder";
import { useSync } from "@/contexts/SyncContext";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { useRestaurantSearch } from "@/hooks/restaurants/useRestaurantSearch";
import { useNearbyRestaurants } from "@/hooks/restaurants/useNearbyRestaurants";
import RestaurantSearchBar from "@/components/visits/add/select-restaurant/RestaurantSearchBar";
import RestaurantList from "@/components/visits/add/select-restaurant/RestaurantList";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface SelectRestaurantPageProps {
  onRestaurantSelected: () => void;
  onNavigateToCreateRestaurant: () => void;
  onCancel: () => void;
}

export default function SelectRestaurantPage({
  onRestaurantSelected,
  onNavigateToCreateRestaurant,
  onCancel,
}: SelectRestaurantPageProps) {
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState("");
  const [newRestaurantLocation, setNewRestaurantLocation] = useState("");
  const [newRestaurantCuisine, setNewRestaurantCuisine] = useState("");
  const [newRestaurantVisibility, setNewRestaurantVisibility] = useState<
    "private" | "friends" | "public"
  >("friends");
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const { error, handleError, clearError, showValidation } = useErrorHandler({
    source: 'SelectRestaurantPage',
    defaultSeverity: 'error',
  });
  const [loading, setLoading] = useState(false);
  const [showRestaurantNameFinder, setShowRestaurantNameFinder] =
    useState(false);

  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false);
  const [highlightedRestaurants, setHighlightedRestaurants] = useState<
    Set<string>
  >(new Set());

  const { isOnline } = useSync();
  const isKeyboardVisible = useKeyboardVisible();
  const user = pb.authStore.record;

  // Use custom hooks
  const restaurantSearch = useRestaurantSearch({ isOnline });
  const nearbyRestaurants = useNearbyRestaurants({ isOnline });

  // Initialize restaurant visibility from user's default preference
  useEffect(() => {
    if (user?.defaultRestaurantVisibility) {
      setNewRestaurantVisibility(user.defaultRestaurantVisibility);
    }
  }, [user?.defaultRestaurantVisibility]);

  // Restore search state on mount
  useEffect(() => {
    const savedSearchState = visitDraftService.getSearchState();
    if (savedSearchState) {
      restaurantSearch.setRestaurantSearchQuery(
        savedSearchState.restaurantSearchQuery
      );
      restaurantSearch.setManualLocation(savedSearchState.manualLocation);
      setShowNearbyPlaces(savedSearchState.showNearbyPlaces);
    }
  }, []);

  // Fetch restaurants
  const { data: restaurants = [] } = useRestaurants();

  // Fetch all visits for the current user
  const { data: userVisits = [] } = useVisitsByUser(user?.id);

  // Fetch friendships to get list of friends
  const { data: friendships = [] } = useQuery<Friendship[]>({
    queryKey: ["friendships", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await pb.collection(COLLECTIONS.FRIENDSHIPS).getFullList({
        filter: `(user = "${user.id}" || friend = "${user.id}") && status = "accepted"`,
      });
    },
    enabled: !!user,
  });

  // Get list of friend IDs from friendships
  const friendIds = friendships.map((f) =>
    f.user === user?.id ? f.friend : f.user
  );

  // Fetch visits from friends
  const { data: friendVisits = [] } = useFriendVisits(user?.id, friendIds);

  // Calculate visit counts per restaurant
  const getRestaurantStats = (restaurantId: string) => {
    const userVisitCount = userVisits.filter(
      (v) => v.restaurant === restaurantId
    ).length;

    // Count unique friends who have visited this restaurant
    const friendsWhoVisited = new Set(
      friendVisits
        .filter((v) => v.restaurant === restaurantId)
        .map((v) => v.user)
    );
    const friendCount = friendsWhoVisited.size;

    return { userVisitCount, friendCount };
  };

  // Add restaurant mutation (with offline support)
  const addRestaurantMutation = useOfflineCreate<
    Restaurant,
    {
      name: string;
      location: string;
      cuisineType?: string;
      visibility: "private" | "friends" | "public";
    }
  >("restaurants", {
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error("User not authenticated");

      return await pb.collection(COLLECTIONS.RESTAURANTS).create<Restaurant>({
        name: data.name,
        location: data.location,
        cuisineType: data.cuisineType || "",
        visibility: data.visibility,
        latitude: nearbyRestaurants.currentLocation?.latitude,
        longitude: nearbyRestaurants.currentLocation?.longitude,
        createdBy: user.id,
      });
    },
    invalidateQueries: ["restaurants"],
    onSuccess: (newRestaurant) => {
      // Save current search state
      visitDraftService.saveSearchState({
        restaurantSearchQuery: restaurantSearch.restaurantSearchQuery,
        manualLocation: restaurantSearch.manualLocation,
        showNearbyPlaces,
        nearbyPlaces: [
          ...restaurantSearch.results,
          ...nearbyRestaurants.nearbyRestaurants,
        ],
      });

      // Save to localStorage
      visitDraftService.saveRestaurant(newRestaurant);
      setShowAddRestaurant(false);
      setNewRestaurantName("");
      setNewRestaurantLocation("");
      setNewRestaurantCuisine("");
      onRestaurantSelected();
    },
    onError: (err: unknown) => {
      handleError(err, { customMessage: ERROR_MESSAGES.RESTAURANT.CREATE_FAILED });
    },
  });

  // Combine nearby places with all restaurants when search is active
  const allRestaurantsToShow = showNearbyPlaces
    ? [
        ...restaurants,
        ...restaurantSearch.results.filter(
          (np) => !restaurants.some((r) => r.id === np.id)
        ),
        ...nearbyRestaurants.nearbyRestaurants.filter(
          (np) => !restaurants.some((r) => r.id === np.id)
        ),
      ]
    : restaurants;

  const filteredRestaurants = allRestaurantsToShow.filter(
    (r) =>
      r.name
        .toLowerCase()
        .includes(restaurantSearch.restaurantSearchQuery.toLowerCase()) ||
      r.location
        .toLowerCase()
        .includes(restaurantSearch.restaurantSearchQuery.toLowerCase()) ||
      (r.cuisineType?.toLowerCase() || "").includes(
        restaurantSearch.restaurantSearchQuery.toLowerCase()
      )
  );

  // Filter restaurants for name suggestions in the add form
  const nameSuggestions = newRestaurantName.trim()
    ? restaurants
        .filter((r) =>
          r.name.toLowerCase().includes(newRestaurantName.toLowerCase())
        )
        .slice(0, 5)
    : [];

  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!newRestaurantName.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD("Restaurant name"));
      return;
    }

    if (!newRestaurantLocation.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD("Location"));
      return;
    }

    setLoading(true);

    try {
      await addRestaurantMutation.mutateAsync({
        name: newRestaurantName,
        location: newRestaurantLocation,
        cuisineType: newRestaurantCuisine,
        visibility: newRestaurantVisibility,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRestaurant = (restaurant: Restaurant) => {
    // Save current search state
    visitDraftService.saveSearchState({
      restaurantSearchQuery: restaurantSearch.restaurantSearchQuery,
      manualLocation: restaurantSearch.manualLocation,
      showNearbyPlaces,
      nearbyPlaces: [
        ...restaurantSearch.results,
        ...nearbyRestaurants.nearbyRestaurants,
      ],
    });

    // Check if we're switching to a different restaurant
    const currentDraft = visitDraftService.getDraft();
    if (
      currentDraft.restaurant &&
      currentDraft.restaurant.id !== restaurant.id
    ) {
      // Clear items when switching restaurants to prevent item mismatch
      visitDraftService.saveItems([]);
    }

    visitDraftService.saveRestaurant(restaurant);
    onRestaurantSelected();
  };


  // Highlight matching restaurants when search query changes
  useEffect(() => {
    if (
      restaurantSearch.restaurantSearchQuery.trim() &&
      filteredRestaurants.length > 0 &&
      filteredRestaurants.length < restaurants.length
    ) {
      const matchingIds = new Set(filteredRestaurants.map((r) => r.id));
      setHighlightedRestaurants(matchingIds);

      const timer = setTimeout(() => {
        setHighlightedRestaurants(new Set());
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      setHighlightedRestaurants(new Set());
    }
  }, [
    restaurantSearch.restaurantSearchQuery,
    filteredRestaurants.length,
    restaurants.length,
  ]);

  const handleSearchNearby = async () => {
    setShowNearbyPlaces(true);
    clearError();
    await nearbyRestaurants.requestLocation();
  };

  const handleManualSearch = async () => {
    setShowNearbyPlaces(true);
    await restaurantSearch.search();
  };

  const handleClearSearch = () => {
    setShowNearbyPlaces(false);
    restaurantSearch.clearSearch();
    nearbyRestaurants.clearResults();
  };

  // Determine which results and reference coords to use
  const displayResults = showNearbyPlaces
    ? [
        ...nearbyRestaurants.nearbyRestaurants,
        ...restaurantSearch.results.filter(
          (r) => !nearbyRestaurants.nearbyRestaurants.some((nr) => nr.id === r.id)
        ),
      ]
    : [];

  const displayReferenceCoords =
    nearbyRestaurants.referenceCoords || restaurantSearch.referenceCoords;

  const isLoadingSearch =
    restaurantSearch.isSearching || nearbyRestaurants.isLoading;
  const searchError = restaurantSearch.error || nearbyRestaurants.error;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Floating Success Notification */}
      {(restaurantSearch.showSuccessNotification ||
        nearbyRestaurants.showSuccessNotification) && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top duration-300">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <Check className="w-5 h-5" />
            <div>
              <p className="font-medium">
                Found {displayResults.length} place
                {displayResults.length !== 1 ? "s" : ""}!
              </p>
              <p className="text-xs text-green-100">
                {nearbyRestaurants.currentLocation
                  ? "Sorted by distance from your location"
                  : restaurantSearch.currentLocationContext?.location
                    ? `Near ${restaurantSearch.currentLocationContext.location}`
                    : "Results loaded successfully"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Select Restaurant</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose a restaurant for your visit
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <ErrorDisplay error={error} onClear={clearError} />

        <div className="space-y-4">
          {/* Search options */}
          {!showNearbyPlaces && (
            <RestaurantSearchBar
              mode="initial"
              restaurantSearchQuery={restaurantSearch.restaurantSearchQuery}
              setRestaurantSearchQuery={
                restaurantSearch.setRestaurantSearchQuery
              }
              manualLocation={restaurantSearch.manualLocation}
              setManualLocation={restaurantSearch.setManualLocation}
              isOnline={isOnline}
              onSearch={handleManualSearch}
              onUseGPS={handleSearchNearby}
              onNavigateToCreateRestaurant={onNavigateToCreateRestaurant}
              onShowCamera={() => setShowRestaurantNameFinder(true)}
            />
          )}

          {/* Nearby places view */}
          {showNearbyPlaces && (
            <>
              <RestaurantSearchBar
                mode="refine"
                restaurantSearchQuery={restaurantSearch.restaurantSearchQuery}
                setRestaurantSearchQuery={
                  restaurantSearch.setRestaurantSearchQuery
                }
                manualLocation={restaurantSearch.manualLocation}
                setManualLocation={restaurantSearch.setManualLocation}
                isOnline={isOnline}
                onSearch={handleManualSearch}
                onUseGPS={handleSearchNearby}
                onShowCamera={() => setShowRestaurantNameFinder(true)}
              />

              {/* Location status */}
              {nearbyRestaurants.locationLoading && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        Getting your location...
                      </p>
                      <p className="text-xs text-blue-700">
                        This helps find nearby restaurants
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {nearbyRestaurants.locationError && (
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-900">
                          Location unavailable
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          {nearbyRestaurants.locationError}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={nearbyRestaurants.requestLocation}
                          className="mt-2"
                        >
                          <RefreshCw className="w-3 h-3 mr-2" />
                          Try Again
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {isLoadingSearch && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">
                    Finding nearby food places...
                  </span>
                </div>
              )}

              {searchError && (
                <Card className="bg-red-50 border-red-200">
                  <CardContent>
                    <p className="text-sm text-red-600">{searchError}</p>
                  </CardContent>
                </Card>
              )}

              {!isLoadingSearch && displayResults.length === 0 && !searchError && (
                <Card className="bg-gray-50">
                  <CardContent className="pt-4 text-center">
                    <p className="text-sm text-gray-600">
                      No nearby food places found
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNearbyPlaces(false)}
                      className="mt-3"
                    >
                      Add Manually
                    </Button>
                  </CardContent>
                </Card>
              )}

              {displayResults.length > 0 && (
                <RestaurantList
                  restaurants={displayResults}
                  referenceCoords={displayReferenceCoords}
                  getRestaurantStats={getRestaurantStats}
                  onSelectRestaurant={handleSelectRestaurant}
                  showPagination={true}
                  resultsPerPage={20}
                />
              )}

              {(displayResults.length > 0 ||
                searchError ||
                nearbyRestaurants.locationError) && (
                <Button
                  onClick={handleClearSearch}
                  variant="outline"
                  className="w-full"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear Search Results
                </Button>
              )}
            </>
          )}

          {/* Saved restaurants list */}
          {!showNearbyPlaces && (
            <>
              {showAddRestaurant ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Add New Restaurant</CardTitle>
                    {nearbyRestaurants.currentLocation && (
                      <CardDescription className="flex items-center gap-1 text-xs text-green-600">
                        <MapPin className="w-3 h-3" />
                        Current location will be saved
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddRestaurant} className="space-y-4">
                      <div className="space-y-2 relative">
                        <Label htmlFor="name">Restaurant Name</Label>
                        <Input
                          id="name"
                          value={newRestaurantName}
                          onChange={(e) => {
                            setNewRestaurantName(e.target.value);
                            setShowNameSuggestions(true);
                          }}
                          onFocus={() => setShowNameSuggestions(true)}
                          onBlur={() => {
                            setTimeout(
                              () => setShowNameSuggestions(false),
                              200
                            );
                          }}
                          placeholder="Enter restaurant name"
                          autoComplete="off"
                        />

                        {/* Name Suggestions Dropdown */}
                        {showNameSuggestions && nameSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {nameSuggestions.map((restaurant) => (
                              <button
                                key={restaurant.id}
                                type="button"
                                onClick={() => {
                                  setNewRestaurantName(restaurant.name);
                                  setNewRestaurantLocation(
                                    restaurant.location || ""
                                  );
                                  setNewRestaurantCuisine(
                                    restaurant.cuisineType || ""
                                  );
                                  setShowNameSuggestions(false);
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                              >
                                <div className="font-medium text-gray-900">
                                  {restaurant.name}
                                </div>
                                <div className="text-sm text-gray-600 mt-0.5">
                                  {restaurant.location}
                                  {restaurant.cuisineType &&
                                    ` • ${restaurant.cuisineType}`}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="location">Location *</Label>
                        <Input
                          id="location"
                          value={newRestaurantLocation}
                          onChange={(e) =>
                            setNewRestaurantLocation(e.target.value)
                          }
                          placeholder="Enter location"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cuisine">Cuisine Type</Label>
                        <Input
                          id="cuisine"
                          value={newRestaurantCuisine}
                          onChange={(e) =>
                            setNewRestaurantCuisine(e.target.value)
                          }
                          placeholder="e.g., Italian, Japanese"
                        />
                      </div>

                      {/* Visibility Selector */}
                      <div className="space-y-3">
                        <Label>Visibility</Label>
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() =>
                              setNewRestaurantVisibility("private")
                            }
                            className={`w-full p-3 rounded-lg border-2 transition-all ${
                              newRestaurantVisibility === "private"
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  newRestaurantVisibility === "private"
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-gray-300"
                                }`}
                              >
                                {newRestaurantVisibility === "private" && (
                                  <div className="w-2.5 h-2.5 bg-white rounded-full" />
                                )}
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <Lock className="w-4 h-4 text-gray-600" />
                                  <span className="font-semibold text-sm">
                                    Private
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600">
                                  Only visible to you
                                </p>
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setNewRestaurantVisibility("friends")
                            }
                            className={`w-full p-3 rounded-lg border-2 transition-all ${
                              newRestaurantVisibility === "friends"
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  newRestaurantVisibility === "friends"
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-gray-300"
                                }`}
                              >
                                {newRestaurantVisibility === "friends" && (
                                  <div className="w-2.5 h-2.5 bg-white rounded-full" />
                                )}
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <Users className="w-4 h-4 text-blue-600" />
                                  <span className="font-semibold text-sm">
                                    Friends
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600">
                                  Visible to your friends
                                </p>
                              </div>
                            </div>
                          </button>

                          {user?.isAdmin && (
                            <button
                              type="button"
                              onClick={() =>
                                setNewRestaurantVisibility("public")
                              }
                              className={`w-full p-3 rounded-lg border-2 transition-all ${
                                newRestaurantVisibility === "public"
                                  ? "border-blue-500 bg-blue-50"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                    newRestaurantVisibility === "public"
                                      ? "border-blue-500 bg-blue-500"
                                      : "border-gray-300"
                                  }`}
                                >
                                  {newRestaurantVisibility === "public" && (
                                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                                  )}
                                </div>
                                <div className="flex-1 text-left">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Globe className="w-4 h-4 text-green-600" />
                                    <span className="font-semibold text-sm">
                                      Public
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      Admin Only
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-gray-600">
                                    Visible to everyone in the community
                                  </p>
                                </div>
                              </div>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={loading}
                          className="flex-1"
                        >
                          Add & Continue
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowAddRestaurant(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <RestaurantList
                  restaurants={filteredRestaurants}
                  highlightedRestaurants={highlightedRestaurants}
                  getRestaurantStats={getRestaurantStats}
                  onSelectRestaurant={handleSelectRestaurant}
                  showPagination={true}
                  resultsPerPage={20}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom buttons */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <Button variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      {/* Full-screen Restaurant Name Finder Modal */}
      {showRestaurantNameFinder && (
        <div className="fixed inset-0 z-50 bg-white">
          <RestaurantNameFinder
            onSelectName={(name) => {
              restaurantSearch.setRestaurantSearchQuery(name);
              setShowRestaurantNameFinder(false);
            }}
            onClose={() => setShowRestaurantNameFinder(false)}
          />
        </div>
      )}
    </div>
  );
}
