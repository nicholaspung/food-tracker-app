import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { getTodayLocalDateString, localDateStringToUTC, formatLocalDateForDisplay } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Calendar, Users, Images } from "lucide-react";
import { visitDraftService } from "@/services/visitDraftService";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";
import { usePhotoUpload, type PhotoUploadItem } from "@/hooks/usePhotoUpload";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import BulkPhotoGallery, { type BulkPhoto } from "@/components/BulkPhotoGallery";

interface RateItemsPageProps {
  onSubmit: () => void;
  onBack: () => void;
}

export default function RateItemsPage({
  onSubmit,
  onBack,
}: RateItemsPageProps) {
  const queryClient = useQueryClient();
  const draft = visitDraftService.getDraft();
  const [items, setItems] = useState(draft.items);
  const [visitDate, setVisitDate] = useState(draft.visitDate);
  const [visitVisibility, setVisitVisibility] = useState(draft.visitVisibility);
  const [showDateEdit, setShowDateEdit] = useState(false);

  // Photo mode state
  const [useBulkMode, setUseBulkMode] = useState(false);

  // Standard photo state - track photo for each item (max 1 for now)
  const [itemPhotos, setItemPhotos] = useState<Map<number, File>>(new Map());
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Map<number, string>>(new Map());

  // Bulk photo state
  const [bulkPhotos, setBulkPhotos] = useState<BulkPhoto[]>([]);

  // Check if user has rated before - expand legend for first-timers
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  // Ref for auto-scrolling notes input into view on mobile
  const notesInputRef = useScrollIntoView<HTMLInputElement>();

  // Photo upload hook for parallel uploads with progress
  const { state: uploadState, uploadPhotos, reset: resetUploadState } = usePhotoUpload();

  useEffect(() => {
    visitDraftService.saveMetadata(visitDate, visitVisibility);
  }, [visitDate, visitVisibility]);

  const saveVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !draft.restaurant) throw new Error("Missing data");

      // Convert local date to UTC before saving
      const visitDateUTC = localDateStringToUTC(visitDate);

      const visit = await pb.collection("visits").create({
        restaurant: draft.restaurant.id,
        user: user.id,
        visitDate: visitDateUTC,
        visibility: visitVisibility,
        notes: "",
      });

      // Create all food items first (sequentially to maintain order)
      const foodItemIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        const foodItem = await pb.collection("food_items").create({
          name: item.menuItem.name,
          description: item.description,
          visit: visit.id,
          rating: item.rating,
          notes: item.notes,
          user: user.id,
        });

        foodItemIds.push(foodItem.id);
      }

      // Collect all photos to upload in parallel
      const photoUploads: PhotoUploadItem[] = [];

      if (useBulkMode) {
        // Bulk mode: use assigned photos from bulk gallery
        for (let i = 0; i < items.length; i++) {
          const assignedPhotos = bulkPhotos.filter(
            (p) => p.assignedToIndex === i
          );
          for (const bulkPhoto of assignedPhotos) {
            photoUploads.push({
              photo: bulkPhoto.file,
              foodItemId: foodItemIds[i],
              visitId: visit.id,
              userId: user.id,
            });
          }
        }
      } else {
        // Standard mode: use individual item photos
        for (let i = 0; i < items.length; i++) {
          const photo = itemPhotos.get(i);
          if (photo) {
            photoUploads.push({
              photo,
              foodItemId: foodItemIds[i],
              visitId: visit.id,
              userId: user.id,
            });
          }
        }
      }

      // Upload all photos in parallel with progress tracking
      if (photoUploads.length > 0) {
        await uploadPhotos(photoUploads);
      }

      return visit;
    },
    onSuccess: async () => {
      // Wait for all queries to refetch before navigating away
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["visits"] }),
        queryClient.invalidateQueries({ queryKey: ["userVisits"] }),
        queryClient.invalidateQueries({ queryKey: ["allVisits"] }),
        queryClient.invalidateQueries({ queryKey: ["allFoodItems"] }),
      ]);

      visitDraftService.clearDraft();

      // Mark that user has rated before - legend will be collapsed next time
      localStorage.setItem("hasRatedBefore", "true");

      // Reset upload state
      resetUploadState();

      onSubmit();
    },
    onError: () => {
      // Reset upload state on error so user can retry
      resetUploadState();
    },
  });

  const handleUpdateItem = (
    index: number,
    field: "rating" | "notes",
    value: any
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    visitDraftService.updateItem(index, { [field]: value });
  };

  const handlePhotoCapture = (index: number, file: File) => {
    // Store the photo file
    const newPhotos = new Map(itemPhotos);
    newPhotos.set(index, file);
    setItemPhotos(newPhotos);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    const newPreviewUrls = new Map(photoPreviewUrls);

    // Revoke old URL if exists
    const oldUrl = newPreviewUrls.get(index);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    newPreviewUrls.set(index, previewUrl);
    setPhotoPreviewUrls(newPreviewUrls);
  };

  const handleRemovePhoto = (index: number) => {
    // Remove photo file
    const newPhotos = new Map(itemPhotos);
    newPhotos.delete(index);
    setItemPhotos(newPhotos);

    // Revoke and remove preview URL
    const previewUrl = photoPreviewUrls.get(index);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreviewUrls = new Map(photoPreviewUrls);
    newPreviewUrls.delete(index);
    setPhotoPreviewUrls(newPreviewUrls);
  };

  // Bulk photo handlers
  const handleBulkPhotosChange = (photos: BulkPhoto[]) => {
    setBulkPhotos(photos);
  };

  const handleAssignBulkPhoto = (photoId: string, itemIndex: number) => {
    setBulkPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId ? { ...photo, assignedToIndex: itemIndex } : photo
      )
    );
  };

  const handleRemoveBulkPhoto = (photoId: string) => {
    setBulkPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  };

  const togglePhotoMode = () => {
    setUseBulkMode(!useBulkMode);
  };

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
      bulkPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Rate Your Items</h1>
        <p className="text-sm text-gray-500 mt-1">{draft.restaurant?.name}</p>

        {/* Date picker */}
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
              checked={visitVisibility === "friends"}
              onChange={(e) =>
                setVisitVisibility(e.target.checked ? "friends" : "private")
              }
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium">
                  Friends can view this visit
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {visitVisibility === "friends"
                  ? "Your friends will be able to see this visit and your ratings"
                  : "Only you will be able to see this visit"}
              </p>
            </div>
          </label>
        </div>

        {/* Photo Mode Toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={togglePhotoMode}
            className="w-full p-3 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Images className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium">
                  {useBulkMode ? "Bulk Photo Mode" : "Individual Photo Mode"}
                </span>
              </div>
              <span className="text-xs text-blue-600">Tap to switch</span>
            </div>
            <p className="text-xs text-gray-500 text-left mt-1">
              {useBulkMode
                ? "Upload all photos at once, then assign to items"
                : "Add photos individually for each item"}
            </p>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Bulk Photo Gallery (when bulk mode is enabled) */}
          {useBulkMode && (
            <Card>
              <CardContent className="pt-4">
                <BulkPhotoGallery
                  photos={bulkPhotos}
                  items={items}
                  onPhotosChange={handleBulkPhotosChange}
                  onAssignPhoto={handleAssignBulkPhoto}
                  onRemovePhoto={handleRemoveBulkPhoto}
                  disabled={saveVisitMutation.isPending}
                />
              </CardContent>
            </Card>
          )}

          {/* Collapsible Rating Legend */}
          <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
            <CardContent className="px-4">
              <button
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="w-full flex items-center justify-between"
              >
                <Label className="text-sm font-semibold text-gray-700 cursor-pointer">
                  Rating Guide
                </Label>
                {isLegendExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </button>
              {isLegendExpanded && (
                <div className="space-y-2 mt-3">
                  {RATING_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center gap-3">
                      <div
                        className={`${option.color} text-white w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0`}
                      >
                        {option.value}
                      </div>
                      <span className="text-sm text-gray-700">
                        {option.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {items.map((item, index) => (
            <Card key={index}>
              <CardContent className="space-y-3">
                <div>
                  <Label className="font-semibold">{item.menuItem.name}</Label>
                  {item.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {item.description}
                    </p>
                  )}
                </div>

                <div>
                  <Label>Rating</Label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {RATING_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() =>
                          handleUpdateItem(index, "rating", option.value)
                        }
                        className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-all ${
                          option.color
                        } ${
                          item.rating === option.value
                            ? "ring-2 ring-offset-2 ring-blue-500"
                            : "opacity-60 hover:opacity-100"
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

                <div className="space-y-2">
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

                {/* Photo capture section (only in individual mode) */}
                {!useBulkMode && (
                  <MenuItemPhotoInput
                    photoKey={index}
                    newPhotoPreviewUrl={photoPreviewUrls.get(index)}
                    onPhotoCapture={handlePhotoCapture}
                    onRemoveNewPhoto={handleRemovePhoto}
                    showLabel={true}
                    showNewPhotoBadge={false}
                  />
                )}

                {/* Show assigned bulk photos count */}
                {useBulkMode && (
                  <div className="text-sm text-gray-600">
                    {bulkPhotos.filter((p) => p.assignedToIndex === index).length > 0 ? (
                      <span className="text-green-600 font-medium">
                        ✓ {bulkPhotos.filter((p) => p.assignedToIndex === index).length} photo(s) assigned
                      </span>
                    ) : (
                      <span className="text-gray-500">No photos assigned</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom Action Buttons */}
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
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            onClick={() => saveVisitMutation.mutate()}
            disabled={saveVisitMutation.isPending}
            className="flex-1"
          >
            {saveVisitMutation.isPending ? "Saving..." : "Save Visit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
