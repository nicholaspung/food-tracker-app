import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { localDateStringToUTC } from '@/lib/dateUtils';
import { editVisitDraftService, EditVisitDraftItem } from '@/services/editVisitDraftService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, X } from 'lucide-react';
import { useScrollIntoView } from '@/hooks/useScrollIntoView';
import { compressDishPhoto } from '@/services/photoService';
import { RATING_OPTIONS } from '@/lib/ratingConstants';

interface EditRateItemsPageProps {
  visitId: string;
  onBack: () => void;
  onComplete: () => void;
}

export default function EditRateItemsPage({ visitId, onBack, onComplete }: EditRateItemsPageProps) {
  const queryClient = useQueryClient();
  const draft = editVisitDraftService.getDraft(visitId);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const [menuItems, setMenuItems] = useState<EditVisitDraftItem[]>(draft?.menuItems || []);

  // Photo state - track photo for each item (using food_item id as key)
  const [itemPhotos, setItemPhotos] = useState<Map<string, File>>(new Map());
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Map<string, string>>(new Map());
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<Set<string>>(new Set());
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Ref for auto-scrolling notes input into view on mobile
  const notesInputRef = useScrollIntoView<HTMLInputElement>();

  // Fetch existing photos for this visit
  const { data: existingPhotos = [] } = useQuery({
    queryKey: ['visitPhotos', visitId],
    queryFn: async () => {
      return await pb.collection('visit_photos').getFullList({
        filter: `visit = "${visitId}"`,
      });
    },
  });

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

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handlePhotoCapture = (foodItemId: string, file: File) => {
    // Store the photo file
    const newPhotos = new Map(itemPhotos);
    newPhotos.set(foodItemId, file);
    setItemPhotos(newPhotos);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    const newPreviewUrls = new Map(photoPreviewUrls);

    // Revoke old URL if exists
    const oldUrl = newPreviewUrls.get(foodItemId);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    newPreviewUrls.set(foodItemId, previewUrl);
    setPhotoPreviewUrls(newPreviewUrls);
  };

  const handleRemovePhoto = (foodItemId: string) => {
    // Remove photo file
    const newPhotos = new Map(itemPhotos);
    newPhotos.delete(foodItemId);
    setItemPhotos(newPhotos);

    // Revoke and remove preview URL
    const previewUrl = photoPreviewUrls.get(foodItemId);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreviewUrls = new Map(photoPreviewUrls);
    newPreviewUrls.delete(foodItemId);
    setPhotoPreviewUrls(newPreviewUrls);
  };

  // Mark an existing photo for deletion
  const handleDeleteExistingPhoto = (foodItemId: string) => {
    const existingPhoto = existingPhotos.find((p: any) => p.food_item === foodItemId);
    if (existingPhoto) {
      const newDeletedIds = new Set(deletedPhotoIds);
      newDeletedIds.add(existingPhoto.id);
      setDeletedPhotoIds(newDeletedIds);
    }
  };

  // Get existing photo URL for a food item (only if not marked for deletion)
  const getExistingPhotoUrl = (foodItemId: string) => {
    const existingPhoto = existingPhotos.find((p: any) => p.food_item === foodItemId);
    if (existingPhoto && !deletedPhotoIds.has(existingPhoto.id)) {
      return pb.files.getURL(existingPhoto, existingPhoto.photo);
    }
    return null;
  };

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

      // Delete marked photos first
      for (const photoId of deletedPhotoIds) {
        await pb.collection('visit_photos').delete(photoId);
      }

      // Handle food items
      for (const item of menuItems) {
        if (item._deleted && item.id) {
          // Delete existing item and its photos
          await pb.collection('food_items').delete(item.id);
          // Photos will be cascade deleted by backend
        } else if (item.id) {
          // Update existing item
          await pb.collection('food_items').update(item.id, {
            name: item.name,
            description: item.description,
            rating: item.rating,
            notes: item.notes,
          });

          // Handle photo for existing item
          const newPhoto = itemPhotos.get(item.id);
          if (newPhoto) {
            // Compress the photo before upload
            const compressedPhoto = await compressDishPhoto(newPhoto);

            // Check if there's an existing photo to replace
            const existingPhoto = existingPhotos.find((p: any) => p.food_item === item.id);
            if (existingPhoto) {
              // Update existing photo
              const formData = new FormData();
              formData.append('photo', compressedPhoto);
              await pb.collection('visit_photos').update(existingPhoto.id, formData);
            } else {
              // Create new photo
              const formData = new FormData();
              formData.append('photo', compressedPhoto);
              formData.append('visit', visitId);
              formData.append('food_item', item.id);
              formData.append('user', user.id);
              await pb.collection('visit_photos').create(formData);
            }
          }
        } else if (!item._deleted) {
          // Create new item
          const foodItem = await pb.collection('food_items').create({
            name: item.name,
            description: item.description,
            visit: visitId,
            rating: item.rating,
            notes: item.notes,
            user: user.id,
          });

          // Handle photo for new item (use temporary key)
          const tempKey = `new_${menuItems.indexOf(item)}`;
          const newPhoto = itemPhotos.get(tempKey);
          if (newPhoto) {
            // Compress the photo before upload
            const compressedPhoto = await compressDishPhoto(newPhoto);

            // Create photo
            const formData = new FormData();
            formData.append('photo', compressedPhoto);
            formData.append('visit', visitId);
            formData.append('food_item', foodItem.id);
            formData.append('user', user.id);
            await pb.collection('visit_photos').create(formData);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['foodItems', visitId] });
      queryClient.invalidateQueries({ queryKey: ['allFoodItems'] });
      queryClient.invalidateQueries({ queryKey: ['visitPhotos', visitId] });
      queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] });
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
                      ref={notesInputRef}
                      placeholder="Add notes..."
                      value={item.notes}
                      onChange={(e) => handleUpdateItem(index, 'notes', e.target.value)}
                    />
                  </div>

                  {/* Photo capture section */}
                  <div className="space-y-2">
                    <Label>Photo (optional)</Label>

                    {(() => {
                      // Get photo key (existing id or temp key for new items)
                      const photoKey = item.id || `new_${index}`;
                      const hasNewPhoto = photoPreviewUrls.has(photoKey);
                      const existingPhotoUrl = item.id ? getExistingPhotoUrl(item.id) : null;
                      const hasExistingPhoto = !!existingPhotoUrl;

                      return (
                        <>
                          {!hasNewPhoto && !hasExistingPhoto ? (
                            <>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                ref={(el) => {
                                  if (el) fileInputRefs.current.set(photoKey, el);
                                }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handlePhotoCapture(photoKey, file);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => fileInputRefs.current.get(photoKey)?.click()}
                              >
                                <Camera className="w-4 h-4 mr-2" />
                                Take Photo
                              </Button>
                              <p className="text-xs text-gray-500 text-center">
                                Tip: Frame your dish in the center for better sharing photos
                              </p>
                            </>
                          ) : hasNewPhoto ? (
                            <div className="relative">
                              <img
                                src={photoPreviewUrls.get(photoKey)}
                                alt="Dish preview"
                                className="w-full h-48 object-cover rounded-lg"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute top-2 right-2"
                                onClick={() => handleRemovePhoto(photoKey)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                              <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                                New photo
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <img
                                src={existingPhotoUrl!}
                                alt="Existing dish photo"
                                className="w-full h-48 object-cover rounded-lg"
                              />
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                ref={(el) => {
                                  if (el) fileInputRefs.current.set(photoKey, el);
                                }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handlePhotoCapture(photoKey, file);
                                  }
                                }}
                              />
                              <div className="absolute top-2 right-2 flex gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => fileInputRefs.current.get(photoKey)?.click()}
                                >
                                  <Camera className="w-4 h-4 mr-1" />
                                  Replace
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteExistingPhoto(photoKey)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
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
