import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, Restaurant, PlaceResult, MenuItem as DBMenuItem } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Search, Calendar, Check, MapPin, Loader2, RefreshCw, Utensils, Camera } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { searchNearbyRestaurants, getCuisineFromTypes } from '@/services/googlePlaces';
import MenuScanStep from '@/components/MenuScanStep';
import { getRestaurantMenuItems } from '@/services/ocrService';

interface VisitMenuItem {
  name: string;
  description: string;
  rating: number;
  notes: string;
}

const RATING_OPTIONS = [
  { value: 1, label: "Don't eat ever", color: 'bg-red-500' },
  { value: 2, label: 'Try once', color: 'bg-orange-500' },
  { value: 3, label: 'Eat once in a while', color: 'bg-yellow-500' },
  { value: 4, label: 'Eat occasionally', color: 'bg-lime-500' },
  { value: 5, label: 'Eat often', color: 'bg-green-500' },
];

interface AddVisitPageProps {
  onVisitSaved?: () => void;
}

export default function AddVisitPage({ onVisitSaved }: AddVisitPageProps = {}) {
  const [step, setStep] = useState(1);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<VisitMenuItem[]>([]);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [newRestaurantLocation, setNewRestaurantLocation] = useState('');
  const [newRestaurantCuisine, setNewRestaurantCuisine] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Menu scanning and selection states
  const [showMenuScan, setShowMenuScan] = useState(false);
  const [existingMenuItems, setExistingMenuItems] = useState<DBMenuItem[]>([]);
  const [showExistingMenu, setShowExistingMenu] = useState(false);

  // Google Places integration
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false); // Default to saved restaurants

  // Location - only fetch when user requests nearby search
  const { position, error: locationError, loading: locationLoading, refetch: refetchLocation } = useGeolocation(false);

  const queryClient = useQueryClient();

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ['restaurants'],
    queryFn: async () => {
      return await pb.collection('restaurants').getFullList({
        sort: '-created',
      });
    },
  });

  // Add restaurant mutation (manual entry with current location)
  const addRestaurantMutation = useMutation({
    mutationFn: async (data: { name: string; location: string; cuisineType?: string }) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      return await pb.collection('restaurants').create<Restaurant>({
        name: data.name,
        location: data.location,
        cuisineType: data.cuisineType || '',
        latitude: position?.latitude,
        longitude: position?.longitude,
        user: user.id,
      });
    },
    onSuccess: (newRestaurant) => {
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      setSelectedRestaurant(newRestaurant);
      setShowAddRestaurant(false);
      setNewRestaurantName('');
      setNewRestaurantLocation('');
      setNewRestaurantCuisine('');
      setStep(2);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to add restaurant');
    },
  });

  // Save visit mutation
  const saveVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !selectedRestaurant) throw new Error('Missing data');

      // Create visit
      const visit = await pb.collection('visits').create({
        restaurant: selectedRestaurant.id,
        user: user.id,
        visitDate,
        notes: '',
      });

      // Create all food items
      for (const item of menuItems) {
        await pb.collection('food_items').create({
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
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['allFoodItems'] });
      // Reset form
      setStep(1);
      setSelectedRestaurant(null);
      setMenuItems([]);
      setVisitDate(new Date().toISOString().split('T')[0]);
      setSearchQuery('');
      setError('');
      // Navigate to home page
      onVisitSaved?.();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to save visit');
    },
  });

  const filteredRestaurants = restaurants.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.cuisineType?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const handleAddMenuItem = () => {
    setMenuItems([...menuItems, { name: '', description: '', rating: 3, notes: '' }]);
  };

  const handleRemoveMenuItem = (index: number) => {
    setMenuItems(menuItems.filter((_, i) => i !== index));
  };

  const handleUpdateMenuItem = (index: number, field: keyof VisitMenuItem, value: string | number) => {
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

  // Handle menu items extracted from OCR
  const handleMenuItemsExtracted = (items: DBMenuItem[]) => {
    const visitItems: VisitMenuItem[] = items.map(item => ({
      name: item.name,
      description: item.description || '',
      rating: 3, // default rating
      notes: '',
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
      description: item.description || '',
      rating: 3,
      notes: '',
    };
    setMenuItems([...menuItems, visitItem]);
  };

  // Handler to search nearby places
  const handleSearchNearby = async () => {
    setShowNearbyPlaces(true);
    setPlacesError('');
    setError('');

    // Get location first if we don't have it
    if (!position && !locationLoading) {
      refetchLocation();
    }

    // If we already have position, fetch places immediately
    if (position) {
      setPlacesLoading(true);
      try {
        const places = await searchNearbyRestaurants({
          latitude: position.latitude,
          longitude: position.longitude,
          radius: 1500, // 1.5km radius
        });
        setNearbyPlaces(places);
      } catch (err) {
        setPlacesError(err instanceof Error ? err.message : 'Failed to load nearby restaurants');
      } finally {
        setPlacesLoading(false);
      }
    }
  };

  // Watch for location changes when user is viewing nearby places
  useEffect(() => {
    if (position && showNearbyPlaces && nearbyPlaces.length === 0 && !placesLoading) {
      const fetchNearbyPlaces = async () => {
        setPlacesLoading(true);
        setPlacesError('');
        try {
          const places = await searchNearbyRestaurants({
            latitude: position.latitude,
            longitude: position.longitude,
            radius: 1500,
          });
          setNearbyPlaces(places);
        } catch (err) {
          setPlacesError(err instanceof Error ? err.message : 'Failed to load nearby restaurants');
        } finally {
          setPlacesLoading(false);
        }
      };

      fetchNearbyPlaces();
    }
  }, [position, showNearbyPlaces]);

  const handleSelectGooglePlace = async (place: PlaceResult) => {
    setError('');
    setLoading(true);

    try {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      // Check if restaurant already exists with this placeId
      const existing = restaurants.find(r => r.placeId === place.place_id);
      if (existing) {
        setSelectedRestaurant(existing);
        setStep(2);
        return;
      }

      // Create new restaurant from Google Place and cache it in our database
      const newRestaurant = await pb.collection('restaurants').create<Restaurant>({
        name: place.name,
        location: place.vicinity,
        cuisineType: getCuisineFromTypes(place.types),
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        placeId: place.place_id,
        user: user.id,
      });

      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      setSelectedRestaurant(newRestaurant);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to add restaurant');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
    setError('');
    setLoading(true);

    try {
      await saveVisitMutation.mutateAsync();
    } finally {
      setLoading(false);
    }
  };

  const canProceedFromStep2 = menuItems.length > 0 && menuItems.every(item => item.name.trim() !== '');
  const canSave = menuItems.every(item => item.name.trim() !== '' && item.rating > 0);

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
                s <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {step === 1 && 'Select a restaurant'}
          {step === 2 && 'Add menu items'}
          {step === 3 && 'Rate your items'}
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

                {/* Search nearby button - only calls API when clicked */}
                <Button
                  onClick={handleSearchNearby}
                  variant="outline"
                  className="w-full"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Search Nearby Restaurants
                </Button>
              </>
            )}

            {/* Nearby places view (only when user clicks Search Nearby) */}
            {showNearbyPlaces && (
              <>
                {/* Location status */}
                {locationLoading && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-4 flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Getting your location...</p>
                        <p className="text-xs text-blue-700">This helps find nearby restaurants</p>
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
                          <p className="text-sm font-medium text-yellow-900">Location unavailable</p>
                          <p className="text-xs text-yellow-700 mt-1">{locationError}</p>
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

                {position && !placesLoading && !placesError && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-900">Found {nearbyPlaces.length} nearby</p>
                          <p className="text-xs text-green-700">Within 1.5km of your location</p>
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
              </>
            )}

            {/* Google Places nearby restaurants */}
            {showNearbyPlaces && (
              <>
                {placesLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    <span className="ml-2 text-sm text-gray-500">Finding nearby restaurants...</span>
                  </div>
                )}

                {placesError && (
                  <Card className="bg-red-50 border-red-200">
                    <CardContent className="pt-4">
                      <p className="text-sm text-red-600">{placesError}</p>
                    </CardContent>
                  </Card>
                )}

                {!placesLoading && nearbyPlaces.length === 0 && !placesError && position && (
                  <Card className="bg-gray-50">
                    <CardContent className="pt-4 text-center">
                      <p className="text-sm text-gray-600">No nearby restaurants found</p>
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
                  {nearbyPlaces.map((place) => (
                    <Card
                      key={place.place_id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleSelectGooglePlace(place)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{place.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {place.vicinity}
                              {getCuisineFromTypes(place.types) && ` • ${getCuisineFromTypes(place.types)}`}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary" className="ml-2">
                            <MapPin className="w-3 h-3 mr-1" />
                            Near
                          </Badge>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>

                {(nearbyPlaces.length > 0 || placesError || locationError) && (
                  <Button
                    onClick={() => {
                      setShowNearbyPlaces(false);
                      setNearbyPlaces([]);
                      setPlacesError('');
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
                      <form onSubmit={handleAddRestaurant} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Restaurant Name *</Label>
                          <Input
                            id="name"
                            value={newRestaurantName}
                            onChange={(e) => setNewRestaurantName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="location">Location *</Label>
                          <Input
                            id="location"
                            value={newRestaurantLocation}
                            onChange={(e) => setNewRestaurantLocation(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cuisine">Cuisine Type</Label>
                          <Input
                            id="cuisine"
                            value={newRestaurantCuisine}
                            onChange={(e) => setNewRestaurantCuisine(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" disabled={loading} className="flex-1">
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
                      {filteredRestaurants.map((restaurant) => (
                        <Card
                          key={restaurant.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => {
                            setSelectedRestaurant(restaurant);
                            setStep(2);
                          }}
                        >
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                            <CardDescription>
                              {restaurant.location}
                              {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
                            </CardDescription>
                          </CardHeader>
                        </Card>
                      ))}
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
                <CardTitle className="text-lg">{selectedRestaurant.name}</CardTitle>
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
            {!showMenuScan && showExistingMenu && existingMenuItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Select from Menu</CardTitle>
                  <CardDescription>
                    {existingMenuItems.length} items available from previous scans
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
                <Button
                  variant="outline"
                  onClick={() => setShowMenuScan(true)}
                  className="w-full"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Scan Menu Photo
                </Button>
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
                    onChange={(e) => handleUpdateMenuItem(index, 'name', e.target.value)}
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={item.description}
                    onChange={(e) => handleUpdateMenuItem(index, 'description', e.target.value)}
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
                    {new Date(visitDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
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
                    max={new Date().toISOString().split('T')[0]}
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

            {menuItems.map((item, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  {item.description && (
                    <CardDescription className="text-sm">{item.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {RATING_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleUpdateMenuItem(index, 'rating', option.value)}
                        className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                          item.rating === option.value
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${option.color}`} />
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
                    onChange={(e) => handleUpdateMenuItem(index, 'notes', e.target.value)}
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
                {loading ? 'Saving...' : 'Save Visit'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
