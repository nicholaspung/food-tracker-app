import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { localDateStringToUTC } from "@/lib/dateUtils";
import { repositories, type VisitPhoto } from '@/repositories';
import {
  editVisitDraftService,
  EditVisitDraftItem,
} from "@/services/editVisitDraftService";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import { usePhotoUpload, type PhotoUploadItem } from "@/hooks/photos/usePhotoUpload";
import MenuItemPhotoInput from "@/components/visits/shared/MenuItemPhotoInput";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { RatingSelector } from "@/components/ui/RatingSelector";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { VisibilityToggle } from "@/components/ui/VisibilityToggle";
import { usePhotoManager } from "@/hooks/photos/usePhotoManager";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";
import { useTrackEvent } from "@/hooks/ui/useTrackEvent";
import { ANALYTICS_EVENTS } from "@/constants/analyticsEvents";

interface EditRateItemsPageProps {
  visitId: string;
  onBack: () => void;
  onComplete: () => void;
}

export default function EditRateItemsPage({
  visitId,
  onBack,
  onComplete,
}: EditRateItemsPageProps) {
  const queryClient = useQueryClient();
  const draft = editVisitDraftService.getDraft(visitId);
  const { error, handleError, clearError } = useErrorHandler({
    source: 'EditRateItemsPage',
    defaultSeverity: 'error',
  });
  const trackEvent = useTrackEvent();
  const [isInitialized, setIsInitialized] = useState(false);

  const [menuItems, setMenuItems] = useState<EditVisitDraftItem[]>(
    draft?.menuItems || []
  );
  const [visitDate, setVisitDate] = useState(draft?.visitDate || "");
  const [visitVisibility, setVisitVisibility] = useState<"friends" | "private">(
    draft?.visitVisibility || "friends"
  );

  // Photo management hook - track photo for each item (using food_item id as key)
  const {
    photos: itemPhotos,
    previewUrls: photoPreviewUrls,
    handleCapture,
    handleRemove,
  } = usePhotoManager<string>(true);

  // Wrap handlers to match MenuItemPhotoInput signature
  const handlePhotoCapture = (foodItemId: string | number, file: File) => {
    handleCapture(String(foodItemId), file);
  };

  const handleRemovePhoto = (foodItemId: string | number) => {
    handleRemove(String(foodItemId));
  };

  const [deletedPhotoIds, setDeletedPhotoIds] = useState<Set<string>>(
    new Set()
  );

  // Ref for auto-scrolling notes input into view on mobile
  const notesInputRef = useScrollIntoView<HTMLInputElement>();

  // Photo upload hook for parallel uploads with progress
  const {
    state: uploadState,
    uploadPhotos,
    reset: resetUploadState,
  } = usePhotoUpload();
  const isKeyboardVisible = useKeyboardVisible();

  // Fetch existing photos for this visit
  const { data: existingPhotos = [] } = useQuery<VisitPhoto[]>({
    queryKey: ["visitPhotos", visitId],
    queryFn: async () => {
      return await repositories.visitPhotos.getByVisit(visitId);
    },
  });

  // Create a Map for O(1) photo lookups by food_item ID
  const existingPhotosByFoodItem = useMemo(() => {
    const map = new Map<string, VisitPhoto>();
    existingPhotos.forEach((photo) => {
      if (photo.food_item) {
        map.set(photo.food_item, photo);
      }
    });
    return map;
  }, [existingPhotos]);

  // Only check for draft on initial mount
  useEffect(() => {
    if (
      !draft ||
      !draft.restaurant ||
      draft.menuItems.filter((i) => !i._deleted).length === 0
    ) {
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

  // Mark an existing photo for deletion
  const handleDeleteExistingPhoto = (foodItemId: string | number) => {
    const id = String(foodItemId);
    const existingPhoto = existingPhotosByFoodItem.get(id);
    if (existingPhoto) {
      const newDeletedIds = new Set(deletedPhotoIds);
      newDeletedIds.add(existingPhoto.id);
      setDeletedPhotoIds(newDeletedIds);
    }
  };

  // Get existing photo URL for a food item (only if not marked for deletion)
  const getExistingPhotoUrl = (foodItemId: string) => {
    const existingPhoto = existingPhotosByFoodItem.get(foodItemId);
    if (existingPhoto && !deletedPhotoIds.has(existingPhoto.id)) {
      return pb.files.getURL(existingPhoto, existingPhoto.photo);
    }
    return null;
  };

  const updateVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !draft || !draft.restaurant) throw new Error("Missing data");

      // Convert local date to UTC before saving
      const visitDateUTC = localDateStringToUTC(visitDate);

      // Update visit
      await repositories.visits.update(visitId, {
        visitDate: visitDateUTC,
        visibility: visitVisibility,
      });

      // Delete marked photos first
      for (const photoId of deletedPhotoIds) {
        await repositories.visitPhotos.delete(photoId);
      }

      // Track photo uploads for parallel processing
      const photoUploads: PhotoUploadItem[] = [];

      // Handle food items
      for (const item of menuItems) {
        if (item._deleted && item.id) {
          // Delete existing item and its photos
          await repositories.foodItems.delete(item.id);
          // Photos will be cascade deleted by backend
        } else if (item.id) {
          // Update existing item
          await repositories.foodItems.update(item.id, {
            name: item.name,
            description: item.description,
            rating: item.rating,
            notes: item.notes,
          });

          // Check for photo to upload
          const newPhoto = itemPhotos.get(item.id);
          if (newPhoto) {
            const existingPhoto = existingPhotosByFoodItem.get(item.id);
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
          const foodItem = await repositories.foodItems.create({
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
      // Track visit updated
      const itemsAdded = menuItems.filter(item => !item.id && !item._deleted).length;
      const itemsDeleted = menuItems.filter(item => item._deleted).length;
      const photosAdded = Array.from(itemPhotos.values()).length;

      trackEvent(ANALYTICS_EVENTS.VISIT_UPDATED, {
        source: 'EditRateItemsPage',
        itemsAdded,
        itemsDeleted,
        photosAdded,
        photosDeleted: deletedPhotoIds.size,
        totalItems: menuItems.filter(item => !item._deleted).length,
      });

      queryClient.invalidateQueries({ queryKey: ["allVisits"] });
      queryClient.invalidateQueries({ queryKey: ["visit", visitId] });
      queryClient.invalidateQueries({ queryKey: ["foodItems", visitId] });
      queryClient.invalidateQueries({ queryKey: ["allFoodItems"] });
      queryClient.invalidateQueries({ queryKey: ["visitPhotos", visitId] });
      queryClient.invalidateQueries({ queryKey: ["allVisitPhotos"] });
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
    onError: (err: unknown) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.UPDATE_FAILED("visit") });
      // Reset upload state on error so user can retry
      resetUploadState();
    },
  });

  const handleUpdateItem = (
    index: number,
    field: "rating" | "notes",
    value: any
  ) => {
    const newItems = [...menuItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setMenuItems(newItems);
  };

  const handleSave = () => {
    updateVisitMutation.mutate();
  };

  const activeMenuItems = menuItems.filter((item) => !item._deleted);

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
        <ErrorDisplay error={error} onClear={clearError} />

        <div className="space-y-4">
          {/* Date and Visibility Card */}
          {/* Date picker */}
          <DatePickerField
            value={visitDate}
            onChange={setVisitDate}
            label="Visit Date"
          />

          {/* Visibility Checkbox */}
          <VisibilityToggle
            value={visitVisibility}
            onChange={setVisitVisibility}
            entityType="visit"
          />

          {activeMenuItems.map((item) => {
            const index = menuItems.findIndex((m) => m === item);
            return (
              <Card key={index}>
                <CardContent className="pt-6 space-y-3">
                  <div>
                    <Label className="font-semibold">{item.name}</Label>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Rating</Label>
                    <div className="mt-2">
                      <RatingSelector
                        value={item.rating}
                        onChange={(value) =>
                          handleUpdateItem(index, "rating", value)
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Notes (optional)</Label>
                    <Input
                      ref={notesInputRef}
                      placeholder="Add notes..."
                      value={item.notes}
                      onChange={(e) =>
                        handleUpdateItem(index, "notes", e.target.value)
                      }
                    />
                  </div>

                  {/* Photo capture section */}
                  {(() => {
                    // Get photo key (existing id or temp key for new items)
                    const photoKey = item.id || `new_${index}`;
                    const existingPhotoUrl = item.id
                      ? getExistingPhotoUrl(item.id)
                      : null;

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
          {uploadState.status !== "idle" && uploadState.status !== "error" && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm font-medium ${uploadState.status === "complete" ? "text-green-700" : "text-gray-700"}`}
                >
                  {uploadState.currentOperation}
                </span>
                <span
                  className={`text-sm font-medium ${uploadState.status === "complete" ? "text-green-700" : "text-gray-700"}`}
                >
                  {uploadState.progress}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${uploadState.status === "complete" ? "bg-green-600" : "bg-blue-600"}`}
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} className="flex-1">
              Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateVisitMutation.isPending}
              className="flex-1"
            >
              {updateVisitMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
