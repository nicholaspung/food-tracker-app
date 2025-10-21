import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, Restaurant, FoodItem, Rating } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Star, MapPin, Utensils, Calendar } from 'lucide-react';

interface RestaurantDetailPageProps {
  restaurantId: string;
  onNavigateBack?: () => void;
}

export default function RestaurantDetailPage({ restaurantId, onNavigateBack }: RestaurantDetailPageProps) {
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [rating, setRating] = useState(5);
  const [ratingNotes, setRatingNotes] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();

  // Fetch restaurant details
  const { data: restaurant, isLoading: restaurantLoading } = useQuery<Restaurant>({
    queryKey: ['restaurant', restaurantId],
    queryFn: async () => {
      return await pb.collection('restaurants').getOne(restaurantId);
    },
  });

  // Fetch food items for this restaurant
  const { data: foodItems = [], isLoading: itemsLoading } = useQuery<FoodItem[]>({
    queryKey: ['foodItems', restaurantId],
    queryFn: async () => {
      const user = pb.authStore.record;
      if (!user) return [];

      return await pb.collection('food_items').getFullList({
        filter: `restaurant = "${restaurantId}" && user = "${user.id}"`,
        sort: '-created',
      });
    },
  });

  // Fetch all ratings for food items in this restaurant
  const { data: ratings = [] } = useQuery<Rating[]>({
    queryKey: ['ratings', restaurantId],
    queryFn: async () => {
      const user = pb.authStore.record;
      if (!user || foodItems.length === 0) return [];

      const foodItemIds = foodItems.map(item => `"${item.id}"`).join(',');
      return await pb.collection('ratings').getFullList({
        filter: `foodItem IN (${foodItemIds}) && user = "${user.id}"`,
        sort: '-created',
      });
    },
    enabled: foodItems.length > 0,
  });

  // Add food item mutation
  const addFoodItemMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      return await pb.collection('food_items').create({
        name: data.name,
        description: data.description || '',
        restaurant: restaurantId,
        user: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItems', restaurantId] });
      setShowAddItemForm(false);
      setItemName('');
      setItemDescription('');
      setError('');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to add food item');
    },
  });

  // Add rating mutation
  const addRatingMutation = useMutation({
    mutationFn: async (data: { foodItemId: string; rating: number; notes?: string; visitDate: string }) => {
      const user = pb.authStore.record;
      if (!user) throw new Error('User not authenticated');

      return await pb.collection('ratings').create({
        foodItem: data.foodItemId,
        rating: data.rating,
        notes: data.notes || '',
        visitDate: data.visitDate,
        user: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ratings', restaurantId] });
      setShowRatingForm(null);
      setRating(5);
      setRatingNotes('');
      setVisitDate(new Date().toISOString().split('T')[0]);
      setError('');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to add rating');
    },
  });

  const handleAddFoodItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await addFoodItemMutation.mutateAsync({ name: itemName, description: itemDescription });
    } finally {
      setLoading(false);
    }
  };

  const handleAddRating = async (e: React.FormEvent, foodItemId: string) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await addRatingMutation.mutateAsync({
        foodItemId,
        rating,
        notes: ratingNotes,
        visitDate,
      });
    } finally {
      setLoading(false);
    }
  };

  const getRatingsForItem = (foodItemId: string) => {
    return ratings.filter(r => r.foodItem === foodItemId);
  };

  const getAverageRating = (foodItemId: string) => {
    const itemRatings = getRatingsForItem(foodItemId);
    if (itemRatings.length === 0) return null;
    const sum = itemRatings.reduce((acc, r) => acc + r.rating, 0);
    return (sum / itemRatings.length).toFixed(1);
  };

  if (restaurantLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-gray-500 mb-4">Restaurant not found</p>
        <Button onClick={onNavigateBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateBack}
            data-testid="back-btn"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{restaurant.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {restaurant.location}
              </span>
              {restaurant.cuisineType && (
                <span className="flex items-center gap-1">
                  <Utensils className="w-3 h-3" />
                  {restaurant.cuisineType}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          onClick={() => setShowAddItemForm(!showAddItemForm)}
          size="sm"
          className="w-full"
          data-testid="add-food-item-btn"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Food Item
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add Food Item Form */}
        {showAddItemForm && (
          <Card className="mb-4" data-testid="add-food-item-form">
            <CardHeader>
              <CardTitle>Add Food Item</CardTitle>
              <CardDescription>What did you order?</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddFoodItem} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="itemName">Item Name *</Label>
                  <Input
                    id="itemName"
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    disabled={loading}
                    required
                    data-testid="food-item-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="itemDescription">Description (optional)</Label>
                  <Input
                    id="itemDescription"
                    type="text"
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    disabled={loading}
                    placeholder="e.g., Spicy, with extra cheese"
                    data-testid="food-item-description-input"
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="flex-1" data-testid="save-food-item-btn">
                    {loading ? 'Adding...' : 'Add Item'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddItemForm(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Food Items List */}
        {itemsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading food items...</div>
        ) : foodItems.length === 0 ? (
          <div className="text-center py-12">
            <Utensils className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No food items added yet</p>
            {!showAddItemForm && (
              <Button onClick={() => setShowAddItemForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Item
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {foodItems.map((item) => {
              const itemRatings = getRatingsForItem(item.id);
              const avgRating = getAverageRating(item.id);
              const isShowingRatingForm = showRatingForm === item.id;

              return (
                <Card key={item.id} data-testid={`food-item-card-${item.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{item.name}</CardTitle>
                        {item.description && (
                          <CardDescription className="mt-1">{item.description}</CardDescription>
                        )}
                      </div>
                      {avgRating && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {avgRating}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Existing Ratings */}
                    {itemRatings.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-700">
                          Ratings ({itemRatings.length})
                        </p>
                        {itemRatings.map((r) => (
                          <div
                            key={r.id}
                            className="p-3 bg-gray-50 rounded-md text-sm"
                            data-testid={`rating-${r.id}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-3 h-3 ${
                                      i < r.rating
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'text-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                {new Date(r.visitDate).toLocaleDateString()}
                              </span>
                            </div>
                            {r.notes && <p className="text-gray-600 mt-1">{r.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Rating Form */}
                    {isShowingRatingForm ? (
                      <form onSubmit={(e) => handleAddRating(e, item.id)} className="space-y-3 pt-2 border-t">
                        {error && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">
                            {error}
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor={`rating-${item.id}`}>Rating *</Label>
                          <div className="flex items-center gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                className="focus:outline-none"
                                data-testid={`star-${star}`}
                              >
                                <Star
                                  className={`w-8 h-8 ${
                                    star <= rating
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              </button>
                            ))}
                            <span className="ml-2 text-sm font-medium">{rating}/5</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`visitDate-${item.id}`}>Visit Date *</Label>
                          <Input
                            id={`visitDate-${item.id}`}
                            type="date"
                            value={visitDate}
                            onChange={(e) => setVisitDate(e.target.value)}
                            disabled={loading}
                            required
                            max={new Date().toISOString().split('T')[0]}
                            data-testid="visit-date-input"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`notes-${item.id}`}>Notes (optional)</Label>
                          <Input
                            id={`notes-${item.id}`}
                            type="text"
                            value={ratingNotes}
                            onChange={(e) => setRatingNotes(e.target.value)}
                            disabled={loading}
                            placeholder="How was it?"
                            data-testid="rating-notes-input"
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button type="submit" disabled={loading} size="sm" className="flex-1" data-testid="save-rating-btn">
                            {loading ? 'Saving...' : 'Save Rating'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowRatingForm(null)}
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRatingForm(item.id)}
                        className="w-full"
                        data-testid={`add-rating-btn-${item.id}`}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Rating
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
