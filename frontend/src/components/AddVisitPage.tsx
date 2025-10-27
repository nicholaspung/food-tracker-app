import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  pb,
  Restaurant,
  MenuItem as DBMenuItem,
  Visit,
  Friendship,
} from "@/lib/pocketbase";
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
  Utensils,
  Camera,
  Users,
} from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  searchAndCacheNearbyRestaurants,
  searchAndCacheRestaurantsByText,
  calculateDistance,
  formatDistance,
  geocodeLocation,
} from "@/services/googlePlaces";
import MenuScanStep from "@/components/MenuScanStep";
import { getRestaurantMenuItems } from "@/services/ocrService";

interface VisitMenuItem {
  name: string;
  description: string;
  rating: number;
  notes: string;
}

const RATING_OPTIONS = [
  { value: 1, label: "Don't eat ever", color: "bg-red-500" },
  { value: 2, label: "Try once", color: "bg-orange-500" },
  { value: 3, label: "Eat once in a while", color: "bg-yellow-500" },
  { value: 4, label: "Eat occasionally", color: "bg-lime-500" },
  { value: 5, label: "Eat often", color: "bg-green-500" },
];

interface AddVisitPageProps {
  onVisitSaved?: () => void;
}

export default function AddVisitPage({ onVisitSaved }: AddVisitPageProps = {}) {
  const [step, setStep] = useState(1);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<VisitMenuItem[]>([]);
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>('friends');
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState("");
  const [newRestaurantLocation, setNewRestaurantLocation] = useState("");
  const [newRestaurantCuisine, setNewRestaurantCuisine] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Menu scanning and selection states
  const [showMenuScan, setShowMenuScan] = useState(false);
  const [existingMenuItems, setExistingMenuItems] = useState<DBMenuItem[]>([]);
  const [showExistingMenu, setShowExistingMenu] = useState(false);

  // Google Places integration (now cached as Restaurant objects)
  const [nearbyPlaces, setNearbyPlaces] = useState<Restaurant[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false); // Default to saved restaurants

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const RESULTS_PER_PAGE = 20;

  // Manual location and text search
  const [manualLocation, setManualLocation] = useState("");
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");

  // Nearby places text filter (for refining results after location search)
  const [nearbySearchQuery, setNearbySearchQuery] = useState("");
  const [currentLocationContext, setCurrentLocationContext] = useState<{
    type: 'gps' | 'manual';
    location?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  // Reference coordinates for distance calculation (from zip code or GPS)
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
  const user = pb.authStore.record;

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
      const friendIds = friendships.map(f =>
        f.user === user.id ? f.friend : f.user
      );

      if (friendIds.length === 0) return [];

      // Fetch visits from all friends with visibility friends
      const filterConditions = friendIds.map(id => `user = "${id}"`).join(" || ");
      return await pb.collection("visits").getFullList({
        filter: `(${filterConditions}) && visibility = "friends"`,
      });
    },
    enabled: !!user && friendships.length > 0,
  });

  // Calculate visit counts per restaurant
  const getRestaurantStats = (restaurantId: string) => {
    const userVisitCount = userVisits.filter(v => v.restaurant === restaurantId).length;

    // Count unique friends who have visited this restaurant
    const friendsWhoVisited = new Set(
      friendVisits
        .filter(v => v.restaurant === restaurantId)
        .map(v => v.user)
    );
    const friendCount = friendsWhoVisited.size;

    return { userVisitCount, friendCount };
  };

  // Add restaurant mutation (manual entry with current location)
  const addRestaurantMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      location: string;
      cuisineType?: string;
    }) => {
      const user = pb.authStore.record;
      if (!user) throw new Error("User not authenticated");

      return await pb.collection("restaurants").create<Restaurant>({
        name: data.name,
        location: data.location,
        cuisineType: data.cuisineType || "",
        latitude: position?.latitude,
        longitude: position?.longitude,
        createdBy: user.id,
      });
    },
    onSuccess: (newRestaurant) => {
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      setSelectedRestaurant(newRestaurant);
      setShowAddRestaurant(false);
      setNewRestaurantName("");
      setNewRestaurantLocation("");
      setNewRestaurantCuisine("");
      setStep(2);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to add restaurant");
    },
  });

  // Save visit mutation
  const saveVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !selectedRestaurant) throw new Error("Missing data");

      // Create visit
      const visit = await pb.collection("visits").create({
        restaurant: selectedRestaurant.id,
        user: user.id,
        visitDate,
        visibility: visitVisibility, // Use the selected visibility for this visit
        notes: "",
      });

      // Create all food items
      for (const item of menuItems) {
        await pb.collection("food_items").create({
          name: item.name,
          description: item.description,
          visit: visit.id,
          rating: item.rating,
          notes: item.notes,
          user: user.id,
        });
      }

      return visit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["allVisits"] });
      queryClient.invalidateQueries({ queryKey: ["allFoodItems"] });
      // Reset form
      setStep(1);
      setSelectedRestaurant(null);
      setMenuItems([]);
      setVisitDate(new Date().toISOString().split("T")[0]);
      setSearchQuery("");
      setError("");
      // Navigate to home page
      onVisitSaved?.();
    },
    onError: (err: any) => {
      setError(err.message || "Failed to save visit");
    },
  });

  const filteredRestaurants = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.cuisineType?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  // Pagination logic for nearby places
  const totalPages = Math.ceil(nearbyPlaces.length / RESULTS_PER_PAGE);
  const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIndex = startIndex + RESULTS_PER_PAGE;
  const paginatedPlaces = nearbyPlaces.slice(startIndex, endIndex);

  // Calculate which pages to show in pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
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
      // Sort by distance (nulls last)
      if (a.distance === null && b.distance === null) return 0;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

  const handleAddMenuItem = () => {
    setMenuItems([
      ...menuItems,
      { name: "", description: "", rating: 3, notes: "" },
    ]);
  };

  const handleRemoveMenuItem = (index: number) => {
    setMenuItems(menuItems.filter((_, i) => i !== index));
  };

  const handleUpdateMenuItem = (
    index: number,
    field: keyof VisitMenuItem,
    value: string | number
  ) => {
    const updated = [...menuItems];
    updated[index] = { ...updated[index], [field]: value };
    setMenuItems(updated);
  };

  // Load existing menu items when restaurant is selected
  useEffect(() => {
    if (selectedRestaurant && step === 2) {
      const loadExistingMenuItems = async () => {
        const items = await getRestaurantMenuItems(selectedRestaurant.id);
        setExistingMenuItems(items);
        // Show menu scan step if this is a fresh entry to step 2
        if (menuItems.length === 0) {
          setShowMenuScan(true);
        }
      };
      loadExistingMenuItems();
    }
  }, [selectedRestaurant, step]);

  // Initialize visit visibility from user's default preference
  useEffect(() => {
    if (user?.defaultVisitVisibility) {
      setVisitVisibility(user.defaultVisitVisibility);
    }
  }, [user?.defaultVisitVisibility]);

  // Handle menu items extracted from OCR
  const handleMenuItemsExtracted = (items: DBMenuItem[]) => {
    const visitItems: VisitMenuItem[] = items.map((item) => ({
      name: item.name,
      description: item.description || "",
      rating: 3, // default rating
      notes: "",
    }));
    setMenuItems(visitItems);
    setShowMenuScan(false);
  };

  // Handle skip menu scan
  const handleSkipMenuScan = () => {
    setShowMenuScan(false);
    setShowExistingMenu(existingMenuItems.length > 0);
  };

  // Handle selecting existing menu items
  const handleSelectExistingItem = (item: DBMenuItem) => {
    const visitItem: VisitMenuItem = {
      name: item.name,
      description: item.description || "",
      rating: 3,
      notes: "",
    };
    setMenuItems([...menuItems, visitItem]);
  };

  // Handler to search nearby places
  const handleSearchNearby = async () => {
    setShowNearbyPlaces(true);
    setPlacesError("");
    setError("");
    setNearbySearchQuery(""); // Reset search query for new search
    setCurrentPage(1); // Reset to page 1

    // Get location first if we don't have it
    if (!position && !locationLoading) {
      refetchLocation();
    }

    // If we already have position, fetch places immediately
    if (position) {
      // Store reference coordinates for distance calculation
      setReferenceCoords({
        lat: position.latitude,
        lng: position.longitude,
      });

      setCurrentLocationContext({
        type: 'gps',
        latitude: position.latitude,
        longitude: position.longitude,
      });

      setPlacesLoading(true);
      try {
        // Fetch more results to ensure we have enough for pagination
        const restaurants = await searchAndCacheNearbyRestaurants({
          latitude: position.latitude,
          longitude: position.longitude,
          radius: 5000, // Larger radius to get more results
        });

        setNearbyPlaces(restaurants);

        // Invalidate restaurants query to show new cached restaurants in saved list
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
      !placesLoading
    ) {
      const fetchNearbyPlaces = async () => {
        // Store reference coordinates for distance calculation
        setReferenceCoords({
          lat: position.latitude,
          lng: position.longitude,
        });

        // Set location context for GPS search
        setCurrentLocationContext({
          type: 'gps',
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
          // Invalidate restaurants query to show new cached restaurants in saved list
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

  // Debounced search for nearby places text filter
  useEffect(() => {
    if (!showNearbyPlaces || !currentLocationContext) {
      return;
    }

    // Don't search on empty query - just show the initial results
    if (nearbySearchQuery.trim() === "") {
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setPlacesLoading(true);
      setPlacesError("");
      setCurrentPage(1); // Reset to page 1

      try {
        if (currentLocationContext.type === 'gps' && currentLocationContext.latitude && currentLocationContext.longitude) {
          // Use text search with GPS location bias
          const restaurants = await searchAndCacheRestaurantsByText({
            query: nearbySearchQuery.trim(),
            location: `${currentLocationContext.latitude},${currentLocationContext.longitude}`,
            radius: 5000,
          });

          setNearbyPlaces(restaurants);
          // Invalidate restaurants query to show new cached restaurants in saved list
          queryClient.invalidateQueries({ queryKey: ["restaurants"] });
        } else if (currentLocationContext.type === 'manual' && currentLocationContext.location) {
          // Use text search with manual location
          const restaurants = await searchAndCacheRestaurantsByText({
            query: nearbySearchQuery.trim(),
            location: currentLocationContext.location,
            radius: 5000,
          });

          setNearbyPlaces(restaurants);
          // Invalidate restaurants query to show new cached restaurants in saved list
          queryClient.invalidateQueries({ queryKey: ["restaurants"] });
        }
      } catch (err) {
        setPlacesError(
          err instanceof Error
            ? err.message
            : "Failed to search food places"
        );
      } finally {
        setPlacesLoading(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceTimer);
  }, [nearbySearchQuery, showNearbyPlaces, currentLocationContext]);

  // Handle manual location and text search
  const handleManualSearch = async () => {
    if (!manualLocation.trim() && !restaurantSearchQuery.trim()) {
      setPlacesError("Please enter a location or food place name to search");
      return;
    }

    setPlacesLoading(true);
    setPlacesError("");
    setShowNearbyPlaces(true);
    setNearbySearchQuery(""); // Reset search query
    setCurrentPage(1); // Reset to page 1

    try {
      // Geocode the location to get coordinates for distance calculation
      let coords: { lat: number; lng: number } | null = null;
      if (manualLocation.trim()) {
        coords = await geocodeLocation(manualLocation.trim());
        if (coords) {
          setReferenceCoords(coords);
        }
      }

      // Save location context
      setCurrentLocationContext({
        type: 'manual',
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

      // Invalidate restaurants query to show new cached restaurants in saved list
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (err) {
      setPlacesError(
        err instanceof Error
          ? err.message
          : "Failed to search food places"
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
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVisit = async () => {
    setError("");
    setLoading(true);

    try {
      await saveVisitMutation.mutateAsync();
    } finally {
      setLoading(false);
    }
  };

  const canProceedFromStep2 =
    menuItems.length > 0 && menuItems.every((item) => item.name.trim() !== "");
  const canSave = menuItems.every(
    (item) => item.name.trim() !== "" && item.rating > 0
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Add Visit</h1>
        <div className="flex items-center gap-2 mt-3">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                s <= step ? "bg-blue-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {step === 1 && "Select a restaurant"}
          {step === 2 && "Add menu items"}
          {step === 3 && "Rate your items"}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Step 1: Select Restaurant */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Saved restaurants view (default) */}
            {!showNearbyPlaces && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search saved restaurants..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Search options */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">
                    Or search for food places:
                  </div>

                  {/* Manual location search */}
                  <div className="space-y-2">
                    <Label htmlFor="manual-location" className="text-xs text-gray-600">
                      Location (city, zip code, or address)
                    </Label>
                    <Input
                      id="manual-location"
                      type="text"
                      placeholder="e.g., 90210, Los Angeles, CA"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                    />
                  </div>

                  {/* Restaurant name/type search */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurant-search" className="text-xs text-gray-600">
                      Place name or type (optional)
                    </Label>
                    <Input
                      id="restaurant-search"
                      type="text"
                      placeholder="e.g., Starbucks, cafe, bakery, dessert"
                      value={restaurantSearchQuery}
                      onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                    />
                  </div>

                  <Button
                    onClick={handleManualSearch}
                    variant="default"
                    className="w-full"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search Food Places
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-500">or</span>
                    </div>
                  </div>

                  <Button
                    onClick={handleSearchNearby}
                    variant="outline"
                    className="w-full"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    Use My Current Location
                  </Button>
                </div>
              </>
            )}

            {/* Nearby places view (only when user clicks Search Nearby) */}
            {showNearbyPlaces && (
              <>
                {/* Search inputs - keep visible for continued searching */}
                <div className="space-y-3 pb-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700">
                    Search again:
                  </div>

                  {/* Manual location search */}
                  <div className="space-y-2">
                    <Label htmlFor="manual-location-nearby" className="text-xs text-gray-600">
                      Location (city, zip code, or address)
                    </Label>
                    <Input
                      id="manual-location-nearby"
                      type="text"
                      placeholder="e.g., 90210, Los Angeles, CA"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                    />
                  </div>

                  {/* Restaurant name/type search */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurant-search-nearby" className="text-xs text-gray-600">
                      Place name or type (optional)
                    </Label>
                    <Input
                      id="restaurant-search-nearby"
                      type="text"
                      placeholder="e.g., Starbucks, cafe, bakery, dessert"
                      value={restaurantSearchQuery}
                      onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleManualSearch();
                        }
                      }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleManualSearch()}
                      variant="default"
                      className="flex-1"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      New Search
                    </Button>
                    <Button
                      onClick={() => handleSearchNearby()}
                      variant="outline"
                      className="flex-1"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Use GPS
                    </Button>
                  </div>
                </div>

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

                {!placesLoading && !placesError && nearbyPlaces.length > 0 && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-900">
                            Found {nearbyPlaces.length} place{nearbyPlaces.length !== 1 ? 's' : ''}
                          </p>
                          <p className="text-xs text-green-700">
                            {currentLocationContext?.type === 'gps'
                              ? 'Sorted by distance from your location'
                              : currentLocationContext?.location
                                ? `Near ${currentLocationContext.location}`
                                : 'Sorted by distance'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowNearbyPlaces(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Text search input for refining results */}
                {currentLocationContext && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search by name or type (cafe, dessert, etc)..."
                      value={nearbySearchQuery}
                      onChange={(e) => setNearbySearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
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

                <div className="space-y-3">
                  {nearbyPlacesWithDistance.map(({ restaurant, distance }) => {
                    const stats = getRestaurantStats(restaurant.id);
                    return (
                      <Card
                        key={restaurant.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => {
                          setSelectedRestaurant(restaurant);
                          setStep(2);
                        }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg">
                                {restaurant.name}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                {restaurant.location}
                                {restaurant.cuisineType &&
                                  ` • ${restaurant.cuisineType}`}
                              </CardDescription>
                            </div>
                            <Badge variant="secondary" className="ml-2">
                              <MapPin className="w-3 h-3 mr-1" />
                              {distance !== null ? formatDistance(distance) : "Near"}
                            </Badge>
                          </div>
                          {(stats.userVisitCount > 0 || stats.friendCount > 0) && (
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                              {stats.userVisitCount > 0 && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>You: {stats.userVisitCount} {stats.userVisitCount === 1 ? 'visit' : 'visits'}</span>
                                </div>
                              )}
                              {stats.friendCount > 0 && (
                                <div className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  <span>{stats.friendCount} {stats.friendCount === 1 ? 'friend' : 'friends'}</span>
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
                    {/* First/Previous buttons */}
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
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2"
                    >
                      &lt;
                    </Button>

                    {/* Page numbers */}
                    {getPageNumbers().map((page, idx) => (
                      page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
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
                    ))}

                    {/* Next/Last buttons */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
                    Showing {startIndex + 1}-{Math.min(endIndex, nearbyPlaces.length)} of {nearbyPlaces.length} places
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
                      setNearbySearchQuery("");
                      setReferenceCoords(null);
                      setCurrentPage(1);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Back to Saved Restaurants
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
                      <form
                        onSubmit={handleAddRestaurant}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="name">Restaurant Name *</Label>
                          <Input
                            id="name"
                            value={newRestaurantName}
                            onChange={(e) =>
                              setNewRestaurantName(e.target.value)
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="location">Location *</Label>
                          <Input
                            id="location"
                            value={newRestaurantLocation}
                            onChange={(e) =>
                              setNewRestaurantLocation(e.target.value)
                            }
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
                          />
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
                      onClick={() => setShowAddRestaurant(true)}
                      variant="outline"
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Restaurant
                    </Button>

                    <div className="space-y-3">
                      {filteredRestaurants.map((restaurant) => {
                        const stats = getRestaurantStats(restaurant.id);
                        return (
                          <Card
                            key={restaurant.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              setSelectedRestaurant(restaurant);
                              setStep(2);
                            }}
                          >
                            <CardHeader className="pb-3">
                              <CardTitle className="text-lg">
                                {restaurant.name}
                              </CardTitle>
                              <CardDescription>
                                {restaurant.location}
                                {restaurant.cuisineType &&
                                  ` • ${restaurant.cuisineType}`}
                              </CardDescription>
                              {(stats.userVisitCount > 0 || stats.friendCount > 0) && (
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                                  {stats.userVisitCount > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      <span>You: {stats.userVisitCount} {stats.userVisitCount === 1 ? 'visit' : 'visits'}</span>
                                    </div>
                                  )}
                                  {stats.friendCount > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      <span>{stats.friendCount} {stats.friendCount === 1 ? 'friend' : 'friends'}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </CardHeader>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 2: Add Menu Items */}
        {step === 2 && selectedRestaurant && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {selectedRestaurant.name}
                </CardTitle>
                <CardDescription>{selectedRestaurant.location}</CardDescription>
              </CardHeader>
            </Card>

            {/* Menu Scan Step */}
            {showMenuScan && (
              <MenuScanStep
                restaurantId={selectedRestaurant.id}
                restaurantName={selectedRestaurant.name}
                onItemsExtracted={handleMenuItemsExtracted}
                onSkip={handleSkipMenuScan}
              />
            )}

            {/* Existing Menu Items Selection */}
            {!showMenuScan &&
              showExistingMenu &&
              existingMenuItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Select from Menu
                    </CardTitle>
                    <CardDescription>
                      {existingMenuItems.length} items available from previous
                      scans
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {existingMenuItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectExistingItem(item)}
                        className="w-full p-3 text-left rounded-lg border hover:border-blue-500 hover:bg-blue-50 transition-all"
                      >
                        <div className="font-medium">{item.name}</div>
                        {item.description && (
                          <div className="text-sm text-gray-600 mt-1">
                            {item.description}
                          </div>
                        )}
                      </button>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() => setShowExistingMenu(false)}
                      className="w-full mt-2"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Hide Menu
                    </Button>
                  </CardContent>
                </Card>
              )}

            {/* Manual Add / Show Existing Menu / Scan Menu buttons */}
            {!showMenuScan && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => setShowMenuScan(true)}
                  className="w-full"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Scan Menu Photo
                </Button>
                <div className="flex gap-2">
                  <Button onClick={handleAddMenuItem} className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Manually
                  </Button>
                  {existingMenuItems.length > 0 && !showExistingMenu && (
                    <Button
                      variant="outline"
                      onClick={() => setShowExistingMenu(true)}
                      className="flex-1"
                    >
                      <Utensils className="w-4 h-4 mr-2" />
                      Show Menu ({existingMenuItems.length})
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Menu Items List */}
            {menuItems.map((item, index) => (
              <Card key={index}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start justify-between">
                    <Label>Item {index + 1}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMenuItem(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Item name *"
                    value={item.name}
                    onChange={(e) =>
                      handleUpdateMenuItem(index, "name", e.target.value)
                    }
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={item.description}
                    onChange={(e) =>
                      handleUpdateMenuItem(index, "description", e.target.value)
                    }
                  />
                </CardContent>
              </Card>
            ))}

            {/* Navigation buttons */}
            {!showMenuScan && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!canProceedFromStep2}
                  className="flex-1"
                >
                  Next: Rate Items
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Rate Items */}
        {step === 3 && (
          <div className="space-y-4">
            {!showDateEdit && (
              <div
                className="flex items-center justify-between p-3 bg-white rounded-lg border cursor-pointer"
                onClick={() => setShowDateEdit(true)}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">
                    {new Date(visitDate).toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <span className="text-xs text-gray-500">Tap to change</span>
              </div>
            )}

            {showDateEdit && (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <Label>Visit Date</Label>
                  <Input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                  <Button
                    variant="outline"
                    onClick={() => setShowDateEdit(false)}
                    className="w-full"
                  >
                    Done
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Visibility Checkbox */}
            <div className="p-4 bg-white rounded-lg border">
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
                    <span className="text-sm font-medium">Friends can view this visit</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {visitVisibility === 'friends'
                      ? "Your friends will be able to see this visit and your ratings"
                      : "Only you will be able to see this visit"}
                  </p>
                </div>
              </label>
            </div>

            {menuItems.map((item, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  {item.description && (
                    <CardDescription className="text-sm">
                      {item.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {RATING_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          handleUpdateMenuItem(index, "rating", option.value)
                        }
                        className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                          item.rating === option.value
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-3 h-3 rounded-full ${option.color}`}
                            />
                            <span className="font-medium">{option.label}</span>
                          </div>
                          {item.rating === option.value && (
                            <Check className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={item.notes}
                    onChange={(e) =>
                      handleUpdateMenuItem(index, "notes", e.target.value)
                    }
                  />
                </CardContent>
              </Card>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleSaveVisit}
                disabled={!canSave || loading}
                className="flex-1"
              >
                {loading ? "Saving..." : "Save Visit"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
