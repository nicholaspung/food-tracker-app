import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pb, Restaurant, Visit, FoodItem } from '@/lib/pocketbase';
import { getTodayLocalDateString, localDateStringToUTC, utcToLocalDateString, formatLocalDateForDisplay } from '@/lib/dateUtils';
import { editVisitDraftService } from '@/services/editVisitDraftService';
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
      // Check if we have a draft for this visit
      const draft = editVisitDraftService.getDraft(visitId);

      if (draft) {
        // Restore from draft
        setSelectedRestaurant(draft.restaurant);
        setMenuItems(draft.menuItems);
        setVisitDate(draft.visitDate);
        setVisitVisibility(draft.visitVisibility);
        setStep(draft.step);
      } else {
        // Initialize from visit data
        const restaurant = restaurants.find(r => r.id === visit.restaurant);
        setSelectedRestaurant(restaurant || null);
        // Convert UTC datetime to local date for date picker
        const localDate = utcToLocalDateString(visit.visitDate);
        setVisitDate(localDate);
        // Initialize visibility from visit data
        setVisitVisibility(visit.visibility || 'friends');
      }
    }
  }, [visit, restaurants, visitId]);

  useEffect(() => {
    if (existingFoodItems.length > 0) {
      // Only initialize menu items if there's no draft
      const draft = editVisitDraftService.getDraft(visitId);
      if (!draft) {
        setMenuItems(existingFoodItems.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          rating: item.rating,
          notes: item.notes || '',
        })));
      }
    }
  }, [existingFoodItems, visitId]);

  // Save draft whenever state changes
  useEffect(() => {
    if (selectedRestaurant && menuItems.length > 0) {
      editVisitDraftService.saveDraft({
        visitId,
        restaurant: selectedRestaurant,
        menuItems,
        visitDate,
        visitVisibility,
        step,
      });
    }
  }, [visitId, selectedRestaurant, menuItems, visitDate, visitVisibility, step]);

  // Update visit mutation
  const updateVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !selectedRestaurant) throw new Error('Missing data');

      // Convert local date to UTC before saving
      const visitDateUTC = localDateStringToUTC(visitDate);

      // Update visit (restaurant field is not updated - user must delete to change restaurant)
      await pb.collection('visits').update(visitId, {
        visitDate: visitDateUTC,
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
      // Clear draft after successful save
      editVisitDraftService.clearDraft();
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
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
          <Button variant="ghost" size="sm" onClick={() => {
            // Clear draft when navigating back
            editVisitDraftService.clearDraft();
            onNavigateBack?.();
          }}>
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

        {/* Restaurant Info */}
        {selectedRestaurant && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-xs font-medium text-gray-500 mb-1">Restaurant</div>
            <div className="font-semibold text-sm text-gray-900">{selectedRestaurant.name}</div>
            {(selectedRestaurant.location || selectedRestaurant.cuisineType) && (
              <div className="text-xs text-gray-600 mt-0.5">
                {[selectedRestaurant.location, selectedRestaurant.cuisineType]
                  .filter(Boolean)
                  .join(' • ')}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2 italic">
              To change the restaurant, please delete this visit and create a new one.
            </p>
          </div>
        )}

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
                    {formatLocalDateForDisplay(visitDate)}
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
                  max={getTodayLocalDateString()}
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

        {/* Step 1: Edit Menu Items */}
        {step === 1 && selectedRestaurant && (
          <div className="space-y-4">
            {/* Quick Actions Container */}
            <Card className="border-2 border-blue-200 bg-blue-50/30">
              <CardContent className="pt-4 space-y-3">
                <Button
                  onClick={handleAddMenuItem}
                  variant="outline"
                  className="w-full bg-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Menu Item
                </Button>
              </CardContent>
            </Card>

            {/* Menu Items List Container */}
            {activeMenuItems.length > 0 && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="text-sm text-gray-600 mb-3">
                    Your Items ({activeMenuItems.length})
                  </div>

                  {activeMenuItems.map((item) => {
                    const index = menuItems.findIndex(m => m === item);
                    return (
                      <div key={index} className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                        <div className="flex items-start justify-between">
                          <Label className="text-sm font-semibold">Item {index + 1}</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMenuItem(index)}
                          >
                            {item.id ? <Trash2 className="w-4 h-4 text-red-600" /> : <X className="w-4 h-4" />}
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
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 2: Update Ratings */}
        {step === 2 && (
          <div className="space-y-4">
            {activeMenuItems.map((item) => {
              const index = menuItems.findIndex(m => m === item);
              return (
                <Card key={index}>
                  <CardContent className="pt-6 space-y-3">
                    <div>
                      <Label className="font-semibold">{item.name}</Label>
                      {item.description && (
                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                      )}
                    </div>

                    <div>
                      <Label>Rating</Label>
                      <div className="grid grid-cols-5 gap-2 mt-2">
                        {RATING_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleUpdateMenuItem(index, 'rating', option.value)}
                            className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-all ${
                              option.color
                            } ${
                              item.rating === option.value
                                ? 'ring-2 ring-offset-2 ring-blue-500'
                                : 'opacity-60 hover:opacity-100'
                            }`}
                          >
                            {option.value}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-600 mt-2 text-center">
                        {RATING_OPTIONS.find((o) => o.value === item.rating)?.label}
                      </p>
                    </div>

                    <div>
                      <Label>Notes (optional)</Label>
                      <Input
                        placeholder="Add notes..."
                        value={item.notes}
                        onChange={(e) => handleUpdateMenuItem(index, 'notes', e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Action Buttons - Fixed Footer */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          {step === 1 ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  // Clear draft when canceling
                  editVisitDraftService.clearDraft();
                  onNavigateBack?.();
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!canProceedFromStep2}
                className="flex-1"
              >
                Next: Update Ratings
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave || loading}
                className="flex-1"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
