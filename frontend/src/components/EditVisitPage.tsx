import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, Restaurant, Visit, FoodItem } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Plus, X, Check, Trash2, Calendar, Users } from 'lucide-react';

interface MenuItem {
  id?: string; // undefined if new item
  name: string;
  description: string;
  rating: number;
  notes: string;
  _deleted?: boolean;
}

const RATING_OPTIONS = [
  { value: 1, label: "Don't eat ever", color: 'bg-red-500' },
  { value: 2, label: 'Try once', color: 'bg-orange-500' },
  { value: 3, label: 'Eat once in a while', color: 'bg-yellow-500' },
  { value: 4, label: 'Eat occasionally', color: 'bg-lime-500' },
  { value: 5, label: 'Eat often', color: 'bg-green-500' },
];

interface EditVisitPageProps {
  visitId: string;
  onNavigateBack?: () => void;
}

export default function EditVisitPage({ visitId, onNavigateBack }: EditVisitPageProps) {
  const [step, setStep] = useState(1);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [visitDate, setVisitDate] = useState('');
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>('friends');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();

  // Fetch visit details
  const { data: visit, isLoading: visitLoading } = useQuery<Visit>({
    queryKey: ['visit', visitId],
    queryFn: async () => {
      return await pb.collection('visits').getOne(visitId);
    },
  });

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ['restaurants'],
    queryFn: async () => {
      return await pb.collection('restaurants').getFullList({
        sort: '-created',
      });
    },
  });

  // Fetch food items for this visit
  const { data: existingFoodItems = [] } = useQuery<FoodItem[]>({
    queryKey: ['foodItems', visitId],
    queryFn: async () => {
      return await pb.collection('food_items').getFullList({
        filter: `visit = "${visitId}"`,
        sort: '-created',
      });
    },
  });

  // Initialize form when data loads
  useEffect(() => {
    if (visit && restaurants.length > 0) {
      const restaurant = restaurants.find(r => r.id === visit.restaurant);
      setSelectedRestaurant(restaurant || null);
      // Ensure date is in YYYY-MM-DD format for date input
      const dateStr = visit.visitDate.split(' ')[0]; // Handle "YYYY-MM-DD HH:MM:SS" format
      setVisitDate(dateStr);
      // Initialize visibility from visit data
      setVisitVisibility(visit.visibility || 'friends');
    }
  }, [visit, restaurants]);

  useEffect(() => {
    if (existingFoodItems.length > 0) {
      setMenuItems(existingFoodItems.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        rating: item.rating,
        notes: item.notes || '',
      })));
    }
  }, [existingFoodItems]);

  // Update visit mutation
  const updateVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !selectedRestaurant) throw new Error('Missing data');

      // Update visit (restaurant field is not updated - user must delete to change restaurant)
      await pb.collection('visits').update(visitId, {
        visitDate,
        visibility: visitVisibility,
      });

      // Handle food items
      for (const item of menuItems) {
        if (item._deleted && item.id) {
          // Delete existing item
          await pb.collection('food_items').delete(item.id);
        } else if (item.id) {
          // Update existing item
          await pb.collection('food_items').update(item.id, {
            name: item.name,
            description: item.description,
            rating: item.rating,
            notes: item.notes,
          });
        } else {
          // Create new item
          await pb.collection('food_items').create({
            name: item.name,
            description: item.description,
            visit: visitId,
            rating: item.rating,
            notes: item.notes,
            user: user.id,
          });
        }
      }

      return visit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['foodItems', visitId] });
      queryClient.invalidateQueries({ queryKey: ['allFoodItems'] });
      onNavigateBack?.();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update visit');
    },
  });


  const handleAddMenuItem = () => {
    setMenuItems([...menuItems, { name: '', description: '', rating: 3, notes: '' }]);
  };

  const handleRemoveMenuItem = (index: number) => {
    const item = menuItems[index];
    if (item.id) {
      // Mark existing item as deleted
      const updated = [...menuItems];
      updated[index] = { ...updated[index], _deleted: true };
      setMenuItems(updated);
    } else {
      // Remove new item completely
      setMenuItems(menuItems.filter((_, i) => i !== index));
    }
  };

  const handleUpdateMenuItem = (index: number, field: keyof MenuItem, value: string | number) => {
    const updated = [...menuItems];
    updated[index] = { ...updated[index], [field]: value };
    setMenuItems(updated);
  };

  const handleSave = async () => {
    setError('');
    setLoading(true);

    try {
      await updateVisitMutation.mutateAsync();
    } finally {
      setLoading(false);
    }
  };

  const activeMenuItems = menuItems.filter(item => !item._deleted);
  const canProceedFromStep2 = activeMenuItems.length > 0 && activeMenuItems.every(item => item.name.trim() !== '');
  const canSave = activeMenuItems.every(item => item.name.trim() !== '' && item.rating > 0);

  if (visitLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-gray-500 mb-4">Visit not found</p>
        <Button onClick={onNavigateBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={onNavigateBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold text-gray-900">Edit Visit</h1>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                s <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {step === 1 && 'Edit menu items'}
          {step === 2 && 'Update ratings'}
        </p>

        {/* Always-visible date picker */}
        {visitDate && (
          <div className="mt-3">
            {!showDateEdit ? (
              <div
                className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setShowDateEdit(true)}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
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
            ) : (
              <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                <Label className="text-xs text-gray-600">Visit Date</Label>
                <Input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDateEdit(false)}
                  className="w-full"
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Visibility Checkbox */}
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Restaurant Info - Read Only */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Restaurant</CardTitle>
            <CardDescription>
              {selectedRestaurant?.name || 'Loading...'}
              {selectedRestaurant?.location && ` • ${selectedRestaurant.location}`}
              {selectedRestaurant?.cuisineType && ` • ${selectedRestaurant.cuisineType}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-gray-500">
              To change the restaurant, please delete this visit and create a new one.
            </p>
          </CardContent>
        </Card>

        {/* Step 1: Edit Menu Items */}
        {step === 1 && selectedRestaurant && (
          <div className="space-y-4">
            <Button onClick={handleAddMenuItem} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Menu Item
            </Button>

            {activeMenuItems.map((item, actualIndex) => {
              const index = menuItems.findIndex(m => m === item);
              return (
                <Card key={index}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <Label>Item {actualIndex + 1}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMenuItem(index)}
                      >
                        {item.id ? <Trash2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
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
              );
            })}

            <Button
              onClick={() => setStep(2)}
              disabled={!canProceedFromStep2}
              className="w-full"
            >
              Next: Update Ratings
            </Button>
          </div>
        )}

        {/* Step 2: Update Ratings */}
        {step === 2 && (
          <div className="space-y-4">
            {activeMenuItems.map((item, actualIndex) => {
              const index = menuItems.findIndex(m => m === item);
              return (
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
              );
            })}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave || loading}
                className="flex-1"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
