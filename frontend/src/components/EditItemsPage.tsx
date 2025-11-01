import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pb, Restaurant, Visit, FoodItem } from '@/lib/pocketbase';
import { getTodayLocalDateString, utcToLocalDateString, formatLocalDateForDisplay } from '@/lib/dateUtils';
import { editVisitDraftService, EditVisitDraftItem } from '@/services/editVisitDraftService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, Trash2, Calendar, Users } from 'lucide-react';

interface EditItemsPageProps {
  visitId: string;
  onNext: () => void;
  onCancel: () => void;
}

export default function EditItemsPage({ visitId, onNext, onCancel }: EditItemsPageProps) {
  const [menuItems, setMenuItems] = useState<EditVisitDraftItem[]>([]);
  const [visitDate, setVisitDate] = useState(getTodayLocalDateString());
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>('friends');
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [error, setError] = useState('');

  // Fetch visit data
  const { data: visit, isLoading: visitLoading } = useQuery<Visit>({
    queryKey: ['visit', visitId],
    queryFn: async () => {
      return await pb.collection('visits').getOne<Visit>(visitId);
    },
  });

  // Fetch restaurants
  const { data: restaurants = [], isLoading: restaurantsLoading } = useQuery<Restaurant[]>({
    queryKey: ['restaurants'],
    queryFn: async () => {
      const user = pb.authStore.record;
      if (!user) return [];
      return await pb.collection('restaurants').getFullList<Restaurant>({
        filter: `createdBy = "${user.id}"`,
        sort: 'name',
      });
    },
  });

  // Fetch existing food items
  const { data: existingFoodItems = [], isLoading: foodItemsLoading } = useQuery<FoodItem[]>({
    queryKey: ['foodItems', visitId],
    queryFn: async () => {
      return await pb.collection('food_items').getFullList<FoodItem>({
        filter: `visit = "${visitId}"`,
        sort: 'created',
      });
    },
  });

  // Initialize form when data loads
  useEffect(() => {
    if (visit && !restaurantsLoading) {
      // Check if we have a draft for this visit
      const draft = editVisitDraftService.getDraft(visitId);

      if (draft) {
        // Restore from draft
        setSelectedRestaurant(draft.restaurant);
        setMenuItems(draft.menuItems);
        setVisitDate(draft.visitDate);
        setVisitVisibility(draft.visitVisibility);
      } else {
        // Initialize from visit data
        const restaurant = restaurants.find(r => r.id === visit.restaurant);

        // If restaurant not in user's list, fetch it directly
        if (!restaurant && visit.restaurant) {
          pb.collection('restaurants').getOne<Restaurant>(visit.restaurant)
            .then(fetchedRestaurant => {
              setSelectedRestaurant(fetchedRestaurant);
            })
            .catch(err => {
              console.error('Failed to fetch restaurant:', err);
              setError('Failed to load restaurant data');
            });
        } else {
          setSelectedRestaurant(restaurant || null);
        }

        const localDate = utcToLocalDateString(visit.visitDate);
        setVisitDate(localDate);
        setVisitVisibility(visit.visibility || 'friends');
      }
    }
  }, [visit, restaurants, restaurantsLoading, visitId]);

  useEffect(() => {
    // Only initialize menu items if there's no draft and data has loaded
    if (!foodItemsLoading) {
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
  }, [existingFoodItems, foodItemsLoading, visitId]);

  // Save draft whenever state changes
  useEffect(() => {
    if (selectedRestaurant && menuItems.length > 0) {
      editVisitDraftService.saveDraft({
        visitId,
        restaurant: selectedRestaurant,
        menuItems,
        visitDate,
        visitVisibility,
        step: 1,
      });
    }
  }, [visitId, selectedRestaurant, menuItems, visitDate, visitVisibility]);

  const handleAddMenuItem = () => {
    setMenuItems([...menuItems, { name: '', description: '', rating: 3, notes: '' }]);
  };

  const handleRemoveMenuItem = (index: number) => {
    const newItems = [...menuItems];
    const item = newItems[index];
    if (item.id) {
      // Mark existing item as deleted
      newItems[index] = { ...item, _deleted: true };
    } else {
      // Remove new item completely
      newItems.splice(index, 1);
    }
    setMenuItems(newItems);
  };

  const handleUpdateMenuItem = (index: number, field: string, value: any) => {
    const newItems = [...menuItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setMenuItems(newItems);
  };

  const activeMenuItems = menuItems.filter(item => !item._deleted);
  const canProceed = activeMenuItems.length > 0 && activeMenuItems.every(item => item.name.trim() !== '');

  // Show loading state
  const isLoading = visitLoading || restaurantsLoading || foodItemsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading visit...</p>
        </div>
      </div>
    );
  }

  if (!visit || !selectedRestaurant) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Visit not found</p>
          <Button onClick={onCancel} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">Edit Visit</h1>
        <p className="text-sm text-gray-600 mt-1">{selectedRestaurant.name}</p>
      </div>

      {/* Date and Visibility Section */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        {/* Date Selector */}
        <div className="mb-3">
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

        {/* Visibility Checkbox */}
        <div className="p-3 bg-white rounded-lg border border-gray-200">
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
                  ? 'Your friends will be able to see this visit and your ratings'
                  : 'Only you will be able to see this visit'}
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
      </div>

      {/* Bottom Action Buttons - Fixed Footer */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onNext} disabled={!canProceed} className="flex-1">
            Next: Update Ratings
          </Button>
        </div>
      </div>
    </div>
  );
}
