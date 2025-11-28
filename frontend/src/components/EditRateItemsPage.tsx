import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { localDateStringToUTC, getTodayLocalDateString, formatLocalDateForDisplay } from '@/lib/dateUtils';
import { editVisitDraftService, EditVisitDraftItem } from '@/services/editVisitDraftService';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Users } from 'lucide-react';
import { useScrollIntoView } from '@/hooks/useScrollIntoView';
import { usePhotoUpload, type PhotoUploadItem } from '@/hooks/usePhotoUpload';
import { RATING_OPTIONS } from '@/lib/ratingConstants';
import MenuItemPhotoInput from '@/components/MenuItemPhotoInput';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';

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
  const [visitDate, setVisitDate] = useState(draft?.visitDate || '');
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>(draft?.visitVisibility || 'friends');
  const [showDateEdit, setShowDateEdit] = useState(false);

  // Photo state - track photo for each item (using food_item id as key)
  const [itemPhotos, setItemPhotos] = useState<Map<string, File>>(new Map());
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Map<string, string>>(new Map());
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<Set<string>>(new Set());

  // Ref for auto-scrolling notes input into view on mobile
  const notesInputRef = useScrollIntoView<HTMLInputElement>();

  // Photo upload hook for parallel uploads with progress
  const { state: uploadState, uploadPhotos, reset: resetUploadState } = usePhotoUpload();
  const isKeyboardVisible = useKeyboardVisible();

  // Fetch existing photos for this visit
  const { data: existingPhotos = [] } = useQuery({
    queryKey: ['visitPhotos', visitId],
    queryFn: async () => {
      return await pb.collection('visit_photos').getFullList({
        filter: `visit = "${visitId}"`,
      });
    },
  });

  // Only check for draft on initial mount
  useEffect(() => {
    if (!draft || !draft.restaurant || draft.menuItems.filter(i => !i._deleted).length === 0) {
      onBack();
    } else {
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount to avoid redirect during save

  // Save draft whenever ratings or date/visibility change
  useEffect(() => {
    if (draft && draft.restaurant) {
      editVisitDraftService.saveDraft({
        ...draft,
        menuItems,
        visitDate,
        visitVisibility,
        step: 2,
      });
    }
  }, [menuItems, visitDate, visitVisibility, draft]);

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
      const visitDateUTC = localDateStringToUTC(visitDate);

      // Update visit
      await pb.collection('visits').update(visitId, {
        visitDate: visitDateUTC,
        visibility: visitVisibility,
      });

      // Delete marked photos first
      for (const photoId of deletedPhotoIds) {
        await pb.collection('visit_photos').delete(photoId);
      }

      // Track photo uploads for parallel processing
      const photoUploads: PhotoUploadItem[] = [];

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

          // Check for photo to upload
          const newPhoto = itemPhotos.get(item.id);
          if (newPhoto) {
            const existingPhoto = existingPhotos.find((p: any) => p.food_item === item.id);
            photoUploads.push({
              photo: newPhoto,
              foodItemId: item.id,
              visitId,
              userId: user.id,
              existingPhotoId: existingPhoto?.id,
            });
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

          // Check for photo to upload (use temporary key)
          const tempKey = `new_${menuItems.indexOf(item)}`;
          const newPhoto = itemPhotos.get(tempKey);
          if (newPhoto) {
            photoUploads.push({
              photo: newPhoto,
              foodItemId: foodItem.id,
              visitId,
              userId: user.id,
            });
          }
        }
      }

      // Upload all photos in parallel with progress tracking
      if (photoUploads.length > 0) {
        await uploadPhotos(photoUploads);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['foodItems', visitId] });
      queryClient.invalidateQueries({ queryKey: ['allFoodItems'] });
      queryClient.invalidateQueries({ queryKey: ['visitPhotos', visitId] });
      queryClient.invalidateQueries({ queryKey: ['allVisitPhotos'] });
      // Reset upload state
      resetUploadState();
      // Navigate first, then clear draft
      // The layout will also clear the draft when detecting navigation away
      onComplete();
      // Clear draft after a small delay to avoid race condition with redirect logic
      setTimeout(() => {
        editVisitDraftService.clearDraft();
      }, 100);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update visit');
      // Reset upload state on error so user can retry
      resetUploadState();
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
          {/* Date and Visibility Card */}
          <Card>
            <CardContent className="space-y-3">
              {/* Date picker */}
              {visitDate && (
                <div>
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
            </CardContent>
          </Card>

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
                  {(() => {
                    // Get photo key (existing id or temp key for new items)
                    const photoKey = item.id || `new_${index}`;
                    const existingPhotoUrl = item.id ? getExistingPhotoUrl(item.id) : null;

                    return (
                      <MenuItemPhotoInput
                        photoKey={photoKey}
                        newPhotoPreviewUrl={photoPreviewUrls.get(photoKey)}
                        existingPhotoUrl={existingPhotoUrl || undefined}
                        onPhotoCapture={handlePhotoCapture}
                        onRemoveNewPhoto={handleRemovePhoto}
                        onDeleteExistingPhoto={handleDeleteExistingPhoto}
                        showLabel={true}
                        showNewPhotoBadge={true}
                      />
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Buttons - Fixed Footer */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          {/* Error display */}
          {uploadState.error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">
                <strong>Upload failed:</strong> {uploadState.error}
              </p>
              <p className="text-xs text-red-500 mt-1">
                Check the browser console for details.
              </p>
            </div>
          )}

          {/* Progress indicator for photo uploads */}
          {uploadState.status !== 'idle' && uploadState.status !== 'error' && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${uploadState.status === 'complete' ? 'text-green-700' : 'text-gray-700'}`}>
                  {uploadState.currentOperation}
                </span>
                <span className={`text-sm font-medium ${uploadState.status === 'complete' ? 'text-green-700' : 'text-gray-700'}`}>
                  {uploadState.progress}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${uploadState.status === 'complete' ? 'bg-green-600' : 'bg-blue-600'}`}
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

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
      )}
    </div>
  );
}
