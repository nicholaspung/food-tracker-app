import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { localDateStringToUTC } from '@/lib/dateUtils';
import { editVisitDraftService, EditVisitDraftItem } from '@/services/editVisitDraftService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EditRateItemsPageProps {
  visitId: string;
  onBack: () => void;
  onComplete: () => void;
}

const RATING_OPTIONS = [
  { value: 1, label: "Don't eat ever", color: 'bg-red-500' },
  { value: 2, label: 'Try once', color: 'bg-orange-500' },
  { value: 3, label: 'Eat once in a while', color: 'bg-yellow-500' },
  { value: 4, label: 'Eat occasionally', color: 'bg-lime-500' },
  { value: 5, label: 'Eat often', color: 'bg-green-500' },
];

export default function EditRateItemsPage({ visitId, onBack, onComplete }: EditRateItemsPageProps) {
  const queryClient = useQueryClient();
  const draft = editVisitDraftService.getDraft(visitId);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const [menuItems, setMenuItems] = useState<EditVisitDraftItem[]>(draft?.menuItems || []);

  // Redirect if no draft
  useEffect(() => {
    if (!draft || !draft.restaurant || draft.menuItems.filter(i => !i._deleted).length === 0) {
      onBack();
    } else {
      setIsInitialized(true);
    }
  }, [draft, onBack]);

  // Save draft whenever ratings change
  useEffect(() => {
    if (draft && draft.restaurant) {
      editVisitDraftService.saveDraft({
        ...draft,
        menuItems,
        step: 2,
      });
    }
  }, [menuItems, draft]);

  const updateVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !draft || !draft.restaurant) throw new Error('Missing data');

      // Convert local date to UTC before saving
      const visitDateUTC = localDateStringToUTC(draft.visitDate);

      // Update visit
      await pb.collection('visits').update(visitId, {
        visitDate: visitDateUTC,
        visibility: draft.visitVisibility,
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
        } else if (!item._deleted) {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['foodItems', visitId] });
      queryClient.invalidateQueries({ queryKey: ['allFoodItems'] });
      // Clear draft after successful save
      editVisitDraftService.clearDraft();
      onComplete();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update visit');
    },
  });

  const handleUpdateItem = (index: number, field: 'rating' | 'notes', value: any) => {
    const newItems = [...menuItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setMenuItems(newItems);
  };

  const handleSave = () => {
    updateVisitMutation.mutate();
  };

  const activeMenuItems = menuItems.filter(item => !item._deleted);

  // Show loading state while checking draft
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!draft || !draft.restaurant || activeMenuItems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">Update Ratings</h1>
        <p className="text-sm text-gray-600 mt-1">{draft.restaurant.name}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

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
                          onClick={() => handleUpdateItem(index, 'rating', option.value)}
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
                      onChange={(e) => handleUpdateItem(index, 'notes', e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Buttons - Fixed Footer */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateVisitMutation.isPending}
            className="flex-1"
          >
            {updateVisitMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
