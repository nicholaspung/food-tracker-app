import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, Restaurant, Visit, Friendship } from "@/lib/pocketbase";
import { useOfflineCreate } from "@/hooks/useOfflineMutation";
import { visitDraftService } from "@/services/visitDraftService";
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
import {
  Plus,
  X,
  Search,
  Calendar,
  Check,
  MapPin,
  Loader2,
  RefreshCw,
  Users,
  Lock,
  Globe,
  Camera,
  WifiOff,
} from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  searchAndCacheNearbyRestaurants,
  searchAndCacheRestaurantsByText,
  calculateDistance,
  formatDistance,
  geocodeLocation,
} from "@/services/googlePlaces";
import RestaurantNameFinder from "@/components/RestaurantNameFinder";
import { useSync } from "@/contexts/SyncContext";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";

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
  const savedRestaurantsRef = useRef<HTMLDivElement>(null);
  const nearbyPlacesRef = useRef<HTMLDivElement>(null);

  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState("");
  const [newRestaurantLocation, setNewRestaurantLocation] = useState("");
  const [newRestaurantCuisine, setNewRestaurantCuisine] = useState("");
  const [newRestaurantVisibility, setNewRestaurantVisibility] = useState<
    "private" | "friends" | "public"
  >("friends");
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRestaurantNameFinder, setShowRestaurantNameFinder] =
    useState(false);

  // Google Places integration
  const [nearbyPlaces, setNearbyPlaces] = useState<Restaurant[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [savedRestaurantsPage, setSavedRestaurantsPage] = useState(1);
  const RESULTS_PER_PAGE = 20;

  // Manual location and text search
  const [manualLocation, setManualLocation] = useState("");
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [highlightedRestaurants, setHighlightedRestaurants] = useState<
    Set<string>
  >(new Set());

  // Success notification
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);

  const [currentLocationContext, setCurrentLocationContext] = useState<{
    type: "gps" | "manual";
    location?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  // Reference coordinates for distance calculation
  const [referenceCoords, setReferenceCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Location - only fetch when user requests nearby search
  const {
    position,
    error: locationError,
    loading: locationLoading,
    refetch: refetchLocation,
  } = useGeolocation(false);

  const queryClient = useQueryClient();
  const { isOnline } = useSync();
  const isKeyboardVisible = useKeyboardVisible();
  const user = pb.authStore.record;

  // Refs for auto-scrolling inputs into view on mobile
  const restaurantSearchInputRef = useScrollIntoView<HTMLInputElement>();
  const manualLocationInputRef = useScrollIntoView<HTMLInputElement>();

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
      setRestaurantSearchQuery(savedSearchState.restaurantSearchQuery);
      setManualLocation(savedSearchState.manualLocation);
      setShowNearbyPlaces(savedSearchState.showNearbyPlaces);
      setNearbyPlaces(savedSearchState.nearbyPlaces);
    }
  }, []);

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ["restaurants"],
    queryFn: async () => {
      return await pb.collection("restaurants").getFullList({
        sort: "-created",
      });
    },
  });

  // Fetch all visits for the current user
  const { data: userVisits = [] } = useQuery<Visit[]>({
    queryKey: ["userVisits", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await pb.collection("visits").getFullList({
        filter: `user = "${user.id}"`,
      });
    },
    enabled: !!user,
  });

  // Fetch friendships to get list of friends
  const { data: friendships = [] } = useQuery<Friendship[]>({
    queryKey: ["friendships", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await pb.collection("friendships").getFullList({
        filter: `(user = "${user.id}" || friend = "${user.id}") && status = "accepted"`,
      });
    },
    enabled: !!user,
  });

  // Fetch visits from friends
  const { data: friendVisits = [] } = useQuery<Visit[]>({
    queryKey: ["friendVisits", user?.id, friendships.length],
    queryFn: async () => {
      if (!user || friendships.length === 0) return [];

      // Get list of friend IDs
      const friendIds = friendships.map((f) =>
        f.user === user.id ? f.friend : f.user
      );

      if (friendIds.length === 0) return [];

      // Fetch visits from all friends with visibility friends
      const filterConditions = friendIds
        .map((id) => `user = "${id}"`)
        .join(" || ");
      return await pb.collection("visits").getFullList({
        filter: `(${filterConditions}) && visibility = "friends"`,
      });
    },
    enabled: !!user && friendships.length > 0,
  });

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
  const addRestaurantMutation = useOfflineCreate<Restaurant, {
    name: string;
    location: string;
    cuisineType?: string;
    visibility: "private" | "friends" | "public";
  }>("restaurants", {
    mutationFn: async (data) => {
      const user = pb.authStore.record;
      if (!user) throw new Error("User not authenticated");

      return await pb.collection("restaurants").create<Restaurant>({
        name: data.name,
        location: data.location,
        cuisineType: data.cuisineType || "",
        visibility: data.visibility,
        latitude: position?.latitude,
        longitude: position?.longitude,
        createdBy: user.id,
      });
    },
    invalidateQueries: ["restaurants"],
    onSuccess: (newRestaurant) => {
      // Save current search state
      visitDraftService.saveSearchState({
        restaurantSearchQuery,
        manualLocation,
        showNearbyPlaces,
        nearbyPlaces,
      });

      // Save to localStorage
      visitDraftService.saveRestaurant(newRestaurant);
      setShowAddRestaurant(false);
      setNewRestaurantName("");
      setNewRestaurantLocation("");
      setNewRestaurantCuisine("");
      onRestaurantSelected();
    },
    onError: (err: any) => {
      setError(err.message || "Failed to add restaurant");
    },
  });

  // Combine nearby places with all restaurants when Google Places search is active
  const allRestaurantsToShow = showNearbyPlaces
    ? [
        ...restaurants,
        ...nearbyPlaces.filter(
          (np) => !restaurants.some((r) => r.id === np.id)
        ),
      ]
    : restaurants;

  const filteredRestaurants = allRestaurantsToShow.filter(
    (r) =>
      r.name.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      (r.cuisineType?.toLowerCase() || "").includes(
        restaurantSearchQuery.toLowerCase()
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

  // Pagination logic for saved restaurants
  const totalSavedPages = Math.ceil(
    filteredRestaurants.length / RESULTS_PER_PAGE
  );
  const savedStartIndex = (savedRestaurantsPage - 1) * RESULTS_PER_PAGE;
  const savedEndIndex = savedStartIndex + RESULTS_PER_PAGE;
  const paginatedSavedRestaurants = filteredRestaurants.slice(
    savedStartIndex,
    savedEndIndex
  );

  // Pagination logic for nearby places
  const totalPages = Math.ceil(nearbyPlaces.length / RESULTS_PER_PAGE);
  const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIndex = startIndex + RESULTS_PER_PAGE;
  const paginatedPlaces = nearbyPlaces.slice(startIndex, endIndex);

  // Calculate which pages to show in pagination
  const getPageNumbers = (currentPageNum: number, totalPagesNum: number) => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPagesNum <= maxPagesToShow) {
      for (let i = 1; i <= totalPagesNum; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPageNum > 3) {
        pages.push("...");
      }

      const start = Math.max(2, currentPageNum - 1);
      const end = Math.min(totalPagesNum - 1, currentPageNum + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPageNum < totalPagesNum - 2) {
        pages.push("...");
      }

      pages.push(totalPagesNum);
    }

    return pages;
  };

  // Calculate distances for current page of nearby places and sort by distance
  const nearbyPlacesWithDistance = paginatedPlaces
    .map((restaurant) => {
      let distance: number | null = null;
      if (
        referenceCoords &&
        restaurant.latitude != null &&
        restaurant.longitude != null
      ) {
        distance = calculateDistance(
          referenceCoords.lat,
          referenceCoords.lng,
          restaurant.latitude,
          restaurant.longitude
        );
      }
      return { restaurant, distance };
    })
    .sort((a, b) => {
      if (a.distance === null && b.distance === null) return 0;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

  // Handler to search nearby places
  const handleSearchNearby = async () => {
    // Check if online first
    if (!isOnline) {
      setPlacesError("Cannot search nearby restaurants while offline. Google Places requires internet connection.");
      return;
    }

    setShowNearbyPlaces(true);
    setPlacesError("");
    setError("");
    setShowSuccessNotification(false);
    setCurrentPage(1);

    if (!position && !locationLoading) {
      refetchLocation();
    }

    if (position) {
      setReferenceCoords({
        lat: position.latitude,
        lng: position.longitude,
      });

      setCurrentLocationContext({
        type: "gps",
        latitude: position.latitude,
        longitude: position.longitude,
      });

      setPlacesLoading(true);
      try {
        const restaurants = await searchAndCacheNearbyRestaurants({
          latitude: position.latitude,
          longitude: position.longitude,
          radius: 5000,
        });

        setNearbyPlaces(restaurants);
        setShowSuccessNotification(true);

        queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      } catch (err) {
        setPlacesError(
          err instanceof Error
            ? err.message
            : "Failed to load nearby food places"
        );
      } finally {
        setPlacesLoading(false);
      }
    }
  };

  // Watch for location changes when user is viewing nearby places
  useEffect(() => {
    if (
      position &&
      showNearbyPlaces &&
      nearbyPlaces.length === 0 &&
      !placesLoading &&
      isOnline // Only fetch if online
    ) {
      const fetchNearbyPlaces = async () => {
        setReferenceCoords({
          lat: position.latitude,
          lng: position.longitude,
        });

        setCurrentLocationContext({
          type: "gps",
          latitude: position.latitude,
          longitude: position.longitude,
        });
        setPlacesLoading(true);
        setPlacesError("");
        try {
          const restaurants = await searchAndCacheNearbyRestaurants({
            latitude: position.latitude,
            longitude: position.longitude,
            radius: 5000,
          });

          setNearbyPlaces(restaurants);
          setCurrentPage(1);
          setShowSuccessNotification(true);
          queryClient.invalidateQueries({ queryKey: ["restaurants"] });
        } catch (err) {
          setPlacesError(
            err instanceof Error
              ? err.message
              : "Failed to load nearby food places"
          );
        } finally {
          setPlacesLoading(false);
        }
      };

      fetchNearbyPlaces();
    }
  }, [position, showNearbyPlaces]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (showSuccessNotification) {
      const timer = setTimeout(() => {
        setShowSuccessNotification(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [showSuccessNotification]);

  // Handle manual location and text search
  const handleManualSearch = async () => {
    // Check if online first
    if (!isOnline) {
      setPlacesError("Cannot search restaurants while offline. Google Places requires internet connection.");
      return;
    }

    if (!manualLocation.trim() && !restaurantSearchQuery.trim()) {
      setPlacesError("Please enter a location or food place name to search");
      return;
    }

    setPlacesLoading(true);
    setPlacesError("");
    setShowNearbyPlaces(true);
    setShowSuccessNotification(false);
    setCurrentPage(1);

    try {
      let coords: { lat: number; lng: number } | null = null;
      if (manualLocation.trim()) {
        coords = await geocodeLocation(manualLocation.trim());
        if (coords) {
          setReferenceCoords(coords);
        }
      }

      setCurrentLocationContext({
        type: "manual",
        location: manualLocation.trim(),
        latitude: coords?.lat,
        longitude: coords?.lng,
      });

      const restaurants = await searchAndCacheRestaurantsByText({
        query: restaurantSearchQuery.trim() || "food",
        location: manualLocation.trim() || undefined,
        radius: 5000,
      });

      setNearbyPlaces(restaurants);
      setShowSuccessNotification(true);

      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (err) {
      setPlacesError(
        err instanceof Error ? err.message : "Failed to search food places"
      );
    } finally {
      setPlacesLoading(false);
    }
  };

  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
      restaurantSearchQuery,
      manualLocation,
      showNearbyPlaces,
      nearbyPlaces,
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

  // Get visibility icon for restaurant
  const getVisibilityIcon = (visibility?: "private" | "friends" | "public") => {
    switch (visibility) {
      case "private":
        return <Lock className="w-3 h-3 text-gray-600" />;
      case "friends":
        return <Users className="w-3 h-3 text-blue-600" />;
      case "public":
        return <Globe className="w-3 h-3 text-green-600" />;
      default:
        return <Globe className="w-3 h-3 text-green-600" />; // Default to public for existing data
    }
  };

  // Reset saved restaurants pagination when search query changes
  useEffect(() => {
    setSavedRestaurantsPage(1);
  }, [restaurantSearchQuery]);

  // Scroll to top of saved restaurants list when page changes
  useEffect(() => {
    if (savedRestaurantsRef.current && savedRestaurantsPage > 1) {
      savedRestaurantsRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [savedRestaurantsPage]);

  // Scroll to top of nearby places list when page changes
  useEffect(() => {
    if (nearbyPlacesRef.current && currentPage > 1) {
      nearbyPlacesRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [currentPage]);

  // Highlight matching restaurants when search query changes
  useEffect(() => {
    if (
      restaurantSearchQuery.trim() &&
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
  }, [restaurantSearchQuery, filteredRestaurants.length, restaurants.length]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Floating Success Notification */}
      {showSuccessNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top duration-300">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <Check className="w-5 h-5" />
            <div>
              <p className="font-medium">
                Found {nearbyPlaces.length} place
                {nearbyPlaces.length !== 1 ? "s" : ""}!
              </p>
              <p className="text-xs text-green-100">
                {currentLocationContext?.type === "gps"
                  ? "Sorted by distance from your location"
                  : currentLocationContext?.location
                    ? `Near ${currentLocationContext.location}`
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
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Saved restaurants view (default) */}
          {!showNearbyPlaces && (
            <>
              {/* Search options */}
              <Card className="border-2 border-blue-200 bg-blue-50/30 gap-0">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="w-5 h-5 text-blue-600" />
                    Search for Food Places
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Restaurant name/type search */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="restaurant-search"
                        className="text-sm font-medium text-gray-700"
                      >
                        Place name or type
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowRestaurantNameFinder(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Use camera
                      </button>
                    </div>
                    <Input
                      ref={restaurantSearchInputRef}
                      id="restaurant-search"
                      type="text"
                      placeholder="e.g., Starbucks, cafe, bakery, dessert"
                      value={restaurantSearchQuery}
                      onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                      className="bg-white"
                    />
                  </div>

                  {/* Manual location search */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="manual-location"
                      className="text-sm font-medium text-gray-700"
                    >
                      Location (city, zip code, or address)
                    </Label>
                    <Input
                      ref={manualLocationInputRef}
                      id="manual-location"
                      type="text"
                      placeholder="e.g., 90210, Los Angeles, CA"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                      className="bg-white"
                    />
                  </div>

                  <Button
                    onClick={handleManualSearch}
                    variant="default"
                    className="w-full"
                    disabled={!isOnline}
                  >
                    {isOnline ? (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Search Food Places
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 mr-2" />
                        Search (Offline)
                      </>
                    )}
                  </Button>

                  {!isOnline && (
                    <p className="text-xs text-orange-600 text-center">
                      Google Places search requires internet connection
                    </p>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-blue-50/30 px-2 text-gray-500">
                        or
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={handleSearchNearby}
                    variant="outline"
                    className="w-full bg-white"
                    disabled={!isOnline}
                  >
                    {isOnline ? (
                      <>
                        <MapPin className="w-4 h-4 mr-2" />
                        Use My Current Location
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 mr-2" />
                        Location Search (Offline)
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* Nearby places view */}
          {showNearbyPlaces && (
            <>
              {/* Search inputs */}
              <Card className="border-2 border-blue-200 bg-blue-50/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="w-5 h-5 text-blue-600" />
                    Search Again
                  </CardTitle>
                  <CardDescription>
                    Refine your search or try a new location
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="restaurant-search-nearby"
                        className="text-sm font-medium text-gray-700"
                      >
                        Place name or type
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowRestaurantNameFinder(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Use camera
                      </button>
                    </div>
                    <Input
                      id="restaurant-search-nearby"
                      type="text"
                      placeholder="e.g., Starbucks, cafe, bakery, dessert"
                      value={restaurantSearchQuery}
                      onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                      className="bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="manual-location-nearby"
                      className="text-sm font-medium text-gray-700"
                    >
                      Location (city, zip code, or address)
                    </Label>
                    <Input
                      id="manual-location-nearby"
                      type="text"
                      placeholder="e.g., 90210, Los Angeles, CA"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                      className="bg-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleManualSearch()}
                      variant="default"
                      className="flex-1"
                      disabled={!isOnline}
                    >
                      {isOnline ? (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          New Search
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-4 h-4 mr-2" />
                          Offline
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleSearchNearby()}
                      variant="outline"
                      className="flex-1 bg-white"
                      disabled={!isOnline}
                    >
                      {isOnline ? (
                        <>
                          <MapPin className="w-4 h-4 mr-2" />
                          Use GPS
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-4 h-4 mr-2" />
                          Offline
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Location status */}
              {locationLoading && (
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

              {locationError && (
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-900">
                          Location unavailable
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          {locationError}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={refetchLocation}
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
            </>
          )}

          {/* Google Places nearby restaurants */}
          {showNearbyPlaces && (
            <>
              {placesLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">
                    Finding nearby food places...
                  </span>
                </div>
              )}

              {placesError && (
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4">
                    <p className="text-sm text-red-600">{placesError}</p>
                  </CardContent>
                </Card>
              )}

              {!placesLoading &&
                nearbyPlaces.length === 0 &&
                !placesError &&
                position && (
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

              <div ref={nearbyPlacesRef} className="space-y-3">
                {nearbyPlacesWithDistance.map(({ restaurant, distance }) => {
                  const stats = getRestaurantStats(restaurant.id);
                  return (
                    <Card
                      key={restaurant.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleSelectRestaurant(restaurant)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">
                                {restaurant.name}
                              </CardTitle>
                              {getVisibilityIcon(restaurant.visibility)}
                            </div>
                            <CardDescription className="mt-1">
                              {restaurant.location}
                              {restaurant.cuisineType &&
                                ` • ${restaurant.cuisineType}`}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary" className="ml-2">
                            <MapPin className="w-3 h-3 mr-1" />
                            {distance !== null
                              ? formatDistance(distance)
                              : "Near"}
                          </Badge>
                        </div>
                        {(stats.userVisitCount > 0 ||
                          stats.friendCount > 0) && (
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                            {stats.userVisitCount > 0 && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  You: {stats.userVisitCount}{" "}
                                  {stats.userVisitCount === 1
                                    ? "visit"
                                    : "visits"}
                                </span>
                              </div>
                            )}
                            {stats.friendCount > 0 && (
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                <span>
                                  {stats.friendCount}{" "}
                                  {stats.friendCount === 1
                                    ? "friend"
                                    : "friends"}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {nearbyPlaces.length > 0 && totalPages > 1 && !placesLoading && (
                <div className="flex items-center justify-center gap-1 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2"
                  >
                    &lt;&lt;
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2"
                  >
                    &lt;
                  </Button>

                  {getPageNumbers(currentPage, totalPages).map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-gray-400"
                      >
                        ...
                      </span>
                    ) : (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page as number)}
                        className="min-w-[2.5rem]"
                      >
                        {page}
                      </Button>
                    )
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-2"
                  >
                    &gt;
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2"
                  >
                    &gt;&gt;
                  </Button>
                </div>
              )}

              {/* Page info */}
              {nearbyPlaces.length > 0 && !placesLoading && (
                <div className="text-center text-sm text-gray-600">
                  Showing {startIndex + 1}-
                  {Math.min(endIndex, nearbyPlaces.length)} of{" "}
                  {nearbyPlaces.length} places
                  {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
                </div>
              )}

              {(nearbyPlaces.length > 0 || placesError || locationError) && (
                <Button
                  onClick={() => {
                    setShowNearbyPlaces(false);
                    setNearbyPlaces([]);
                    setPlacesError("");
                    setCurrentLocationContext(null);
                    setReferenceCoords(null);
                    setCurrentPage(1);
                    setShowSuccessNotification(false);
                  }}
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
                    {position && (
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
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          value={newRestaurantLocation}
                          onChange={(e) =>
                            setNewRestaurantLocation(e.target.value)
                          }
                          placeholder="Enter location"
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
                <>
                  <Button
                    onClick={onNavigateToCreateRestaurant}
                    variant="outline"
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Restaurant
                  </Button>

                  <div ref={savedRestaurantsRef} className="space-y-3">
                    {paginatedSavedRestaurants.map((restaurant) => {
                      const stats = getRestaurantStats(restaurant.id);
                      const isHighlighted = highlightedRestaurants.has(
                        restaurant.id
                      );
                      return (
                        <Card
                          key={restaurant.id}
                          className={`cursor-pointer hover:shadow-md transition-all ${
                            isHighlighted
                              ? "border-2 border-yellow-400 bg-yellow-50 animate-pulse shadow-lg"
                              : ""
                          }`}
                          onClick={() => handleSelectRestaurant(restaurant)}
                        >
                          <CardHeader>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">
                                {restaurant.name}
                              </CardTitle>
                              {getVisibilityIcon(restaurant.visibility)}
                            </div>
                            <CardDescription>
                              {restaurant.location}
                              {restaurant.cuisineType &&
                                ` • ${restaurant.cuisineType}`}
                            </CardDescription>
                            {(stats.userVisitCount > 0 ||
                              stats.friendCount > 0) && (
                              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                                {stats.userVisitCount > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>
                                      You: {stats.userVisitCount}{" "}
                                      {stats.userVisitCount === 1
                                        ? "visit"
                                        : "visits"}
                                    </span>
                                  </div>
                                )}
                                {stats.friendCount > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    <span>
                                      {stats.friendCount}{" "}
                                      {stats.friendCount === 1
                                        ? "friend"
                                        : "friends"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Pagination Controls for Saved Restaurants */}
                  {filteredRestaurants.length > 0 && totalSavedPages > 1 && (
                    <>
                      <div className="flex items-center justify-center gap-1 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSavedRestaurantsPage(1)}
                          disabled={savedRestaurantsPage === 1}
                          className="px-2"
                        >
                          &lt;&lt;
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSavedRestaurantsPage((p) => Math.max(1, p - 1))
                          }
                          disabled={savedRestaurantsPage === 1}
                          className="px-2"
                        >
                          &lt;
                        </Button>

                        {getPageNumbers(
                          savedRestaurantsPage,
                          totalSavedPages
                        ).map((page, idx) =>
                          page === "..." ? (
                            <span
                              key={`ellipsis-${idx}`}
                              className="px-2 text-gray-400"
                            >
                              ...
                            </span>
                          ) : (
                            <Button
                              key={page}
                              variant={
                                savedRestaurantsPage === page
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() =>
                                setSavedRestaurantsPage(page as number)
                              }
                              className="min-w-[2.5rem]"
                            >
                              {page}
                            </Button>
                          )
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSavedRestaurantsPage((p) =>
                              Math.min(totalSavedPages, p + 1)
                            )
                          }
                          disabled={savedRestaurantsPage === totalSavedPages}
                          className="px-2"
                        >
                          &gt;
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSavedRestaurantsPage(totalSavedPages)
                          }
                          disabled={savedRestaurantsPage === totalSavedPages}
                          className="px-2"
                        >
                          &gt;&gt;
                        </Button>
                      </div>

                      <div className="text-center text-sm text-gray-600">
                        Showing {savedStartIndex + 1}-
                        {Math.min(savedEndIndex, filteredRestaurants.length)} of{" "}
                        {filteredRestaurants.length} restaurants
                        {totalSavedPages > 1 &&
                          ` (Page ${savedRestaurantsPage} of ${totalSavedPages})`}
                      </div>
                    </>
                  )}
                </>
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
              setRestaurantSearchQuery(name);
              setShowRestaurantNameFinder(false);
            }}
            onClose={() => setShowRestaurantNameFinder(false)}
          />
        </div>
      )}
    </div>
  );
}
