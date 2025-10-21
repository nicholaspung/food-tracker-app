import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, Restaurant } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Search, MapPin, Utensils } from 'lucide-react';

interface RestaurantsPageProps {
  onNavigateToRestaurant?: (id: string) => void;
}

export default function RestaurantsPage({ onNavigateToRestaurant }: RestaurantsPageProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();

  // Fetch restaurants
  const { data: restaurants = [], isLoading } = useQuery<Restaurant[]>({
    queryKey: ['restaurants'],
    queryFn: async () => {
      const user = pb.authStore.record;
      if (!user) return [];

      return await pb.collection('restaurants').getFullList({
        filter: `user = "${user.id}"`,
        sort: '-created',
      });
    },
  });

  // Add restaurant mutation
  const addRestaurantMutation = useMutation({
    mutationFn: async (data: { name: string; location: string; cuisineType?: string }) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      return await pb.collection('restaurants').create({
        name: data.name,
        location: data.location,
        cuisineType: data.cuisineType || '',
        user: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      setShowAddForm(false);
      setName('');
      setLocation('');
      setCuisineType('');
      setError('');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to add restaurant');
    },
  });

  const handleAddRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await addRestaurantMutation.mutateAsync({ name, location, cuisineType });
    } finally {
      setLoading(false);
    }
  };

  // Filter restaurants based on search
  const filteredRestaurants = restaurants.filter((restaurant) =>
    restaurant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    restaurant.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (restaurant.cuisineType?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-gray-900">Restaurants</h1>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            size="sm"
            data-testid="add-restaurant-btn"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search restaurants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="restaurant-search"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add Restaurant Form */}
        {showAddForm && (
          <Card className="mb-4" data-testid="add-restaurant-form">
            <CardHeader>
              <CardTitle>Add New Restaurant</CardTitle>
              <CardDescription>Enter restaurant details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddRestaurant} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Restaurant Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    required
                    data-testid="restaurant-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={loading}
                    required
                    data-testid="restaurant-location-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cuisineType">Cuisine Type</Label>
                  <Input
                    id="cuisineType"
                    type="text"
                    value={cuisineType}
                    onChange={(e) => setCuisineType(e.target.value)}
                    disabled={loading}
                    placeholder="e.g., Italian, Japanese, Mexican"
                    data-testid="restaurant-cuisine-input"
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="flex-1" data-testid="save-restaurant-btn">
                    {loading ? 'Adding...' : 'Add Restaurant'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddForm(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Restaurant List */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading restaurants...</div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="text-center py-12">
            <Utensils className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">
              {searchQuery ? 'No restaurants found' : 'No restaurants added yet'}
            </p>
            {!searchQuery && !showAddForm && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Restaurant
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRestaurants.map((restaurant) => (
              <Card
                key={restaurant.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onNavigateToRestaurant?.(restaurant.id)}
                data-testid={`restaurant-card-${restaurant.id}`}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                  <CardDescription className="flex items-start gap-4 mt-2">
                    <span className="flex items-center gap-1 text-sm">
                      <MapPin className="w-3 h-3" />
                      {restaurant.location}
                    </span>
                    {restaurant.cuisineType && (
                      <span className="flex items-center gap-1 text-sm">
                        <Utensils className="w-3 h-3" />
                        {restaurant.cuisineType}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
